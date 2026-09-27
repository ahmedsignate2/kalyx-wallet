import { TonChainAdapter } from './TonChainAdapter';
import { TON_TESTNET } from './configs';
import KEYS from './ton/tonkeeper-vectors.json';

describe('TonChainAdapter (v1)', () => {
  const a = new TonChainAdapter(TON_TESTNET);
  const to = KEYS.keys[3].v5r1Testnet.uq;

  /* L'écran d'envoi valide l'étape du montant par buildTransfer : le refuser bloquait tout envoi TON. */
  it('buildTransfer valide hors ligne, comme Solana', () => {
    expect(a.buildTransfer({ to, amount: '0.05' })).toEqual({ to, value: 50_000_000n, evmChainId: 0 });
    expect(() => a.buildTransfer({ to: 'pas une adresse', amount: '1' })).toThrow();
    expect(() => a.buildTransfer({ to, amount: '0' })).toThrow();
  });

  it('signer et diffuser restent refusés : l’envoi passe par la v2', async () => {
    await expect(a.signTransaction()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(a.broadcast()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });
});
