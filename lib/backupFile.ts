/**
 * Export de la sauvegarde chiffrée EN FICHIER (.json), pas en texte.
 *
 * `Share.share({ message })` partageait un TEXTE : « Enregistrer dans
 * Fichiers » n'apparaissait pas, « Copier » mettait la sauvegarde au
 * presse-papiers (lu par d'autres apps, synchronisé par Handoff) — et l'écran
 * annonçait « sauvegarde faite » dans les deux cas.
 *
 * Le fichier est écrit dans le CACHE (jamais dans Documents, sauvegardé dans
 * iCloud) puis supprimé après le partage. Son contenu est exactement le texte
 * d'avant : « Importer → Sauvegarde chiffrée » accepte toujours le collage.
 *
 * iOS : partage par `Share.share({ url })` de React Native, et non
 * `expo-sharing` — celui-ci résout toujours sans rien dire (ni annulation, ni
 * activité choisie), donc impossible de savoir si une copie existe vraiment.
 * Android : `expo-sharing` (Share de React Native ne sait pas joindre un
 * fichier) ; Android ne dit jamais si le partage a abouti.
 */
import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/** `shared` : copie hors de l'app. `copied` : presse-papiers seulement. `dismissed` : rien. */
export type BackupShareResult = 'shared' | 'copied' | 'dismissed';

const PREFIX = 'kalyx-backup-';
/** Activités iOS qui ne créent AUCUNE copie durable de la sauvegarde. */
const NOT_A_BACKUP = new Set(['com.apple.UIKit.activity.CopyToPasteboard', 'com.apple.UIKit.activity.Print']);

/**
 * Fichiers restés d'un partage précédent : iOS ne rend pas toujours la main
 * (activité ouverte puis annulée), et Android en garde un exprès (voir plus bas).
 * Appelé avant chaque export et à l'ouverture de l'écran de sauvegarde.
 */
export function purgeStaleBackupFiles(): void {
  try {
    for (const f of Paths.cache.list()) {
      if (f instanceof File && f.name.startsWith(PREFIX) && f.name.endsWith('.json')) f.delete();
    }
  } catch {
    /* cache illisible : rien à purger */
  }
}

export async function shareBackupFile(blob: string, title: string): Promise<BackupShareResult> {
  purgeStaleBackupFiles();
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `${PREFIX}${day}.json`);
  if (file.exists) file.delete();
  file.write(blob);
  try {
    if (Platform.OS === 'ios') {
      // Extension .json → UTI public.json : « Enregistrer dans Fichiers », AirDrop, Mail joignent un vrai fichier.
      const res = await Share.share({ url: file.uri, title });
      if (res.action === Share.dismissedAction) return 'dismissed';
      return res.activityType && NOT_A_BACKUP.has(res.activityType) ? 'copied' : 'shared';
    }
    /*
     * Android : PAS de suppression ici. Le sélecteur rend la main avant que
     * l'app choisie (Drive, Gmail) ait fini de lire le fichier ; le supprimer
     * maintenant ferait échouer l'envoi. Purgé au prochain passage.
     */
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: title });
    return 'shared';
  } finally {
    if (Platform.OS === 'ios') {
      try {
        // iOS ne rend la main qu'une fois l'activité terminée : la copie du cache ne doit pas traîner.
        if (file.exists) file.delete();
      } catch {
        /* déjà supprimé, ou cache purgé par le système */
      }
    }
  }
}
