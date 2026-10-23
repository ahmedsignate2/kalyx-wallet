/**
 * PLAFOND JOURNALIER de dépense, dans la devise affichée.
 *
 * Ce qui part d'un compte (Envoyer, Swap, transaction demandée par un site)
 * est additionné jour par jour (jour local). Tant que le total reste sous le
 * plafond, rien ne change. Au-delà, ou quand la valeur est inconnue (prix
 * introuvable), le mot de passe est redemandé : une session ouverte volée,
 * ou un site qui enchaîne les demandes, ne peut pas vider le compte d'un coup.
 *
 * Relever ou retirer le plafond redemande le mot de passe ; le baisser, non.
 */
import type { Store } from './storage';

export const CAP_CHOICES = [100, 250, 500, 1000, 2500, 5000] as const;

interface Day {
  day: string;
  total: number;
}

export function makeSpendCap(deps: { disk: Store; now?: () => number }) {
  const now = deps.now ?? Date.now;
  const today = () => {
    const d = new Date(now());
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const limit = async (): Promise<number | null> => {
    const v = await deps.disk.get<number>('spendCap');
    return typeof v === 'number' && v > 0 ? v : null;
  };
  const spent = async (): Promise<number> => {
    const d = await deps.disk.get<Day>('spendDay');
    return d?.day === today() ? d.total : 0;
  };

  return {
    limit,
    async status(): Promise<{ limit: number | null; spent: number; remaining: number | null }> {
      const [l, s] = await Promise.all([limit(), spent()]);
      return { limit: l, spent: s, remaining: l === null ? null : Math.max(0, l - s) };
    },
    /** Faut-il le mot de passe pour faire partir `value` (null : valeur inconnue) ? */
    async needsPassword(value: number | null): Promise<boolean> {
      const l = await limit();
      if (l === null) return false;
      if (value === null) return true;
      return (await spent()) + value > l;
    },
    /** Après un envoi réussi. Une valeur inconnue ne s'additionne pas (elle a déjà exigé le mot de passe). */
    async record(value: number | null): Promise<void> {
      if (value === null || !(value > 0)) return;
      await deps.disk.set('spendDay', { day: today(), total: (await spent()) + value } satisfies Day);
    },
    /** Ce nouveau plafond assouplit-il l'actuel (relevé ou retiré) ? Si oui, mot de passe. */
    async loosens(next: number | null): Promise<boolean> {
      const l = await limit();
      return l !== null && (next === null || next > l);
    },
    async setLimit(next: unknown): Promise<void> {
      if (next !== null && !CAP_CHOICES.includes(next as never)) throw new Error('BAD_REQUEST');
      if (next === null) await deps.disk.remove('spendCap');
      else await deps.disk.set('spendCap', next);
    },
  };
}

export type SpendCap = ReturnType<typeof makeSpendCap>;
