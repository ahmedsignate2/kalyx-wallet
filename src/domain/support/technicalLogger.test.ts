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
    test('circular buffer caps at 60 entries', () => {
      for (let i = 0; i < 75; i++) {
        technicalLogger.log('SYS', `Action event ${i}`);
      }
      const logs = technicalLogger.getRecentLogs(100);
      expect(logs.length).toBe(60);
      expect(logs[logs.length - 1].message).toBe('Action event 74');
      expect(logs[0].message).toBe('Action event 15');
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

      // Ticket logs pour Sepolia
      const ticketLogs = technicalLogger.getCondensedTicketLogs('Sepolia');
      expect(ticketLogs).toContain('[Sepolia] Aucun log d\'exécution direct enregistré pour cette chaîne.');
      expect(ticketLogs).toContain('(Appel global multi-chaînes d\'arrière-plan) :');
      expect(ticketLogs).toContain('[RPC] Swellchain: eth_getBalance -> 500 (Réseau indisponible)');
    });
  });
});
