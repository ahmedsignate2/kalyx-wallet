/**
 * Export manuel d'une sauvegarde chiffrée de la phrase de récupération.
 *
 * La seed est chiffrée CÔTÉ CLIENT avec un mot de passe choisi par l'utilisateur
 * (scrypt + AES-256-GCM, même primitive que le coffre PIN), puis emballée dans une
 * enveloppe JSON versionnée. L'utilisateur stocke ce fichier où il veut (iCloud,
 * Google Drive, e-mail à soi-même…) : rien ne transite par un serveur Kalyx, et le
 * contenu est inutile sans le mot de passe.
 *
 * ⚠️ La sauvegarde ne vaut que la force du mot de passe. Aucune seed en clair ici.
 */
import { BACKUP_KDF, encryptSecret, decryptSecret, type EncryptedVault } from '../../security/vault';
import { validateMnemonic } from '../../crypto/mnemonic';

export const BACKUP_VERSION = 1;

export interface BackupEnvelope {
  /** 'kalyx' pour les nouvelles sauvegardes ; 'nova' accepté à la restauration (anciennes). */
  app: 'kalyx' | 'nova';
  kind: 'seed-backup';
  version: number;
  createdAt: string;
  vault: EncryptedVault;
}

/** Chiffre la phrase sous `password` et renvoie l'enveloppe JSON à sauvegarder. */
export async function createBackup(mnemonic: string, password: string): Promise<string> {
  const vault = await encryptSecret(mnemonic.trim().toLowerCase().replace(/\s+/g, ' '), password, BACKUP_KDF);
  const env: BackupEnvelope = {
    app: 'kalyx',
    kind: 'seed-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    vault,
  };
  return JSON.stringify(env, null, 2);
}

/**
 * Déchiffre une sauvegarde. Renvoie `{ mnemonic }` si OK, sinon `{ error }` clair
 * (format invalide, version trop récente, mot de passe faux). Ne lève jamais.
 */
export async function restoreBackup(
  text: string,
  password: string,
): Promise<{ mnemonic?: string; error?: string }> {
  let env: BackupEnvelope;
  try {
    env = JSON.parse(text) as BackupEnvelope;
  } catch {
    return { error: 'Fichier de sauvegarde illisible.' };
  }
  if (!env || (env.app !== 'kalyx' && env.app !== 'nova') || env.kind !== 'seed-backup' || !env.vault) {
    return { error: 'Ce n’est pas une sauvegarde Kalyx valide.' };
  }
  if (typeof env.version === 'number' && env.version > BACKUP_VERSION) {
    return { error: 'Sauvegarde créée par une version plus récente de Kalyx.' };
  }
  try {
    const mnemonic = await decryptSecret(env.vault, password);
    if (!validateMnemonic(mnemonic)) return { error: 'Sauvegarde corrompue (phrase invalide).' };
    return { mnemonic };
  } catch {
    return { error: 'Mot de passe incorrect.' };
  }
}
