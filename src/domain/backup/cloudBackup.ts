/**
 * Sauvegarde chiffrée de TOUS les portefeuilles.
 *
 * Elle n'en contenait qu'UN. Un utilisateur qui avait créé trois portefeuilles
 * sauvegardait le premier et perdait les deux autres — sans rien pour l'en
 * avertir, puisque la restauration réussissait. C'est le pire genre de
 * sauvegarde : celle qui donne confiance et ne tient pas.
 *
 * Les secrets sont chiffrés CÔTÉ CLIENT avec un mot de passe choisi par
 * l'utilisateur (scrypt + AES-256-GCM, même primitive que le coffre PIN), puis
 * emballés dans une enveloppe JSON versionnée. Rien ne transite par un serveur
 * Kalyx, et le contenu est inutile sans le mot de passe.
 *
 * UN SEUL CHIFFREMENT pour toute la liste, et c'est un choix : scrypt est
 * volontairement lent, et le répéter par portefeuille rendrait une sauvegarde de
 * cinq comptes interminable sur un téléphone. La liste est donc sérialisée puis
 * chiffrée d'un bloc.
 *
 * ⚠️ La sauvegarde ne vaut que la force du mot de passe. Aucun secret en clair ici.
 */
import { gcm } from '@noble/ciphers/aes';
import { utf8ToBytes, bytesToUtf8, bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { backupKdf, decryptSecret, assertKdfParams, deriveKey, type EncryptedVault } from '../../security/vault';
import { getRandomBytes } from '../../crypto/random';
import { validateMnemonic } from '../../crypto/mnemonic';
import { classifyRecoveryPhrase } from '../keys/recoveryPhrase';
import { isWalletError } from '../errors';

/**
 * Version 3 : deux clés aléatoires emballées sous le mot de passe.
 *
 * La v2 chiffrait la liste DIRECTEMENT sous le mot de passe : chaque
 * sauvegarde coûtait un scrypt, et il fallait le mot de passe à chaque fois —
 * impossible de resynchroniser en arrière-plan sans le redemander. La v3 tire
 * deux clés (BDK pour les secrets, MK pour le manifeste), les emballe UNE fois
 * sous le mot de passe, et l'app peut ensuite resceller sans lui.
 *
 * Les versions 1 (une phrase) et 2 (liste sous mot de passe) restent LISIBLES à
 * la restauration — casser les sauvegardes existantes ferait perdre à quelqu'un
 * l'accès à ses fonds, ce qu'aucune amélioration ne justifie.
 */
export const BACKUP_VERSION = 3;

/** Un portefeuille dans la sauvegarde. */
export interface BackupWallet {
  /** Nom donné par l'utilisateur. Vide = nom par défaut, traduit à l'affichage. */
  label: string;
  /** `seed` = phrase BIP-39 ; `privateKey` = clé importée. */
  type: 'seed' | 'privateKey';
  /** Famille servie par une clé importée. Absent pour une phrase. */
  keyFamily?: 'evm' | 'bitcoin' | 'solana';
  /** Phrase BIP-39, ou clé privée hexadécimale selon `type`. */
  secret: string;
  /**
   * Comptes dérivés de la phrase : numéro et nom, rien de secret. Sans eux, une
   * restauration ne recréait que le compte n°1 — les autres existaient
   * toujours, mais l'utilisateur ne les voyait plus. Absent des anciennes
   * sauvegardes : on restaure alors le compte n°1 seulement.
   */
  accounts?: BackupAccount[];
}

export interface BackupAccount {
  index: number;
  label: string;
}

/** Liste de comptes lue dans une sauvegarde : bornée et vérifiée, jamais prise telle quelle. */
export function sanitizeBackupAccounts(raw: unknown): BackupAccount[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<number>();
  const out: BackupAccount[] = [];
  for (const a of raw.slice(0, 100)) {
    const index = (a as { index?: unknown })?.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 999 || seen.has(index)) continue;
    seen.add(index);
    const label = (a as { label?: unknown }).label;
    out.push({ index, label: typeof label === 'string' ? label.slice(0, 64) : '' });
  }
  return out.length ? out.sort((x, y) => x.index - y.index) : undefined;
}

