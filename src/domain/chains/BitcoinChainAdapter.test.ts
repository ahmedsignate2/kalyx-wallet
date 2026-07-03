import { getAdapter } from './registry';
import { BitcoinChainAdapter } from './BitcoinChainAdapter';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { isWalletError } from '../errors';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const BTC_ADDR_0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

describe('BitcoinChainAdapter', () => {
  const adapter = getAdapter('bitcoin');
  const seed = mnemonicToSeedSync(PHRASE);

  it('est enregistré dans le registre', () => {
    expect(adapter).toBeInstanceOf(BitcoinChainAdapter);
    expect(adapter.config.nativeSymbol).toBe('BTC');
    expect(adapter.config.nativeDecimals).toBe(8);
  });

  it('dérive l’adresse BIP-84 de référence', () => {
    expect(adapter.deriveAccount(seed, 0).address).toBe(BTC_ADDR_0);
  });

  it('refuse explicitement l’envoi (NOT_SUPPORTED)', async () => {
    expect(() => adapter.buildTransfer({ to: BTC_ADDR_0, amount: '0.1' })).toThrow();
    try {
      adapter.buildTransfer({ to: BTC_ADDR_0, amount: '0.1' });
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('NOT_SUPPORTED');
    }
    const fakeTx = {
      to: BTC_ADDR_0,
      value: 1n,
      evmChainId: 0,
      nonce: 0,
      gasLimit: 0n,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
    };
    await expect(adapter.signTransaction(fakeTx, '0x00')).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    });
    await expect(adapter.broadcast('0x00')).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('getHistory renvoie [] (réception seulement pour l’instant)', async () => {
    await expect(adapter.getHistory('bc1qxyz')).resolves.toEqual([]);
  });
});
