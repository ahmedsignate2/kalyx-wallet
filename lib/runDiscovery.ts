/**
 * Lance la recherche des comptes et annonce le résultat (toast) — partagé par
 * l'import d'une phrase (en arrière-plan, déclenché par le magasin) et l'écran
 * Comptes (à la demande). Une seule recherche à la fois par portefeuille, et
 * l'écran sait si l'une tourne déjà (useDiscovering).
 */
import { create } from 'zustand';
import { useWallet, type Unlock } from './walletStore';
import { toast } from './toast';
import { translate, type Key } from './i18n';
import { useSettings } from './settingsStore';
import { friendlyTxError } from './txError';

const tr = (key: Key) => translate(useSettings.getState().language, key);

/** Portefeuilles dont la recherche tourne, et le compte en cours d'examen. */
const useRunning = create<{ at: Record<string, number> }>(() => ({ at: {} }));
const setAt = (id: string, n: number | null) =>
  useRunning.setState((st) => {
    const at = { ...st.at };
    if (n == null) delete at[id];
    else at[id] = n;
    return { at };
  });

/** Compte en cours d'examen pour ce portefeuille, ou null si aucune recherche ne tourne. */
export const useDiscovering = (walletId: string) => useRunning((st) => st.at[walletId] ?? null);

/** Seule une phrase BIP-39 a des comptes 2, 3… (ni clé privée, ni phrase TON, ni adresse suivie). */
export function canDiscover(walletId: string): boolean {
  const type = useWallet.getState().wallets.find((w) => w.id === walletId)?.type;
  return type === undefined || type === 'seed';
}

type Run = (opts: { onProgress: (i: number) => void; onUnlocked: () => void }) => Promise<{ added: number[]; uncertain: number[] }>;

/**
 * Exécute une recherche et en annonce l'issue. Rend la main dès que la phrase
 * est lue (code bon) — ou rejette si le code est faux, pour que la fenêtre de
 * confirmation le signale ; la recherche réseau continue en arrière-plan.
 */
export function trackDiscovery(walletId: string, run: Run, opts: { announce?: boolean } = {}): Promise<void> {
  if (useRunning.getState().at[walletId] != null || !canDiscover(walletId)) return Promise.resolve();
  setAt(walletId, 1);
  return new Promise<void>((resolve, reject) => {
    let unlocked = false;
    run({
      onProgress: (i) => setAt(walletId, i),
      onUnlocked: () => {
        unlocked = true;
        resolve();
        if (opts.announce) toast.info(tr('discoverTitle'), tr('discoverRunning'));
      },
    })
      .then(({ added, uncertain }) => {
        if (added.length) toast.success(tr('discoverTitle'), tr('discoverFound').replace('{count}', String(added.length)));
        else if (!uncertain.length) toast.info(tr('discoverTitle'), tr('discoverNone'));
        if (uncertain.length) toast.warning(tr('discoverTitle'), tr('discoverUncertain'));
      })
      .catch((e) => {
        if (!unlocked) reject(e); // code faux, biométrie refusée… : à la fenêtre de confirmation
        else toast.error(tr('discoverTitle'), friendlyTxError(e));
      })
      .finally(() => {
        setAt(walletId, null);
        resolve();
      });
  });
}

/** Recherche à la demande (écran Comptes) : la phrase est lue avec le code ou la biométrie. */
export function runDiscovery(walletId: string, unlock: Unlock): Promise<void> {
  return trackDiscovery(walletId, (opts) => useWallet.getState().discoverAccounts(walletId, unlock, opts));
}