export interface BackupEnvelope {
  /** 'kalyx' pour les nouvelles sauvegardes ; 'nova' accepté à la restauration. */
  app: 'kalyx' | 'nova';
  /** `wallets-backup` depuis la v2 ; `seed-backup` pour les anciennes. */
  kind: 'seed-backup' | 'wallets-backup';
  version: number;
  createdAt: string;
  vault: EncryptedVault;
  /**
   * Nombre de portefeuilles, EN CLAIR et volontairement.
   *
   * Il permet d'annoncer « 3 portefeuilles » avant de demander le mot de passe :
   * sans lui, l'utilisateur ne sait pas s'il restaure tout ou une partie, et ne
   * peut pas repérer une sauvegarde incomplète. Ce n'est pas un secret — le
   * nombre de comptes ne révèle ni clé ni solde.
   */
  count?: number;
}

/* ------------------------------------------------------------------ */
/*                       Format v3 : primitives                        */
/* ------------------------------------------------------------------ */

/** Clés d'une sauvegarde v3 : 32 octets aléatoires chacune. */
export interface BackupKeys {
  /** Scelle chaque secret, individuellement. */
  bdk: Uint8Array;
  /** Chiffre le manifeste (liste, étiquettes, comptes) et l'attache à l'en-tête. */
  mk: Uint8Array;
}

/** `bdk‖mk` chiffrées sous le mot de passe. Tout en hexadécimal. */
export interface WrappedKeys {
  kdf: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
  nonce: string;
  ct: string;
}

/** Secret scellé sous la BDK. Hexadécimal. */
export interface SealedSecret {
  n: string;
  ct: string;
}

/** Un portefeuille dans le manifeste v3 : tout sauf le secret est en clair DANS le manifeste (lui-même chiffré). */
export interface V3Record {
  id: string;
  label: string;
  type: 'seed' | 'privateKey';
  keyFamily?: 'evm' | 'bitcoin' | 'solana';
  accounts?: BackupAccount[];
  secret: SealedSecret;
}

/** Fichier v3 tel qu'écrit. `count` est indicatif : le vrai nombre est celui du manifeste. */
export interface BackupFileV3 {
  app: 'kalyx';
  kind: 'wallets-backup';
  version: 3;
  backupId: string;
  createdAt: string;
  count: number;
  keys: WrappedKeys;
  manifest: SealedSecret;
}

/*
 * AAD de l'emballage des clés. Fixe et versionnée : un bloc chiffré pour un
 * autre usage (coffre PIN, futur format) ne peut pas être présenté ici comme
 * des clés de sauvegarde.
 */
const KEYS_AAD = utf8ToBytes('kalyx-backup-keys-v3');
const KEY_LEN = 32;
/** Taille exacte du chiffré des clés : 64 octets + étiquette GCM de 16. */
const WRAPPED_CT_HEX = (2 * KEY_LEN + 16) * 2;

const isHex = (h: unknown): h is string => typeof h === 'string' && h.length % 2 === 0 && /^[0-9a-f]*$/i.test(h);
/** Nonce GCM de 12 octets et chiffré au moins aussi long que l'étiquette. */
const isSealedShape = (s: unknown): s is SealedSecret =>
  !!s && isHex((s as SealedSecret).n) && (s as SealedSecret).n.length === 24 && isHex((s as SealedSecret).ct) && (s as SealedSecret).ct.length >= 32;

function assertKey(k: unknown): asserts k is Uint8Array {
  if (!(k instanceof Uint8Array) || k.length !== KEY_LEN) throw new Error('CORRUPTED');
}

/** Deux clés neuves, tirées du CSPRNG du projet. */
export function generateBackupKeys(): BackupKeys {
  return { bdk: getRandomBytes(KEY_LEN), mk: getRandomBytes(KEY_LEN) };
}

/** Identifiant de sauvegarde : 16 octets aléatoires. Il lie chaque secret à SA sauvegarde. */
export function newBackupId(): string {
  return bytesToHex(getRandomBytes(16));
}

/**
 * Emballe `bdk‖mk` sous le mot de passe (scrypt `backupKdf()`, puis AES-256-GCM).
 *
 * C'est le SEUL scrypt de la v3 : il ne se refait que lorsque le mot de passe
 * change, pas à chaque sauvegarde.
 */
