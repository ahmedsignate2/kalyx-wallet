import { parseQr } from './parse';

const EVM = '0x742d35cc6634c0532925a3b844bc454e4438f44e'; // minuscule = sans checksum
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

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
