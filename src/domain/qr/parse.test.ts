import { parseQr } from './parse';

const EVM = '0x742d35cc6634c0532925a3b844bc454e4438f44e'; // minuscule = sans checksum
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('parseQr — adresses nues', () => {
  it('adresse EVM', () => {
    const r = parseQr(EVM);
    expect(r.kind).toBe('evm-address');
    if (r.kind === 'evm-address') expect(r.address.toLowerCase()).toBe(EVM);
  });
  it('adresse Solana', () => {
    expect(parseQr(SOL)).toEqual({ kind: 'solana-address', address: SOL });
  });
  it('adresse Bitcoin', () => {
    expect(parseQr(BTC)).toEqual({ kind: 'bitcoin-address', address: BTC });
  });
  it('espaces autour tolérés', () => {
    expect(parseQr(`  ${SOL}  `).kind).toBe('solana-address');
  });
});

describe('parseQr — URIs de paiement', () => {
  it('ethereum: avec value (wei → ETH)', () => {
    const r = parseQr(`ethereum:${EVM}?value=1000000000000000000`);
    expect(r.kind).toBe('ethereum-uri');
    if (r.kind === 'ethereum-uri') {
      expect(r.address.toLowerCase()).toBe(EVM);
      expect(r.amount).toBe('1.0');
    }
  });
  it('ethereum: avec @chainId', () => {
    const r = parseQr(`ethereum:${EVM}@137?value=500000000000000000`);
    expect(r.kind).toBe('ethereum-uri');
    if (r.kind === 'ethereum-uri') {
      expect(r.chainId).toBe(137);
      expect(r.amount).toBe('0.5');
    }
  });
  it('ethereum: transfer de token → destinataire dans ?address', () => {
    const to = '0x1111111111111111111111111111111111111111';
    const r = parseQr(`ethereum:${EVM}/transfer?address=${to}&uint256=1000000`);
    expect(r.kind).toBe('ethereum-uri');
    if (r.kind === 'ethereum-uri') {
      expect(r.address.toLowerCase()).toBe(to);
      expect(r.amount).toBeUndefined(); // décimales inconnues → pas de montant préchargé
    }
  });
  it('bitcoin: avec amount', () => {
    expect(parseQr(`bitcoin:${BTC}?amount=0.01`)).toEqual({ kind: 'bitcoin-uri', address: BTC, amount: '0.01' });
  });
  it('bitcoin: sans amount', () => {
    expect(parseQr(`bitcoin:${BTC}`)).toEqual({ kind: 'bitcoin-uri', address: BTC, amount: undefined });
  });
  it('solana: avec amount', () => {
    expect(parseQr(`solana:${SOL}?amount=1.5`)).toEqual({ kind: 'solana-uri', address: SOL, amount: '1.5', splToken: undefined });
  });
  it('solana: avec spl-token', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const r = parseQr(`solana:${SOL}?amount=5&spl-token=${mint}`);
    expect(r.kind).toBe('solana-uri');
    if (r.kind === 'solana-uri') expect(r.splToken).toBe(mint);
  });
});

describe('parseQr — WalletConnect', () => {
  it('wc: reconnu, chaîne d\'origine préservée', () => {
    const uri = 'wc:abc123def@2?relay-protocol=irn&symKey=DEADBEEFcafe';
    expect(parseQr(uri)).toEqual({ kind: 'walletconnect', uri });
  });
});

describe('parseQr — URL et invalides', () => {
  it('URL https normale', () => {
    expect(parseQr('https://app.uniswap.org')).toEqual({ kind: 'url', url: 'https://app.uniswap.org' });
  });
  it('texte quelconque → invalide', () => {
    expect(parseQr('bonjour le monde').kind).toBe('invalid');
  });
  it('chaîne vide → invalide', () => {
    expect(parseQr('   ').kind).toBe('invalid');
  });
  it('ethereum: adresse invalide → invalide', () => {
    expect(parseQr('ethereum:0xNONSENSE?value=1').kind).toBe('invalid');
  });
  it('bitcoin: adresse invalide → invalide', () => {
    expect(parseQr('bitcoin:pasuneadresse?amount=1').kind).toBe('invalid');
  });
});

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