export async function wrapBackupKeys(keys: BackupKeys, password: string): Promise<WrappedKeys> {
  assertKey(keys.bdk);
  assertKey(keys.mk);
  const salt = getRandomBytes(16);
  const nonce = getRandomBytes(12);
  const kdf = await backupKdf(); // renforcé si le calcul est natif (src/security/vault)
  const kek = await deriveKey(password, salt, kdf);
  const pt = new Uint8Array(2 * KEY_LEN);
  pt.set(keys.bdk, 0);
  pt.set(keys.mk, KEY_LEN);
  let ct: Uint8Array;
  try {
    ct = gcm(kek, nonce, KEYS_AAD).encrypt(pt);
  } finally {
    // Clé dérivée et copie concaténée effacées, comme dans le coffre.
    kek.fill(0);
    pt.fill(0);
  }
  return { kdf: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, salt: bytesToHex(salt), nonce: bytesToHex(nonce), ct: bytesToHex(ct) };
}

/**
 * Déballe les clés. Lève `CORRUPTED` si la FORME est invalide (vérifiée avant
 * tout calcul), `WRONG_PASSWORD` si l'authentification GCM échoue.
 *
 * Les paramètres scrypt viennent du fichier : ils sont BORNÉS comme ceux du
 * coffre, sinon un fichier piégé imposerait N = 2^24 et figerait l'app.
 * Un N altéré mais dans les bornes, lui, dérive simplement une autre clé :
 * indiscernable d'un mauvais mot de passe — rien ne l'authentifie avant le mot
 * de passe lui-même.
 */
export async function unwrapBackupKeys(w: WrappedKeys, password: string): Promise<BackupKeys> {
  if (!w || typeof w !== 'object' || w.kdf !== 'scrypt') throw new Error('CORRUPTED');
  try {
    assertKdfParams(w);
  } catch {
    throw new Error('CORRUPTED');
  }
  if (!isHex(w.salt) || w.salt.length === 0 || !isHex(w.nonce) || w.nonce.length !== 24 || !isHex(w.ct) || w.ct.length !== WRAPPED_CT_HEX) {
    throw new Error('CORRUPTED');
  }
  const kek = await deriveKey(password, hexToBytes(w.salt), w);
  let pt: Uint8Array | null = null;
  try {
    pt = gcm(kek, hexToBytes(w.nonce), KEYS_AAD).decrypt(hexToBytes(w.ct));
  } catch {
    throw new Error('WRONG_PASSWORD');
  } finally {
    kek.fill(0);
  }
  try {
    if (pt.length !== 2 * KEY_LEN) throw new Error('CORRUPTED');
    // Copies : le tampon déchiffré est effacé, les clés rendues vivent chez l'appelant.
    return { bdk: pt.slice(0, KEY_LEN), mk: pt.slice(KEY_LEN) };
  } finally {
    pt.fill(0);
  }
}

/**
 * Normalisation d'un secret avant scellement — MÊME règle que la v2.
 *
 * Une phrase est normalisée ; une clé privée ne doit PAS l'être — la casse
 * d'un hexadécimal est indifférente mais l'espace, lui, n'y a rien à faire.
 */
export function normalizeBackupSecret(type: 'seed' | 'privateKey', secret: string): string {
  return type === 'seed' ? secret.trim().toLowerCase().replace(/\s+/g, ' ') : secret.trim();
}

/*
 * AAD d'un secret : `${backupId}|${recordId}`. Un secret recopié dans un autre
 * enregistrement, ou dans une autre sauvegarde sous la même BDK, ne s'ouvre
 * plus — on ne peut pas faire restaurer la clé d'un portefeuille sous le nom
 * d'un autre.
 */
const secretAad = (backupId: string, recordId: string) => utf8ToBytes(`${backupId}|${recordId}`);

/** Scelle un secret sous la BDK. Nonce aléatoire à chaque appel. */
export function sealSecret(bdk: Uint8Array, backupId: string, recordId: string, secret: string): SealedSecret {
  assertKey(bdk);
  const n = getRandomBytes(12);
  const pt = utf8ToBytes(secret);
  try {
    return { n: bytesToHex(n), ct: bytesToHex(gcm(bdk, n, secretAad(backupId, recordId)).encrypt(pt)) };
  } finally {
    pt.fill(0);
  }
}

