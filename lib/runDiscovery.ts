/**
 * Lance la recherche des comptes et annonce le résultat (toast) — partagé par
 * l'import d'une phrase (en arrière-plan, déclenché par le magasin) et l'écran
 * Comptes (à la demande). Une seule recherche à la fois par portefeuille, et
 * l'écran sait si l'une tourne déjà (useDiscovering).
 */
import { create } from 'zustand';
import { isBip39Wallet, useWallet, type Unlock } from './walletStore';
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
  return isBip39Wallet(useWallet.getState().wallets, walletId);
}

/** Génération : une réinitialisation rend muettes les recherches d'avant (même id « primary »). */
let generation = 0;
export function clearDiscoveries(): void {
  generation += 1;
  useRunning.setState({ at: {} });
}

type Run = (opts: { onProgress: (i: number) => void; onUnlocked: () => void }) => Promise<{ added: number[]; uncertain: number[]; aborted?: boolean; gone?: boolean }>;

/**
 * Exécute une recherche et en annonce l'issue. Rend la main dès que la phrase
 * est lue (code bon) — ou rejette si le code est faux, pour que la fenêtre de
 * confirmation le signale ; la recherche réseau continue en arrière-plan.
 */
export function trackDiscovery(walletId: string, run: Run, opts: { announce?: boolean } = {}): Promise<void> {
  if (useRunning.getState().at[walletId] != null || !canDiscover(walletId)) return Promise.resolve();
  setAt(walletId, 1);
  const gen = generation;
  const live = () => gen === generation;
  return new Promise<void>((resolve, reject) => {
    let unlocked = false;
    run({
      onProgress: (i) => live() && setAt(walletId, i),
      onUnlocked: () => {
        unlocked = true;
        resolve();
        if (opts.announce) toast.info(tr('discoverTitle'), tr('discoverRunning'));
      },
    })
      .then(({ added, uncertain, aborted, gone }) => {
        if (!live() || gone) return; // portefeuille réinitialisé ou supprimé : rien à annoncer
        // Trouvés mais pas écrits (portefeuille changé) : jamais « aucun compte » — à relancer.
        if (aborted) toast.warning(tr('discoverTitle'), tr('discoverUncertain'));
        else if (added.length) toast.success(tr('discoverTitle'), tr('discoverFound').replace('{count}', String(added.length)));
        else if (!uncertain.length) toast.info(tr('discoverTitle'), tr('discoverNone'));
        if (uncertain.length && !aborted) toast.warning(tr('discoverTitle'), tr('discoverUncertain'));
      })
      .catch((e) => {
        if (!unlocked) reject(e); // code faux, biométrie refusée… : à la fenêtre de confirmation
        else toast.error(tr('discoverTitle'), friendlyTxError(e));
      })
      .finally(() => {
        if (live()) setAt(walletId, null);
        resolve();
      });
  });
}

/** Recherche à la demande (écran Comptes) : la phrase est lue avec le code ou la biométrie. */
export function runDiscovery(walletId: string, unlock: Unlock): Promise<void> {
  return trackDiscovery(walletId, (opts) => useWallet.getState().discoverAccounts(walletId, unlock, opts));
}
