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
import { p2wpkhAddress } from '../../src/crypto/btc';
import { resolveTonKeyAsync } from '../../src/domain/chains/ton/tonKeys';
import { addressForChain } from '../../lib/accountAddress';
import { TON } from '../../src/domain/chains/configs';
import { mnemonicToSeed } from '../../src/crypto/mnemonic';
import { WalletError } from '../../src/domain/errors';
import { readSecret } from './vault';
import { addressKey } from './whitelist';
import type { Session } from './session';
import type { Wallets } from './wallets';

export type SignFamily = 'evm' | 'solana' | 'bitcoin' | 'ton';

/** Adresse que donnerait ce signataire. */
export function signerAddress(s: ChainSigner, family: SignFamily = s.curve === 'secp256k1' ? 'evm' : 'solana'): string {
  if (s.curve === 'secp256k1') return family === 'bitcoin' ? p2wpkhAddress(s.publicKey) : evmAccountFromPrivateKey(`0x${bytesToHex(s.privateKey)}`).address;
  if (family === 'ton') return addressForChain({ evmAddress: '', tonPublicKey: bytesToHex(s.publicKey) }, TON);
  return base58.encode(s.publicKey);
}

/**
 * Signataire du compte (portefeuille + index) pour la famille demandée,
 * VÉRIFIÉ contre `expected` (l'adresse affichée). L'appelant l'efface.
 */
export async function signerFor(session: Session, wallets: Wallets, walletId: string, index: number, family: SignFamily, expected: string): Promise<ChainSigner> {
  const meta = (await wallets.list()).find((w) => w.id === walletId);
  // Mode compagnon : aucune clé ici — la signature se fait sur le téléphone (lib/companion).
  if (meta?.kind === 'companion') throw new WalletError('NOT_SUPPORTED', 'COMPANION');
  const signer = await session.withVault(async (vault, key) => {
    const { kind, secret } = readSecret(vault, key, walletId);
    // TON : une clé par phrase (celle de Tonkeeper), portée par le compte 1 seulement.
    if (family === 'ton') {
      if (kind !== 'seed' || index !== 0) throw new WalletError('NOT_SUPPORTED', 'WRONG_FAMILY:ton');
      const k = await resolveTonKeyAsync(secret);
      return { result: { curve: 'ed25519', secretKey: k.seed, publicKey: k.publicKey } as ChainSigner };
    }
    if (kind === 'privateKey') {
      if (meta?.family !== family) throw new WalletError('NOT_SUPPORTED', `WRONG_FAMILY:${family}`);
      if (family === 'evm') return { result: signerFromEvmPrivateKey(secret) };
      const raw = hexToBytes(secret);
      try {
        return { result: signerFromRawKey(family === 'bitcoin' ? 'bitcoin' : 'solana', raw) };
      } finally {
        raw.fill(0);
      }
    }
    // Phrase TON native : aucune autre famille n'en dérive (ce ne serait pas la même clé que les autres portefeuilles).
    if (meta?.phrase === 'ton') throw new WalletError('NOT_SUPPORTED', `WRONG_FAMILY:${family}`);
    const seed = await mnemonicToSeed(secret);
    try {
      return { result: signerFromSeed(family, seed, index) };
    } finally {
      seed.fill(0);
    }
  });
  if (addressKey(signerAddress(signer, family)) !== addressKey(expected)) {
    wipeSigner(signer);
    throw new WalletError('WRONG_ACCOUNT', 'La clé ne correspond pas au compte affiché');
  }
  return signer;
}
