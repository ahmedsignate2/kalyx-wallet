import { extractWcUri, extractPaymentUri, extractBrowseUrl } from './deeplink';

const BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const EVM = '0x742d35cc6634c0532925a3b844bc454e4438f44e';

describe('extractWcUri', () => {
  it('URI directe', () => {
    expect(extractWcUri('wc:topic@2?relay-protocol=irn&symKey=ab')).toBe(
      'wc:topic@2?relay-protocol=irn&symKey=ab',
    );
  });
  it('lien wc réécrit en kalyx:// (reconnu à ses paramètres)', () => {
    expect(extractWcUri('kalyx://topic@2?relay-protocol=irn&symKey=ab')).toBe(
      'wc:topic@2?relay-protocol=irn&symKey=ab',
    );
  });
  it('enveloppe ?uri=', () => {
    expect(extractWcUri(`kalyx://wc?uri=${encodeURIComponent('wc:t@2?symKey=ab')}`)).toBe(
      'wc:t@2?symKey=ab',
    );
  });
  it('null si l\'enveloppe ne contient pas du wc:', () => {
    expect(extractWcUri(`kalyx://wc?uri=${encodeURIComponent('https://evil.example')}`)).toBeNull();
  });
  it('null sur un lien de paiement : les deux chemins ne se marchent pas dessus', () => {
    expect(extractWcUri(`bitcoin:${BTC}?amount=0.01`)).toBeNull();
    expect(extractWcUri(`kalyx://pay?uri=${encodeURIComponent(`bitcoin:${BTC}`)}`)).toBeNull();
  });
});

describe('extractPaymentUri', () => {
  it('les trois schémas directs', () => {
    expect(extractPaymentUri(`bitcoin:${BTC}?amount=0.01`)).toBe(`bitcoin:${BTC}?amount=0.01`);
    expect(extractPaymentUri(`ethereum:${EVM}?value=1`)).toBe(`ethereum:${EVM}?value=1`);
    expect(extractPaymentUri('solana:SoL?amount=1')).toBe('solana:SoL?amount=1');
  });
  it('casse du schéma indifférente', () => {
    expect(extractPaymentUri(`BITCOIN:${BTC}`)).toBe(`BITCOIN:${BTC}`);
  });
  it('enveloppe kalyx://pay?uri=', () => {
    const inner = `bitcoin:${BTC}?amount=0.5&label=Caf%C3%A9`;
    expect(extractPaymentUri(`kalyx://pay?uri=${encodeURIComponent(inner)}`)).toBe(inner);
  });
  it('lien universel https://kalyxwallet.com/pay?uri=', () => {
    const inner = `ethereum:${EVM}@1?value=1000000000000000000`;
    expect(extractPaymentUri(`https://kalyxwallet.com/pay?uri=${encodeURIComponent(inner)}`)).toBe(
      inner,
    );
  });
  it('une enveloppe ne peut pas transporter autre chose qu\'un paiement', () => {
    // Sinon n'importe quel lien partagé passerait par le chemin de paiement.
    expect(
      extractPaymentUri(`kalyx://pay?uri=${encodeURIComponent('https://evil.example')}`),
    ).toBeNull();
    expect(
      extractPaymentUri(`kalyx://pay?uri=${encodeURIComponent('javascript:alert(1)')}`),
    ).toBeNull();
  });
  it('un hôte voisin n\'est pas notre hôte', () => {
    const inner = `bitcoin:${BTC}`;
    expect(
      extractPaymentUri(`https://kalyxwallet.com.evil.example/pay?uri=${encodeURIComponent(inner)}`),
    ).toBeNull();
    expect(
      extractPaymentUri(`https://notkalyxwallet.com/pay?uri=${encodeURIComponent(inner)}`),
    ).toBeNull();
  });
  it('null sur les liens qui ne sont pas des paiements', () => {
    expect(extractPaymentUri('wc:topic@2?symKey=ab')).toBeNull();
    expect(extractPaymentUri('kalyx://browse?url=https://app.uniswap.org')).toBeNull();
    expect(extractPaymentUri('kalyx://pay')).toBeNull();
  });
});

describe('extractBrowseUrl', () => {
  it('https accepté', () => {
    const target = 'https://app.uniswap.org';
    expect(extractBrowseUrl(`kalyx://browse?url=${encodeURIComponent(target)}`)).toBe(target);
  });
  it('tout ce qui n\'est pas https est refusé', () => {
    // La WebView dApps a le portefeuille injecté : rien d'autre n'y entre.
    for (const bad of ['http://x.example', 'javascript:alert(1)', 'data:text/html,<b>x', 'file:///etc/passwd']) {
      expect(extractBrowseUrl(`kalyx://browse?url=${encodeURIComponent(bad)}`)).toBeNull();
    }
  });
  it('null sans paramètre url', () => {
    expect(extractBrowseUrl('kalyx://browse')).toBeNull();
  });
});
