/**
 * Le cœur de Kalyx (src/) tourne-t-il ici, dans le service worker ?
 *
 * Vecteur public BIP-39 (« abandon … about ») : les adresses attendues sont
 * celles que les tests du mobile vérifient déjà (src/crypto/hd.test.ts,
 * src/crypto/solana.test.ts). Même phrase, mêmes adresses : c'est la promesse
 * à tenir entre l'app et l'extension.
 */
import { mnemonicToSeed, validateMnemonic } from '../../src/crypto/mnemonic';
import { deriveEvmAccount } from '../../src/crypto/hd';
import { deriveSolanaAccount } from '../../src/crypto/solana';

export const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

export interface CoreSelfTest {
  ok: boolean;
  evm: string;
  solana: string;
}

export async function coreSelfTest(): Promise<CoreSelfTest> {
  if (!validateMnemonic(TEST_MNEMONIC)) return { ok: false, evm: '', solana: '' };
  const seed = await mnemonicToSeed(TEST_MNEMONIC);
  const evm = deriveEvmAccount(seed, 0).address;
  const solana = deriveSolanaAccount(seed, 0).address;
  return { ok: evm === '0x9858EfFD232B4033E47d90003D41EC34EcaEda94' && solana === 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk', evm, solana };
}