/** Ouvre un secret scellé. Lève `CORRUPTED` sur toute anomalie : la BDK, elle, est déjà authentifiée. */
export function openSecret(bdk: Uint8Array, backupId: string, recordId: string, s: SealedSecret): string {
  assertKey(bdk);
  if (!isSealedShape(s)) throw new Error('CORRUPTED');
  let pt: Uint8Array | null = null;
  try {
    pt = gcm(bdk, hexToBytes(s.n), secretAad(backupId, recordId)).decrypt(hexToBytes(s.ct));
    return bytesToUtf8(pt);
  } catch {
    throw new Error('CORRUPTED');
  } finally {
    pt?.fill(0);
  }
}

/**
 * JSON CANONIQUE : clés d'objet triées récursivement, tableaux dans l'ordre.
 *
 * Il sert d'AAD au manifeste. Sans tri, un simple réenregistrement du fichier
 * par un outil qui réordonne les clés (ou un `JSON.parse`/`stringify` d'un
 * autre moteur) rendrait la sauvegarde illisible alors que rien n'a changé.
 */
export function canonicalJson(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sort(o[k])]));
    }
    return x;
  };
  return JSON.stringify(sort(v));
}

/** AAD du manifeste : TOUT l'en-tête sauf `manifest` — count, createdAt, backupId, version, keys… */
function manifestAad(file: Record<string, unknown>): Uint8Array {
  const { manifest: _m, ...header } = file;
  return utf8ToBytes(canonicalJson(header));
}

/**
 * Assemble un fichier v3. Le manifeste est chiffré sous MK, avec l'en-tête en
 * AAD : modifier le moindre champ en clair (un `count` gonflé, une date, les
 * clés d'une autre sauvegarde) fait échouer le déchiffrement — `CORRUPTED`.
 *
 * MK SEULE, et c'est voulu : les secrets arrivent déjà scellés sous la BDK. Une
 * synchro en arrière-plan peut donc reconstruire le fichier sans la BDK, qui
 * reste chiffrée par le PIN sur l'appareil.
 */
export function buildV3File(p: { backupId: string; mk: Uint8Array; wrapped: WrappedKeys; records: V3Record[]; createdAt?: string }): string {
  assertKey(p.mk);
  const header = {
    app: 'kalyx' as const,
    kind: 'wallets-backup' as const,
    version: 3 as const,
    backupId: p.backupId,
    createdAt: p.createdAt ?? new Date().toISOString(),
    count: p.records.length,
    keys: p.wrapped,
  };
  const n = getRandomBytes(12);
  const pt = utf8ToBytes(JSON.stringify({ records: p.records }));
  let ct: Uint8Array;
  try {
    ct = gcm(p.mk, n, manifestAad(header)).encrypt(pt);
  } finally {
    pt.fill(0);
  }
  const file: BackupFileV3 = { ...header, manifest: { n: bytesToHex(n), ct: bytesToHex(ct) } };
  return JSON.stringify(file, null, 2);
}

/**
 * Raison d'un échec, sous forme de CODE.
 *
 * Ces messages étaient écrits en français ici ; ils ressortaient donc en français
 * quelle que soit la langue, sur l'écran le plus anxiogène de l'app.
 */
export type BackupError =
  | 'UNREADABLE'
  | 'NOT_A_BACKUP'
  | 'TOO_RECENT'
  | 'WRONG_PASSWORD'
  | 'CORRUPTED';

/**
 * Chiffre la liste sous `password` et renvoie le fichier JSON à sauvegarder (v3).
 *
 * Clés fraîches et `backupId` neuf à chaque appel : un export manuel ne partage
 * rien avec la synchro automatique ni avec un export précédent.
 */
export async function createWalletsBackup(wallets: readonly BackupWallet[], password: string): Promise<string> {
  if (wallets.length === 0) throw new Error('Aucun portefeuille à sauvegarder');
  const keys = generateBackupKeys();
  try {
    const backupId = newBackupId();
    const wrapped = await wrapBackupKeys(keys, password);
    // Identifiant d'enregistrement = rang : unique dans le fichier, et protégé par le manifeste.
    const records: V3Record[] = wallets.map((w, i) => {
      const accounts = w.accounts?.length ? sanitizeBackupAccounts(w.accounts) : undefined;
      return {
        id: String(i),
        label: w.label,
        type: w.type,
        ...(w.keyFamily ? { keyFamily: w.keyFamily } : {}),
        ...(accounts ? { accounts } : {}),
        secret: sealSecret(keys.bdk, backupId, String(i), normalizeBackupSecret(w.type, w.secret)),
      };
    });
    return buildV3File({ backupId, mk: keys.mk, wrapped, records });
  } finally {
    keys.bdk.fill(0);
    keys.mk.fill(0);
  }
}