describe('parseQr — EIP-681 complet', () => {
  it('transfer ERC-20 : le CONTRAT et le montant brut sont conservés', () => {
    // C'était le bug : seul le destinataire survivait, donc une facture en
    // USDC arrivait sur l'écran d'envoi de la pièce native.
    const r = parseQr(`ethereum:${USDC}@1/transfer?address=${EVM}&uint256=1500000`);
    expect(r.kind).toBe('ethereum-uri');
    if (r.kind !== 'ethereum-uri') return;
    expect(r.address.toLowerCase()).toBe(EVM);
    expect(r.contract?.toLowerCase()).toBe(USDC);
    expect(r.amountRaw).toBe('1500000');
    expect(r.chainId).toBe(1);
    // Surtout pas de montant « utilisateur » : les décimales sont inconnues ici.
    expect(r.amount).toBeUndefined();
  });

  it('transfer sans uint256 : contrat gardé, montant absent', () => {
    const r = parseQr(`ethereum:${USDC}/transfer?address=${EVM}`);
    expect(r.kind).toBe('ethereum-uri');
    if (r.kind !== 'ethereum-uri') return;
    expect(r.contract?.toLowerCase()).toBe(USDC);
    expect(r.amountRaw).toBeUndefined();
  });

  it('transfer dont le contrat est invalide → invalide', () => {
    expect(parseQr(`ethereum:pasuncontrat/transfer?address=${EVM}`).kind).toBe('invalid');
  });

  it('notation scientifique : value=2.014e18 → 2.014 ETH', () => {
    const r = parseQr(`ethereum:${EVM}?value=2.014e18`);
    expect(r.kind).toBe('ethereum-uri');
    if (r.kind === 'ethereum-uri') expect(r.amount).toBe('2.014');
  });

  it('préfixe pay- accepté', () => {
    const r = parseQr(`ethereum:pay-${EVM}@137?value=1000000000000000000`);
    expect(r.kind).toBe('ethereum-uri');
    if (r.kind !== 'ethereum-uri') return;
    expect(r.address.toLowerCase()).toBe(EVM);
    expect(r.chainId).toBe(137);
    // `formatAmount` rend la forme décimale complète : 1 ETH s'écrit « 1.0 ».
    expect(r.amount).toBe('1.0');
  });
});

describe('parseQr — BIP-21 complet', () => {
  it('bech32 en MAJUSCULES (forme des QR) : normalisé en minuscules', () => {
    // Le signeur attend la forme canonique ; l'adresse repartait en majuscules.
    const r = parseQr(`bitcoin:${BTC.toUpperCase()}?amount=0.5`);
    expect(r).toEqual({
      kind: 'bitcoin-uri',
      address: BTC,
      amount: '0.5',
      label: undefined,
      message: undefined,
    });
  });

  it('adresse nue en majuscules : normalisée aussi', () => {
    expect(parseQr(BTC.toUpperCase())).toEqual({ kind: 'bitcoin-address', address: BTC });
  });

  it('label et message conservés pour affichage', () => {
    const r = parseQr(`bitcoin:${BTC}?amount=0.01&label=Caf%C3%A9%20Nova&message=Table%2012`);
    expect(r.kind).toBe('bitcoin-uri');
    if (r.kind !== 'bitcoin-uri') return;
    expect(r.label).toBe('Café Nova');
    expect(r.message).toBe('Table 12');
  });

  it('paramètre req- inconnu → URI INVALIDE (règle BIP-21)', () => {
    // Ignorer un `req-` inconnu, c'est payer autre chose que ce qui est demandé.
    expect(parseQr(`bitcoin:${BTC}?amount=0.01&req-fiat=EUR`).kind).toBe('invalid');
  });
});

describe('parseQr — Solana Pay', () => {
  it('spl-token : le montant est en unités décimales du jeton, on le garde', () => {
    const r = parseQr(`solana:${SOL}?amount=12.5&spl-token=${USDC_MINT}`);
    expect(r.kind).toBe('solana-uri');
    if (r.kind !== 'solana-uri') return;
    expect(r.amount).toBe('12.5');
    expect(r.splToken).toBe(USDC_MINT);
  });
});

