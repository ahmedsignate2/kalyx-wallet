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
 * WRONG_FAMILY, DUPLICATE, UNKNOWN_WALLET, UNKNOWN_ACCOUNT, BAD_LABEL,
 * TOO_MANY_ACCOUNTS, NOTHING_TO_BACKUP, BACKUP_<code>, TOO_MANY_WALLETS.
 */
import { base58 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '../../src/crypto/mnemonic';
import { deriveEvmAccount, evmAccountFromPrivateKey } from '../../src/crypto/hd';
import { deriveSolanaAccount, deriveSolanaSigner } from '../../src/crypto/solana';
import { deriveBtcAccount } from '../../src/crypto/btc';
import { parseImportedKey } from '../../src/domain/keys/importKey';
import { classifyRecoveryPhrase } from '../../src/domain/keys/recoveryPhrase';
import { createWalletsBackup, restoreBackup, normalizeBackupSecret, type BackupWallet } from '../../src/domain/backup/cloudBackup';
import { getRandomBytes } from '../../src/crypto/random';
import { addSecret, readSecret, removeSecret } from './vault';
import type { Store } from './storage';
import type { Session } from './session';

export type Family = 'evm' | 'solana';

export interface AccountMeta {
  index: number;
  label: string;
  evm?: string;
  solana?: string;
  /** Bitcoin SegWit natif (bc1…, BIP-84) : comptes d'une phrase seulement. */
  bitcoin?: string;
}

export interface WalletMeta {
  id: string;
  label: string;
  /** `companion` : clés sur le TÉLÉPHONE (mode compagnon) — rien dans le coffre, signatures transmises à l'app. */
  kind: 'seed' | 'privateKey' | 'companion';
  /** Famille d'une clé importée (une clé ne sert qu'une famille). */
  family?: Family;
  /** Mode compagnon : session WalletConnect avec le téléphone, réseaux EVM partagés, lien perdu. */
  topic?: string;
  evmChains?: number[];
  lost?: boolean;
  createdAt: number;
  /** Phrase vérifiée par le défi (ou importée : déjà notée ailleurs). */
  backedUp: boolean;
  accounts: AccountMeta[];
}

const META_KEY = 'wallets';
const MAX_WALLETS = 50;
const MAX_ACCOUNTS = 100;
const MAX_LABEL = 40;

/** Nom saisi : espaces resserrés, caractères de contrôle retirés, 40 caractères au plus. */
export function cleanLabel(input: unknown): string {
  if (typeof input !== 'string') throw new WalletError('BAD_LABEL');
  const v = input.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
  if (!v) throw new WalletError('BAD_LABEL');
  return v;
}

export class WalletError extends Error {}

const newId = () => `w-${bytesToHex(getRandomBytes(8))}`;
const normalizePhrase = (p: string) => normalizeBackupSecret('seed', p);

/** Adresses d'un compte d'une phrase (mêmes chemins que le mobile). */
export async function accountsFromPhrase(phrase: string, indexes: number[]): Promise<AccountMeta[]> {
  const seed = await mnemonicToSeed(phrase);
  try {
    return indexes.map((index) => ({ index, label: `Compte ${index + 1}`, evm: deriveEvmAccount(seed, index).address, solana: deriveSolanaAccount(seed, index).address, bitcoin: deriveBtcAccount(seed, index).address }));
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
  async function add(meta: WalletMeta & { kind: 'seed' | 'privateKey' }, secret: string): Promise<void> {
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
    const meta: WalletMeta & { kind: 'seed' } = { id: newId(), label, kind: 'seed', createdAt: Date.now(), backedUp: true, accounts: await accountsFromPhrase(phrase, [0]) };
    await add(meta, phrase);
    return meta;
  }

  async function importKey(input: string, family: Family, label = 'Clé importée'): Promise<WalletMeta> {
    const { account, secret } = accountFromKey(input, family);
    const meta: WalletMeta & { kind: 'privateKey' } = { id: newId(), label, kind: 'privateKey', family, createdAt: Date.now(), backedUp: true, accounts: [account] };
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

  /**
   * Portefeuille COMPAGNON : les adresses partagées par le téléphone, aucun
   * secret. Le même compte relié deux fois remplace le lien (nouvelle session).
   */
  function uniqueLabel(base: string, taken: string[]): string {
    if (!taken.includes(base)) return base;
    for (let n = 2; ; n++) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
  }

  async function addCompanion(p: { topic: string; evm?: string; solana?: string; evmChains: number[]; label: string }): Promise<WalletMeta> {
    return session.withVault(async () => {
      const all = await list();
      const fp = (p.evm ?? p.solana ?? '').toLowerCase();
      const prev = all.find((w) => w.kind === 'companion' && fingerprint(w) === fp);
      if (!prev && fp && all.some((w) => fingerprint(w) === fp)) throw new WalletError('DUPLICATE');
      if (!prev && all.length >= MAX_WALLETS) throw new WalletError('TOO_MANY_WALLETS');
      const meta: WalletMeta = {
        id: prev?.id ?? newId(),
        // Plusieurs comptes du téléphone peuvent être reliés : « Téléphone », « Téléphone 2 »…
        label: prev?.label ?? uniqueLabel(p.label, all.map((w) => w.label)),
        kind: 'companion',
        topic: p.topic,
        evmChains: p.evmChains,
        createdAt: prev?.createdAt ?? Date.now(),
        // Rien à sauvegarder ici : la phrase est sur le téléphone.
        backedUp: true,
        accounts: [{ index: 0, label: 'Compte 1', evm: p.evm, solana: p.solana }],
      };
      const next = prev ? all.map((w) => (w.id === prev.id ? meta : w)) : [...all, meta];
      return { result: meta, commit: () => save(next) };
    });
  }

  /** Délier un téléphone : son portefeuille (aucun secret ici) disparaît de l'extension. */
  async function removeCompanion(id: string): Promise<boolean> {
    return session.withVault(async () => {
      const all = await list();
      const w = all.find((x) => x.id === id && x.kind === 'companion');
      if (!w) return { result: false };
      return { result: true, commit: () => save(all.filter((x) => x.id !== id)) };
    });
  }

  /** Session coupée (depuis le téléphone, ou expirée) : le portefeuille reste, marqué « à relier ». */
  async function markCompanionLost(topic: string): Promise<void> {
    const all = await list();
    const w = all.find((x) => x.kind === 'companion' && x.topic === topic);
    if (!w || w.lost) return;
    w.lost = true;
    await save(all);
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
  /**
   * Portefeuilles à phrase créés avant Bitcoin : leurs comptes reçoivent leur
   * adresse bc1 (même phrase, même chemin que l'app). Coffre ouvert requis ;
   * ne fait rien s'il n'y a rien à compléter.
   */
  async function backfillBitcoin(): Promise<boolean> {
    const missing = (await list()).filter((w) => w.kind === 'seed' && w.accounts.some((a) => !a.bitcoin));
    if (!missing.length) return false;
    const filled = await session.withVault(async (vault, key) => {
      const out = new Map<string, Map<number, string>>();
      for (const w of missing) {
        const { secret } = readSecret(vault, key, w.id);
        const derived = await accountsFromPhrase(secret, w.accounts.map((a) => a.index));
        out.set(w.id, new Map(derived.map((a) => [a.index, a.bitcoin!])));
      }
      return { result: out };
    });
    // Relu juste avant d'écrire : un compte ajouté entre-temps n'est pas perdu.
    await save((await list()).map((w) => (filled.has(w.id) ? { ...w, accounts: w.accounts.map((a) => (a.bitcoin ? a : { ...a, bitcoin: filled.get(w.id)!.get(a.index) })) } : w)));
    return true;
  }

  async function addressTable(walletId: string, max = 20): Promise<AccountMeta[]> {
    return session.withVault(async (vault, key) => {
      const w = (await list()).find((x) => x.id === walletId);
      if (!w || w.kind !== 'seed') throw new WalletError('UNKNOWN_WALLET');
      const { secret } = readSecret(vault, key, walletId);
      return { result: await accountsFromPhrase(secret, Array.from({ length: max }, (_, i) => i + 1)) };
    });
  }

  /** Phrase d'un portefeuille, pour la vérifier plus tard. L'appelant a déjà redemandé le mot de passe. */
  async function revealPhrase(walletId: string): Promise<string> {
    return session.withVault(async (vault, key) => {
      const w = (await list()).find((x) => x.id === walletId);
      if (!w || w.kind !== 'seed') throw new WalletError('UNKNOWN_WALLET');
      return { result: readSecret(vault, key, walletId).secret };
    });
  }

  /** Renommer un portefeuille (le nom ne sert qu'à l'affichage). */
  async function renameWallet(walletId: string, label: unknown): Promise<WalletMeta> {
    const name = cleanLabel(label);
    return session.withVault(async () => {
      const all = await list();
      const w = all.find((x) => x.id === walletId);
      if (!w) throw new WalletError('UNKNOWN_WALLET');
      w.label = name;
      return { result: w, commit: () => save(all) };
    });
  }

  async function renameAccount(walletId: string, index: number, label: unknown): Promise<WalletMeta> {
    const name = cleanLabel(label);
    return session.withVault(async () => {
      const all = await list();
      const w = all.find((x) => x.id === walletId);
      const a = w?.accounts.find((x) => x.index === index);
      if (!w || !a) throw new WalletError('UNKNOWN_ACCOUNT');
      a.label = name;
      return { result: w, commit: () => save(all) };
    });
  }

  /** Compte suivant d'une phrase (premier numéro libre) ; rend son numéro. */
  async function addNextAccount(walletId: string): Promise<{ wallet: WalletMeta; index: number }> {
    const w = (await list()).find((x) => x.id === walletId);
    if (!w || w.kind !== 'seed') throw new WalletError('UNKNOWN_WALLET');
    let index = 0;
    while (w.accounts.some((a) => a.index === index)) index++;
    if (index >= MAX_ACCOUNTS) throw new WalletError('TOO_MANY_ACCOUNTS');
    return { wallet: await addAccounts(walletId, [index]), index };
  }

  /**
   * Supprimer un portefeuille de l'extension : son secret quitte le coffre,
   * ses métadonnées le disque. Irréversible ici — seule la phrase (ou la clé)
   * notée ailleurs permet de le retrouver. L'appelant a redemandé le mot de passe.
   */
  async function removeWallet(walletId: string): Promise<void> {
    await session.withVault(async (vault) => {
      const all = await list();
      const w = all.find((x) => x.id === walletId);
      if (!w || w.kind === 'companion') throw new WalletError('UNKNOWN_WALLET');
      return { vault: removeSecret(vault, walletId), result: undefined, commit: () => save(all.filter((x) => x.id !== walletId)) };
    });
  }

  /**
   * Clé privée d'UN compte, au format que les autres portefeuilles importent :
   * EVM en hexadécimal 0x, Solana en base58 de 64 octets (graine + clé publique).
   * L'appelant a redemandé le mot de passe.
   */
  async function revealKey(walletId: string, index: number, family: Family): Promise<string> {
    return session.withVault(async (vault, key) => {
      const w = (await list()).find((x) => x.id === walletId);
      const a = w?.accounts.find((x) => x.index === index);
      if (!w || !a || w.kind === 'companion' || !a[family]) throw new WalletError('UNKNOWN_ACCOUNT');
      const { secret } = readSecret(vault, key, walletId);
      if (w.kind === 'privateKey') {
        if (w.family !== family) throw new WalletError('WRONG_FAMILY');
        if (family === 'evm') return { result: secret };
        const seed = hexToBytes(secret);
        try {
          return { result: base58.encode(new Uint8Array([...seed, ...ed25519.getPublicKey(seed)])) };
        } finally {
          seed.fill(0);
        }
      }
      const seed = await mnemonicToSeed(secret);
      try {
        if (family === 'evm') return { result: deriveEvmAccount(seed, index).privateKey };
        const s = deriveSolanaSigner(seed, index);
        const full = new Uint8Array([...s.secretKey, ...s.publicKey]);
        try {
          return { result: base58.encode(full) };
        } finally {
          s.secretKey.fill(0);
          full.fill(0);
        }
      } finally {
        seed.fill(0);
      }
    });
  }

  /**
   * Sauvegarde chiffrée (format v3 de l'app, que l'app et l'extension savent
   * relire) de tous les portefeuilles à secret. Les portefeuilles compagnons
   * n'y sont pas : leurs clés sont sur le téléphone. L'appelant a redemandé
   * le mot de passe du coffre et vérifié la solidité de celui de la sauvegarde.
   */
  async function exportBackup(backupPassword: string): Promise<{ file: string; count: number }> {
    const items = await session.withVault(async (vault, key) => {
      const out: BackupWallet[] = [];
      for (const w of await list()) {
        if (w.kind === 'companion') continue;
        const { secret } = readSecret(vault, key, w.id);
        out.push(
          w.kind === 'seed'
            ? { label: w.label, type: 'seed', secret, accounts: w.accounts.map((a) => ({ index: a.index, label: a.label })) }
            : { label: w.label, type: 'privateKey', keyFamily: w.family, secret },
        );
      }
      return { result: out };
    });
    if (!items.length) throw new WalletError('NOTHING_TO_BACKUP');
    return { file: await createWalletsBackup(items, backupPassword), count: items.length };
  }

  return { list, create, importPhrase, importKey, importBackup, addAccounts, markBackedUp, addressTable, backfillBitcoin, revealPhrase, addCompanion, markCompanionLost, removeCompanion, renameWallet, renameAccount, addNextAccount, removeWallet, revealKey, exportBackup };
}

export type Wallets = ReturnType<typeof makeWallets>;
