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
import { BACKUP_KDF, encryptSecret, decryptSecret, type EncryptedVault } from '../../security/vault';
import { validateMnemonic } from '../../crypto/mnemonic';

/**
 * Version 2 : la liste des portefeuilles.
 *
 * La version 1 ne portait qu'une phrase. Elle reste LISIBLE à la restauration —
 * casser les sauvegardes existantes ferait perdre à quelqu'un l'accès à ses
 * fonds, ce qu'aucune amélioration ne justifie.
 */
export const BACKUP_VERSION = 2;

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

/** Chiffre la liste sous `password` et renvoie l'enveloppe JSON à sauvegarder. */
export async function createWalletsBackup(wallets: readonly BackupWallet[], password: string): Promise<string> {
  if (wallets.length === 0) throw new Error('Aucun portefeuille à sauvegarder');
  const normalised = wallets.map((w) => ({
    label: w.label,
    type: w.type,
    ...(w.keyFamily ? { keyFamily: w.keyFamily } : {}),
    // Une phrase est normalisée ; une clé privée ne doit PAS l'être — la casse
    // d'un hexadécimal est indifférente mais l'espace, lui, n'y a rien à faire.
    secret: w.type === 'seed' ? w.secret.trim().toLowerCase().replace(/\s+/g, ' ') : w.secret.trim(),
  }));
  const vault = await encryptSecret(JSON.stringify(normalised), password, BACKUP_KDF);
  const env: BackupEnvelope = {
    app: 'kalyx',
    kind: 'wallets-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    vault,
    count: normalised.length,
  };
  return JSON.stringify(env, null, 2);
}

/**
 * Compatibilité : sauvegarde d'une seule phrase, au format v2.
 *
 * Conservée pour les appelants qui n'ont qu'une phrase en main. Elle produit une
 * enveloppe v2 à un élément, pas une v1 : on ne crée plus d'anciennes
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
    return typeof env.count === 'number' && env.count > 0 ? env.count : null;
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
  if (!env || (env.app !== 'kalyx' && env.app !== 'nova') || !env.vault) return { error: 'NOT_A_BACKUP' };
  if (env.kind !== 'seed-backup' && env.kind !== 'wallets-backup') return { error: 'NOT_A_BACKUP' };
  if (typeof env.version === 'number' && env.version > BACKUP_VERSION) return { error: 'TOO_RECENT' };

  let plain: string;
  try {
    plain = await decryptSecret(env.vault, password);
  } catch {
    return { error: 'WRONG_PASSWORD' };
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
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: 'CORRUPTED' };

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
    if (type === 'seed' && !validateMnemonic(w.secret)) return { error: 'CORRUPTED' };
    wallets.push({
      label: typeof w.label === 'string' ? w.label : '',
      type,
      ...(w.keyFamily === 'evm' || w.keyFamily === 'bitcoin' || w.keyFamily === 'solana'
        ? { keyFamily: w.keyFamily }
        : {}),
      secret: w.secret,
    });
  }

  return { wallets, mnemonic: wallets.find((w) => w.type === 'seed')?.secret };
}