/**
 * Compatibilité : sauvegarde d'une seule phrase.
 *
 * Conservée pour les appelants qui n'ont qu'une phrase en main. Elle produit une
 * sauvegarde v3 à un élément, pas une v1 : on ne crée plus d'anciennes
 * sauvegardes, on se contente de savoir les lire.
 */
export function createBackup(mnemonic: string, password: string): Promise<string> {
  return createWalletsBackup([{ label: '', type: 'seed', secret: mnemonic }], password);
}

/** Nombre de portefeuilles annoncé par une sauvegarde, sans mot de passe. */
export function backupWalletCount(text: string): number | null {
  try {
    const env = JSON.parse(text) as BackupEnvelope;
    if (!env || (env.app !== 'kalyx' && env.app !== 'nova')) return null;
    if (env.kind === 'seed-backup') return 1;
    // v2 et v3 : même champ en clair. En v3, il est en outre authentifié par le manifeste.
    return typeof env.count === 'number' && Number.isInteger(env.count) && env.count > 0 ? env.count : null;
  } catch {
    return null;
  }
}

/**
 * Déchiffre une sauvegarde et rend TOUS ses portefeuilles.
 *
 * Ne lève jamais : cet écran est celui où l'utilisateur récupère l'accès à ses
 * fonds, et une exception non rattrapée y est le pire des résultats.
 *
 * `mnemonic` est conservé dans le retour pour les appelants existants : il vaut
 * la phrase du PREMIER portefeuille de type `seed`, ou rien.
 */
export async function restoreBackup(
  text: string,
  password: string,
): Promise<{ wallets?: BackupWallet[]; mnemonic?: string; error?: BackupError }> {
  let env: BackupEnvelope;
  try {
    env = JSON.parse(text) as BackupEnvelope;
  } catch {
    return { error: 'UNREADABLE' };
  }
  if (!env || typeof env !== 'object' || (env.app !== 'kalyx' && env.app !== 'nova')) return { error: 'NOT_A_BACKUP' };
  if (env.kind !== 'seed-backup' && env.kind !== 'wallets-backup') return { error: 'NOT_A_BACKUP' };
  // Avant toute autre vérification : un format futur n'a peut-être ni `vault` ni `keys`.
  if (typeof env.version === 'number' && env.version > BACKUP_VERSION) return { error: 'TOO_RECENT' };

  if (env.kind === 'wallets-backup' && env.version === 3) {
    try {
      return finish(await readV3(env as unknown as Record<string, unknown>, password));
    } catch (e) {
      return { error: e instanceof Error && e.message === 'WRONG_PASSWORD' ? 'WRONG_PASSWORD' : 'CORRUPTED' };
    }
  }
  if (!env.vault) return { error: 'NOT_A_BACKUP' };

  let plain: string;
  try {
    plain = await decryptSecret(env.vault, password);
  } catch (e) {
    // Paramètres hors limites ou coffre incomplet : fichier abîmé, pas un mauvais mot de passe.
    return { error: isWalletError(e) && e.code === 'VAULT_CORRUPTED' ? 'CORRUPTED' : 'WRONG_PASSWORD' };
  }

  /*
   * SAUVEGARDE V1 : le contenu déchiffré EST la phrase, pas du JSON. On la
   * reconnaît au `kind`, pas en tentant un `JSON.parse` — une phrase de
   * récupération n'est pas du JSON, mais s'appuyer sur cet échec ferait dépendre
   * la lecture d'une sauvegarde d'un comportement d'analyseur.
   */
  if (env.kind === 'seed-backup') {
    if (!validateMnemonic(plain)) return { error: 'CORRUPTED' };
    return { wallets: [{ label: '', type: 'seed', secret: plain }], mnemonic: plain };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plain);
  } catch {
    return { error: 'CORRUPTED' };
  }
  if (!Array.isArray(parsed)) return { error: 'CORRUPTED' };
  return finish(parsed);
}