describe('parseQr — WalletConnect Pay', () => {
  const PAY = 'https://pay.walletconnect.com/pay_abc123';

  it('reconnaît un lien de paiement marchand', () => {
    expect(parseQr(PAY)).toEqual({ kind: 'wc-pay', link: PAY });
  });

  it('classé AVANT « URL web » : sinon il finirait dans le navigateur dApps', () => {
    /*
     * C'est une URL https parfaitement valide. Sans branche dédiée, elle
     * tomberait dans `kind: 'url'` et s'ouvrirait dans le navigateur, où elle
     * ne sert à rien — l'utilisateur verrait une page de paiement web au lieu
     * de son portefeuille.
     */
    expect(parseQr(PAY).kind).not.toBe('url');
    expect(parseQr('https://app.uniswap.org').kind).toBe('url');
  });

  it('un hôte voisin reste une simple URL', () => {
    expect(parseQr('https://pay.walletconnect.com.evil.example/pay_1').kind).toBe('url');
  });

  it('ne se confond pas avec wc: ni avec une URI de paiement de chaîne', () => {
    expect(parseQr('wc:topic@2?symKey=ab').kind).toBe('walletconnect');
    expect(parseQr(`bitcoin:${BTC}?amount=0.01`).kind).toBe('bitcoin-uri');
  });
});

describe('parseQr — Solana Pay complet', () => {
  const REF1 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const REF2 = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

  it('retient TOUTES les occurrences de `reference`', () => {
    /*
     * Le trou le plus grave : `reference` était purement ignoré. C'est le seul
     * moyen pour le marchand de retrouver CETTE transaction parmi celles qui
     * arrivent sur son adresse — sans lui, son terminal reste sur « en
     * attente » alors que les fonds sont partis. Et la spec autorise la
     * répétition, que `parseQuery` écrasait.
     */
    const r = parseQr(`solana:${SOL}?amount=1&reference=${REF1}&reference=${REF2}`);
    expect(r.kind).toBe('solana-uri');
    if (r.kind !== 'solana-uri') return;
    expect(r.reference).toEqual([REF1, REF2]);
  });

  it('écarte une `reference` qui n\'est pas une clé publique', () => {
    // Une valeur fautive ne doit pas devenir un compte de la transaction.
    const r = parseQr(`solana:${SOL}?reference=pas-une-cle&reference=${REF1}`);
    if (r.kind !== 'solana-uri') return;
    expect(r.reference).toEqual([REF1]);
  });

  it('absente quand il n\'y en a pas', () => {
    const r = parseQr(`solana:${SOL}?amount=1`);
    if (r.kind !== 'solana-uri') return;
    expect(r.reference).toBeUndefined();
  });

  it('lit label, message et memo — ignorés jusqu\'ici côté Solana', () => {
    // Ils étaient lus pour Bitcoin et pas pour Solana : l'utilisateur ne voyait
    // ni à qui il payait, ni pourquoi.
    const r = parseQr(`solana:${SOL}?amount=1&label=Caf%C3%A9%20Nova&message=Table%2012&memo=cmd-42`);
    if (r.kind !== 'solana-uri') return;
    expect(r.label).toBe('Café Nova');
    expect(r.message).toBe('Table 12');
    expect(r.memo).toBe('cmd-42');
  });
});

describe('parseQr — requêtes de transaction Solana Pay', () => {
  it('reconnaît `solana:https://…`, la moitié de la spec qui manquait', () => {
    // Avant : « QR non reconnu ».
    expect(parseQr('solana:https://marchand.example/pay/42')).toEqual({
      kind: 'solana-tx-request',
      url: 'https://marchand.example/pay/42',
    });
  });

  it('refuse http en clair : l\'adresse de l\'utilisateur partirait en chemin', () => {
    expect(parseQr('solana:http://marchand.example/pay').kind).toBe('invalid');
  });

  it('refuse une cible locale ou une IP littérale', () => {
    /*
     * On s'apprête à envoyer l'adresse de l'utilisateur à ce serveur puis à
     * signer ce qu'il renvoie. Une cible locale pointerait vers le réseau de
     * l'appareil lui-même ; une demande légitime porte un nom.
     */
    for (const bad of ['https://localhost/pay', 'https://127.0.0.1/pay', 'https://192.168.1.10/pay', 'https://intranet/pay']) {
      expect(parseQr(`solana:${bad}`).kind).toBe('invalid');
    }
  });
});
