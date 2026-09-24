import { sanitizeLog } from '../../../lib/sanitizeLog';
import { technicalLogger } from '../../../lib/technicalLogger';

describe('Technical Logger & Sanitizer', () => {
  beforeEach(() => {
    technicalLogger.clear();
  });

  describe('sanitizeLog', () => {
    test('masks 64-char hexadecimal private keys', () => {
      const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const raw = `Erreur avec la clé 0x${hexKey} pendant la signature`;
      const cleaned = sanitizeLog(raw);
      expect(cleaned).not.toContain(hexKey);
      expect(cleaned).toContain('[CLÉ_PRIVÉE_MASQUÉE]');
    });

    test('masks Solana base58 private keys (~88 characters)', () => {
      const validB58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let solKey = '';
      for (let i = 0; i < 88; i++) solKey += validB58[i % validB58.length];
      const raw = `Erreur avec clé ${solKey} sur cluster`;
      const cleaned = sanitizeLog(raw);
      expect(cleaned).not.toContain(solKey);
      expect(cleaned).toContain('[CLÉ_SOL_MASQUÉE]');
    });

    test('shortens EVM public addresses without leaking full address', () => {
      const addr = '0x71C84180248237713974383C0D360ca4d3aBA704';
      const raw = `Transfer to ${addr}`;
      const cleaned = sanitizeLog(raw);
      expect(cleaned).toBe('Transfer to 0x71C8...A704');
    });

    test('masks sensitive keywords like mnemonic or password', () => {
      const raw = 'Connexion avec password="super_secret_password" et private_key: abc';
      const cleaned = sanitizeLog(raw);
      expect(cleaned).toContain('password=[MASQUÉ]');
      expect(cleaned).not.toContain('super_secret_password');
    });
  });

  describe('technicalLogger buffer and helpers', () => {
    test('tampon circulaire : plafonné, et ce sont les PLUS ANCIENS qui sortent', () => {
      /*
       * On teste le comportement, pas la constante. L'ancienne version exigeait
       * exactement 60 — c'était la valeur du moment, pas une exigence — et elle
       * a donc cassé au premier changement de profondeur, pour rien.
       */
      const CAP = 300;
      const total = CAP + 40;
      for (let i = 0; i < total; i++) {
        technicalLogger.log('SYS', `Action event ${i}`);
      }
      const logs = technicalLogger.getRecentLogs(total);
      expect(logs.length).toBeLessThanOrEqual(CAP);
      // Le plus récent est conservé, le plus ancien a été évincé.
      expect(logs[logs.length - 1].message).toBe(`Action event ${total - 1}`);
      expect(logs.some((l) => l.message === 'Action event 0')).toBe(false);
    });

    test('detects errors and provides error logs', () => {
      expect(technicalLogger.hasErrors()).toBe(false);
      technicalLogger.logRpc('eth_getBalance', 200);
      expect(technicalLogger.hasErrors()).toBe(false);

      technicalLogger.logRpc('eth_estimateGas', 500, 'execution reverted: insufficient gas');
      expect(technicalLogger.hasErrors()).toBe(true);

      const errs = technicalLogger.getErrorLogs();
      expect(errs.length).toBe(1);
      expect(errs[0]).toContain('insufficient gas');
    });

    test('logs transaction steps and dApp events properly sanitized', () => {
      technicalLogger.logTx('step_1_address', { recipient: '0x71C84180248237713974383C0D360ca4d3aBA704', status: 'valid' });
      technicalLogger.logDapp('connect_request', 'https://app.uniswap.org');

      const formatted = technicalLogger.getFormattedLogs();
      expect(formatted).toContain('[TX]');
      expect(formatted).toContain('0x71C8...A704');
      expect(formatted).toContain('[DAPP]');
      expect(formatted).toContain('https://app.uniswap.org');
    });

    test('formats condensed logs cleanly without raw stringified JSON', () => {
      technicalLogger.logRpc('eth_getBalance', 500, 'Réseau indisponible', { chain: 'Swellchain' });
      const condensed = technicalLogger.getCondensedLogs();
      expect(condensed).not.toContain('{"');
      expect(condensed).toContain('[RPC] Swellchain: eth_getBalance -> 500 (Réseau indisponible)');
    });

    test('correlates detected error for target chain and labels background calls', () => {
      technicalLogger.logRpc('eth_getBalance', 500, 'Réseau indisponible', { chain: 'Swellchain' });
      
      // Si la cible est Swellchain
      const errSwell = technicalLogger.getDetectedError('Swellchain');
      expect(errSwell).toBe('RPC 500 (Réseau indisponible) sur eth_getBalance');

      // Si la cible est Sepolia (sans erreur sur Sepolia)
      const errSepolia = technicalLogger.getDetectedError('Sepolia');
      expect(errSepolia).toContain('Aucune erreur sur Sepolia');
      expect(errSepolia).toContain('Swellchain en arrière-plan');

      // Ticket logs pour Sepolia : le bruit d'arrière-plan est RÉSUMÉ, pas listé.
      const ticketLogs = technicalLogger.getCondensedTicketLogs('Sepolia');
      expect(ticketLogs).toContain('[Sepolia] Aucun log d\'exécution direct enregistré pour cette chaîne.');
      expect(ticketLogs).toContain('Arrière-plan, sans rapport probable');
      expect(ticketLogs).toContain('Swellchain');
      // Le détail ligne à ligne disparaît : coller trois échecs de réseaux sans
      // rapport sous le vrai problème faisait croire à une corrélation.
      expect(ticketLogs).not.toContain('[RPC] Swellchain: eth_getBalance -> 500');
    });

    test('un log dApp porte sa chaîne et n\'est plus écarté des tickets ciblés', () => {
      // Le défaut : logDapp ne transmettait pas `chain`, donc matchesChain
      // échouait et un ticket « problème sur Bitcoin » excluait justement les
      // lignes WalletConnect — puis concluait « aucune erreur dans les logs ».
      technicalLogger.logDapp('btc_signMessage', undefined, {
        chain: 'bitcoin',
        resolvedProtocol: 'bip322',
        signatureBytes: 108,
      });
      const ticketLogs = technicalLogger.getCondensedTicketLogs('bitcoin');
      expect(ticketLogs).toContain('btc_signMessage');
      expect(ticketLogs).not.toContain('Aucun log d\'exécution direct');
    });

    test('rapporte une opération réussie quand aucune erreur n\'a été levée', () => {
      // Une signature produite correctement puis refusée par la dApp ne porte
      // aucun isError. L'ancien code répondait « aucune erreur », en taisant la
      // seule ligne utile du diagnostic.
      technicalLogger.logDapp('btc_signMessage', undefined, {
        chain: 'bitcoin',
        resolvedProtocol: 'ecdsa',
        signatureBytes: 65,
      });
      const detected = technicalLogger.getDetectedError('bitcoin');
      expect(detected).toContain('Aucune erreur côté wallet');
      expect(detected).toContain('btc_signMessage');
      expect(detected).toContain('resolvedProtocol=ecdsa');
      expect(detected).toContain('signatureBytes=65');
      // La chaîne elle-même n'est pas répétée dans les faits : elle est le contexte.
      expect(detected).not.toContain('chain=bitcoin');
    });
  });
});
