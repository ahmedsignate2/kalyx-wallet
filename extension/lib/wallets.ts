/**
 * PORTEFEUILLES de l'extension.
 *
 * Deux moitiés, jamais mélangées :
 *  - les SECRETS (phrase, clé privée) : dans le coffre, scellés (lib/vault) ;
 *  - les MÉTADONNÉES : nom, type, comptes et leurs adresses PUBLIQUES, phrase
 *    vérifiée ou non. Sur le disque, en clair : rien qui permette de dépenser.
 *
 * Mêmes dérivations que le mobile (src/crypto) : même phrase, mêmes adresses.
 *
 * Erreurs (codes) : INVALID_PHRASE, UNSUPPORTED_PHRASE, INVALID_KEY,
 * WRONG_FAMILY, DUPLICATE, UNKNOWN_WALLET, BACKUP_<code>, TOO_MANY_WALLETS.
 */
import { base58 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '../../src/crypto/mnemonic';
import { deriveEvmAccount, evmAccountFromPrivateKey } from '../../src/crypto/hd';
import { deriveSolanaAccount } from '../../src/crypto/solana';
import { parseImportedKey } from '../../src/domain/keys/importKey';
import { classifyRecoveryPhrase } from '../../src/domain/keys/recoveryPhrase';
import { restoreBackup, normalizeBackupSecret } from '../../src/domain/backup/cloudBackup';
import { getRandomBytes } from '../../src/crypto/random';
import { addSecret, readSecret } from './vault';
import type { Store } from './storage';
import type { Session } from './session';

export type Family = 'evm' | 'solana';

export interface AccountMeta {
  index: number;
  label: string;
  evm?: string;
  solana?: string;
}

export interface WalletMeta {
  id: string;
  label: string;
  kind: 'seed' | 'privateKey';
  /** Famille d'une clé importée (une clé ne sert qu'une famille). */
  family?: Family;
  createdAt: number;
  /** Phrase vérifiée par le défi (ou importée : déjà notée ailleurs). */
  backedUp: boolean;
  accounts: AccountMeta[];
}

const META_KEY = 'wallets';
const MAX_WALLETS = 50;

export class WalletError extends Error {}

const newId = () => `w-${bytesToHex(getRandomBytes(8))}`;
const normalizePhrase = (p: string) => normalizeBackupSecret('seed', p);

/** Adresses d'un compte d'une phrase (mêmes chemins que le mobile). */
export async function accountsFromPhrase(phrase: string, indexes: number[]): Promise<AccountMeta[]> {
  const seed = await mnemonicToSeed(phrase);
  try {
    return indexes.map((index) => ({ index, label: `Compte ${index + 1}`, evm: deriveEvmAccount(seed, index).address, solana: deriveSolanaAccount(seed, index).address }));
  } finally {
    seed.fill(0);
  }
}

/** Adresse et secret canonique d'une clé privée importée, pour LA famille choisie. */
export function accountFromKey(input: string, family: Family): { account: AccountMeta; secret: string } {
  const parsed = parseImportedKey(input);
  if (!parsed.ok) throw new WalletError('INVALID_KEY');
  if (!parsed.key.families.includes(family)) throw new WalletError('WRONG_FAMILY');
  const secretHex = bytesToHex(parsed.key.secret);
  try {
    if (family === 'evm') {
      const a = evmAccountFromPrivateKey(`0x${secretHex}`);
      return { account: { index: 0, label: 'Compte 1', evm: a.address }, secret: `0x${secretHex}` };
    }
    return { account: { index: 0, label: 'Compte 1', solana: base58.encode(ed25519.getPublicKey(parsed.key.secret)) }, secret: secretHex };
  } finally {
    parsed.key.secret.fill(0);
  }
}

/** Empreinte publique d'un portefeuille : sert à refuser un doublon sans rien déchiffrer. */
const fingerprint = (w: Pick<WalletMeta, 'accounts'>) => {
  const a = w.accounts.find((x) => x.index === 0) ?? w.accounts[0];
  return (a?.evm ?? a?.solana ?? '').toLowerCase();
};

export function makeWallets(disk: Store, session: Session) {
  const list = async (): Promise<WalletMeta[]> => (await disk.get<WalletMeta[]>(META_KEY)) ?? [];
  const save = (w: WalletMeta[]) => disk.set(META_KEY, w);

  /** Ajoute un portefeuille (secret dans le coffre, métadonnées à côté), en refusant les doublons. */
  async function add(meta: WalletMeta, secret: string): Promise<void> {
    await session.withVault(async (vault, key) => {
      const all = await list();
      if (all.length >= MAX_WALLETS) throw new WalletError('TOO_MANY_WALLETS');
      const fp = fingerprint(meta);
      if (fp && all.some((w) => fingerprint(w) === fp)) throw new WalletError('DUPLICATE');
      return { vault: addSecret(vault, key, meta.id, meta.kind, secret), result: undefined, commit: () => save([...all, meta]) };
    });
  }

  /** Nouveau portefeuille : 12 mots. La phrase est rendue UNE fois, pour être notée. */
  async function create(label = 'Portefeuille'): Promise<{ id: string; phrase: string }> {
    const phrase = generateMnemonic(128);
    const id = newId();
    await add({ id, label, kind: 'seed', createdAt: Date.now(), backedUp: false, accounts: await accountsFromPhrase(phrase, [0]) }, phrase);
    return { id, phrase };
  }

  async function importPhrase(input: string, label = 'Portefeuille importé'): Promise<WalletMeta> {
    const phrase = normalizePhrase(input);
    const kind = classifyRecoveryPhrase(phrase);
    if (kind === 'ton') throw new WalletError('UNSUPPORTED_PHRASE'); // TON : v2
    if (kind !== 'bip39' || !validateMnemonic(phrase)) throw new WalletError('INVALID_PHRASE');
    const meta: WalletMeta = { id: newId(), label, kind: 'seed', createdAt: Date.now(), backedUp: true, accounts: await accountsFromPhrase(phrase, [0]) };
    await add(meta, phrase);
    return meta;
  }

  async function importKey(input: string, family: Family, label = 'Clé importée'): Promise<WalletMeta> {
    const { account, secret } = accountFromKey(input, family);
    const meta: WalletMeta = { id: newId(), label, kind: 'privateKey', family, createdAt: Date.now(), backedUp: true, accounts: [account] };
    await add(meta, secret);
    return meta;
  }

  /**
   * Sauvegarde chiffrée du MOBILE : chaque portefeuille qu'elle contient est
   * repris, sauf ceux que l'extension ne sait pas encore servir (Bitcoin, TON)
   * ou qu'elle a déjà — ils sont comptés, jamais perdus en silence.
   */
  async function importBackup(file: string, password: string): Promise<{ added: WalletMeta[]; skipped: { label: string; reason: string }[] }> {
    const r = await restoreBackup(file, password);
    if (r.error || !r.wallets) throw new WalletError(`BACKUP_${r.error ?? 'EMPTY'}`);
    const added: WalletMeta[] = [];
    const skipped: { label: string; reason: string }[] = [];
    for (const w of r.wallets) {
      const label = w.label || 'Portefeuille';
      try {
        if (w.type === 'seed') {
          const meta = await importPhrase(w.secret, label);
          // Comptes nommés dans la sauvegarde : repris avec leurs adresses.
          const extra = (w.accounts ?? []).map((a) => a.index).filter((i) => i > 0);
          if (extra.length) await addAccounts(meta.id, extra);
          added.push(meta);
        } else if (w.keyFamily === 'evm' || w.keyFamily === 'solana') {
          added.push(await importKey(w.secret, w.keyFamily, label));
        } else {
          skipped.push({ label, reason: 'UNSUPPORTED_FAMILY' });
        }
      } catch (e) {
        skipped.push({ label, reason: (e as Error).message });
      }
    }
    return { added, skipped };
  }

  /** Comptes supplémentaires d'une phrase (recherche des comptes, ou sauvegarde). */
  async function addAccounts(walletId: string, indexes: number[]): Promise<WalletMeta> {
    return session.withVault(async (vault, key) => {
      const all = await list();
      const w = all.find((x) => x.id === walletId);
      if (!w || w.kind !== 'seed') throw new WalletError('UNKNOWN_WALLET');
      const fresh = indexes.filter((i) => Number.isInteger(i) && i >= 0 && i < 100 && !w.accounts.some((a) => a.index === i));
      if (fresh.length) {
        const { secret } = readSecret(vault, key, walletId);
        w.accounts = [...w.accounts, ...(await accountsFromPhrase(secret, fresh))].sort((a, b) => a.index - b.index);
        return { result: w, commit: () => save(all) };
      }
      return { result: w };
    });
  }

  /** Phrase vérifiée. Dans la file du coffre : jamais en même temps qu'un ajout (on perdrait l'un des deux). */
  async function markBackedUp(walletId: string): Promise<void> {
    await session.withVault(async () => {
      const all = await list();
      const w = all.find((x) => x.id === walletId);
      if (!w) throw new WalletError('UNKNOWN_WALLET');
      w.backedUp = true;
      return { result: undefined, commit: () => save(all) };
    });
  }

  /**
   * Adresses PUBLIQUES des comptes 1…max d'une phrase, pour la recherche des
   * comptes : le coffre ne sert qu'un instant, le réseau est interrogé ensuite,
   * hors de la file (une recherche lente ne bloque rien d'autre).
   */
  async function addressTable(walletId: string, max = 20): Promise<AccountMeta[]> {
    return session.withVault(async (vault, key) => {
      const w = (await list()).find((x) => x.id === walletId);
      if (!w || w.kind !== 'seed') throw new WalletError('UNKNOWN_WALLET');
      const { secret } = readSecret(vault, key, walletId);
      return { result: await accountsFromPhrase(secret, Array.from({ length: max }, (_, i) => i + 1)) };
    });
  }

  return { list, create, importPhrase, importKey, importBackup, addAccounts, markBackedUp, addressTable };
}

export type Wallets = ReturnType<typeof makeWallets>;
