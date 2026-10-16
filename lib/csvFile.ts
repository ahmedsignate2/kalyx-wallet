/**
 * Export de l'historique EN FICHIER .csv, pas en texte.
 *
 * `Share.share({ message: csv })` partageait un TEXTE : Numbers, Excel ou
 * « Enregistrer dans Fichiers » recevaient un bloc collé, pas un tableur, et le
 * titre « kalyx-history.csv » n'était qu'un libellé. Ici on écrit un vrai
 * fichier dans le CACHE (jamais dans Documents, sauvegardé dans iCloud), on le
 * partage avec son type (text/csv, UTI public.comma-separated-values-text) puis
 * on le supprime — même schéma que `lib/backupFile.ts`.
 */
import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

const PREFIX = 'kalyx-history-';

/** Fichiers laissés par un export précédent (Android, voir plus bas). */
function purgeStaleCsvFiles(): void {
  try {
    for (const f of Paths.cache.list()) {
      if (f instanceof File && f.name.startsWith(PREFIX) && f.name.endsWith('.csv')) f.delete();
    }
  } catch {
    /* cache illisible : rien à purger */
  }
}

export async function shareCsvFile(csv: string, title: string): Promise<void> {
  // Partage de fichiers indisponible (rare) : on retombe sur le texte d'avant.
  if (!(await Sharing.isAvailableAsync())) {
    await Share.share({ message: csv, title });
    return;
  }
  purgeStaleCsvFiles();
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `${PREFIX}${day}.csv`);
  if (file.exists) file.delete();
  /*
   * MARQUE UTF-8 (BOM) en tête : sans elle, Excel lit le fichier dans
   * l'encodage local — « Reçu » devenait « ReÃ§u », et l'arabe, le chinois ou
   * le japonais étaient illisibles. Les autres tableurs l'ignorent.
   */
  file.write(csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`);
  try {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: title });
  } finally {
    /*
     * iOS ne rend la main qu'une fois l'activité terminée : la copie peut partir.
     * Android rend la main AVANT que l'app choisie (Drive, Gmail) ait lu le
     * fichier ; le supprimer maintenant ferait échouer l'envoi. Purgé au
     * prochain export.
     */
    if (Platform.OS === 'ios') {
      try {
        if (file.exists) file.delete();
      } catch {
        /* déjà supprimé, ou cache purgé par le système */
      }
    }
  }
}
