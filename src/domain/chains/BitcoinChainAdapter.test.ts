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

  it('buildTransfer valide l’envoi hors-ligne (adresse + montant)', () => {
    // Adresse + montant valides → intention (value en satoshis, evmChainId=0).
    const intent = adapter.buildTransfer({ to: BTC_ADDR_0, amount: '0.001' });
    expect(intent.value).toBe(100000n); // 0.001 BTC = 100 000 sats
    expect(intent.to).toBe(BTC_ADDR_0);

    // Adresse invalide → INVALID_ADDRESS.
    try {
      adapter.buildTransfer({ to: '0xNotBitcoin', amount: '0.001' });
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e) && e.code).toBe('INVALID_ADDRESS');
    }
  });

  it('les méthodes EVM génériques ne servent pas à l’envoi BTC', async () => {
    // L'envoi BTC passe par sendBitcoin ; prepare/sign/broadcast lèvent.
    await expect(adapter.broadcast('0x00')).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('getHistory renvoie [] (réception seulement pour l’instant)', async () => {
    await expect(adapter.getHistory('bc1qxyz')).resolves.toEqual([]);
  });
});
