/**
 * SIGNATAIRE d'un compte, tiré du coffre au dernier moment — pour l'envoi
 * (lib/send) et les signatures demandées par les dApps (lib/dappSign).
 *
 * La phrase (ou la clé importée) n'est lue que dans la file du coffre, la
 * graine est effacée dès la dérivation faite, et l'appelant efface le
 * signataire après usage (`withSigner`). Le signataire est vérifié contre
 * l'adresse attendue : on ne signe jamais pour un autre compte que celui
 * montré à l'utilisateur.
 */
import { base58 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { signerFromEvmPrivateKey, signerFromRawKey, signerFromSeed } from '../../src/domain/chains/v2/derive';
import { wipeSigner, type ChainSigner } from '../../src/domain/chains/v2/signer';
import { evmAccountFromPrivateKey } from '../../src/crypto/hd';
import { mnemonicToSeed } from '../../src/crypto/mnemonic';
import { WalletError } from '../../src/domain/errors';
import { readSecret } from './vault';
import { addressKey } from './whitelist';
import type { Session } from './session';
import type { Wallets } from './wallets';

export type SignFamily = 'evm' | 'solana';

/** Adresse que donnerait ce signataire. */
export function signerAddress(s: ChainSigner): string {
  if (s.curve === 'secp256k1') return evmAccountFromPrivateKey(`0x${bytesToHex(s.privateKey)}`).address;
  return base58.encode(s.publicKey);
}

/**
 * Signataire du compte (portefeuille + index) pour la famille demandée,
 * VÉRIFIÉ contre `expected` (l'adresse affichée). L'appelant l'efface.
 */
export async function signerFor(session: Session, wallets: Wallets, walletId: string, index: number, family: SignFamily, expected: string): Promise<ChainSigner> {
  const meta = (await wallets.list()).find((w) => w.id === walletId);
  const signer = await session.withVault(async (vault, key) => {
    const { kind, secret } = readSecret(vault, key, walletId);
    if (kind === 'privateKey') {
      if (meta?.family !== family) throw new WalletError('NOT_SUPPORTED', `WRONG_FAMILY:${family}`);
      if (family === 'evm') return { result: signerFromEvmPrivateKey(secret) };
      const raw = hexToBytes(secret);
      try {
        return { result: signerFromRawKey('solana', raw) };
      } finally {
        raw.fill(0);
      }
    }
    const seed = await mnemonicToSeed(secret);
    try {
      return { result: signerFromSeed(family, seed, index) };
    } finally {
      seed.fill(0);
    }
  });
  if (addressKey(signerAddress(signer)) !== addressKey(expected)) {
    wipeSigner(signer);
    throw new WalletError('WRONG_ACCOUNT', 'La clé ne correspond pas au compte affiché');
  }
  return signer;
}
