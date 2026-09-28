/**
 * Hashes de transaction que l'app CONNAÎT (historique en cache, journal
 * technique). Seuls ceux-là peuvent figurer dans un ticket de support : une
 * valeur de même forme mais inconnue peut être une clé privée
 * (voir `lib/secretDetector.ts`).
 */
import { useHistoryStore } from './historyStore';
import { technicalLogger } from './technicalLogger';

export function knownTxHashes(): string[] {
  const out: string[] = [];
  for (const list of Object.values(useHistoryStore.getState().cache)) for (const tx of list ?? []) if (tx?.hash) out.push(tx.hash);
  for (const l of technicalLogger.getRecentLogs(300)) {
    const h = l.details?.txHash;
    if (typeof h === 'string') out.push(h);
  }
  return out;
}
