/**
 * Bilan d'une restauration de sauvegarde, dit à l'écran : combien sont
 * rentrés, et lesquels ne le sont pas, avec la raison. Sans la seconde
 * partie, l'utilisateur croyait tout restauré.
 */
import { Alert } from 'react-native';
import { toast } from './toast';
import type { ImportReport } from './walletStore';

type T = (k: 'backupRestoredCount' | 'backupSkippedTitle' | 'backupSkippedHint' | 'skipDuplicate' | 'skipUnsupported' | 'skipInvalid') => string;

const REASON = { duplicate: 'skipDuplicate', unsupported: 'skipUnsupported', invalid: 'skipInvalid' } as const;

/** `extra` : portefeuilles déjà restaurés avant (le premier, posé avec le code). */
export function showImportReport(r: ImportReport, t: T, extra = 0): void {
  toast.success(t('backupRestoredCount').replace('{count}', String(r.added + extra)));
  // Un doublon n'est pas un problème (déjà là) ; il est quand même nommé s'il y a d'autres absents.
  const missing = r.skipped.filter((s) => s.reason !== 'duplicate');
  if (!missing.length) return;
  const lines = r.skipped.map((s) => `• ${s.label || '—'} — ${t(REASON[s.reason])}`).join('\n');
  Alert.alert(t('backupSkippedTitle').replace('{count}', String(r.skipped.length)), `${lines}\n\n${t('backupSkippedHint')}`);
}