/**
 * Lecture v3 : clés, puis manifeste (en-tête en AAD), puis chaque secret.
 *
 * Rend la liste au format v2 (secrets ouverts), validée ensuite par le MÊME
 * code que la v2. Lève `WRONG_PASSWORD` ou `CORRUPTED`. Une fois les clés
 * déballées, plus rien n'est « mauvais mot de passe » : le mot de passe a
 * prouvé qu'il était le bon, tout échec suivant est une altération.
 */
async function readV3(file: Record<string, unknown>, password: string): Promise<unknown[]> {
  const backupId = file.backupId;
  if (typeof backupId !== 'string' || !backupId || !isSealedShape(file.manifest)) throw new Error('CORRUPTED');
  const keys = await unwrapBackupKeys(file.keys as WrappedKeys, password);
  let pt: Uint8Array | null = null;
  try {
    const m = file.manifest;
    try {
      pt = gcm(keys.mk, hexToBytes(m.n), manifestAad(file)).decrypt(hexToBytes(m.ct));
    } catch {
      throw new Error('CORRUPTED');
    }
    const records = (JSON.parse(bytesToUtf8(pt)) as { records?: unknown })?.records;
    if (!Array.isArray(records)) throw new Error('CORRUPTED');
    // `count` est authentifié par l'AAD, mais doit aussi DIRE vrai : un écart trahit un fichier mal construit.
    if (file.count !== records.length) throw new Error('CORRUPTED');
    const ids = new Set<string>();
    return records.map((raw) => {
      const r = raw as Partial<V3Record>;
      if (typeof r?.id !== 'string' || ids.has(r.id)) throw new Error('CORRUPTED');
      ids.add(r.id);
      const { secret, id: _id, ...rest } = r;
      return { ...rest, secret: openSecret(keys.bdk, backupId, r.id, secret as SealedSecret) };
    });
  } finally {
    pt?.fill(0);
    keys.bdk.fill(0);
    keys.mk.fill(0);
  }
}

/** Validation commune v2/v3 de la liste déchiffrée, et forme de retour historique. */
function finish(parsed: unknown[]): { wallets?: BackupWallet[]; mnemonic?: string; error?: BackupError } {
  if (parsed.length === 0) return { error: 'CORRUPTED' };

  const wallets: BackupWallet[] = [];
  for (const raw of parsed) {
    const w = raw as Partial<BackupWallet>;
    if (typeof w?.secret !== 'string' || !w.secret) return { error: 'CORRUPTED' };
    const type = w.type === 'privateKey' ? 'privateKey' : 'seed';
    /*
     * Une phrase invalide fait échouer TOUTE la restauration, et c'est voulu :
     * restaurer deux portefeuilles sur trois en silence laisserait l'utilisateur
     * croire qu'il a tout récupéré. Mieux vaut un échec visible.
     */
    /*
     * PHRASE TON ACCEPTÉE. L'export écrit une phrase TON comme `'seed'` (la
     * restauration la reclasse d'après la phrase elle-même) — mais ce contrôle
     * n'acceptait que le BIP-39 : une seule phrase TON rendait TOUTE la
     * sauvegarde « corrompue », et l'utilisateur perdait l'accès à ses autres
     * portefeuilles avec elle.
     */
    if (type === 'seed' && classifyRecoveryPhrase(w.secret) === null) return { error: 'CORRUPTED' };
    const accounts = sanitizeBackupAccounts((w as { accounts?: unknown }).accounts);
    wallets.push({
      label: typeof w.label === 'string' ? w.label : '',
      type,
      ...(w.keyFamily === 'evm' || w.keyFamily === 'bitcoin' || w.keyFamily === 'solana'
        ? { keyFamily: w.keyFamily }
        : {}),
      secret: w.secret,
      ...(accounts ? { accounts } : {}),
    });
  }

  // Phrase « principale » : BIP-39 de préférence (elle ouvre toutes les chaînes, une phrase TON n'ouvre que TON).
  return { wallets, mnemonic: (wallets.find((w) => w.type === 'seed' && classifyRecoveryPhrase(w.secret) === 'bip39') ?? wallets.find((w) => w.type === 'seed'))?.secret };
}
