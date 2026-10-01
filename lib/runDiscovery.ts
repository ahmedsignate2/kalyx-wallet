/**
 * Lance la recherche des comptes et annonce le résultat (toast) — partagé par
 * l'import d'une phrase (en arrière-plan) et l'écran Comptes (à la demande).
 * Une seule recherche à la fois par portefeuille.
 */
import { useWallet, type Unlock } from './walletStore';
import { toast } from './toast';
import { translate, type Key } from './i18n';
import { useSettings } from './settingsStore';
import { friendlyTxError } from './txError';

const running = new Set<string>();
const tr = (key: Key) => translate(useSettings.getState().language, key);

/** Seule une phrase BIP-39 a des comptes 2, 3… (ni clé privée, ni phrase TON, ni adresse suivie). */
export function canDiscover(walletId: string): boolean {
  const type = useWallet.getState().wallets.find((w) => w.id === walletId)?.type;
  return type === undefined || type === 'seed';
}

/**
 * Rend la main dès que la phrase est lue (code bon) — ou rejette si le code est
 * faux, pour que la fenêtre de confirmation le signale. La recherche réseau
 * continue ensuite en arrière-plan et annonce son résultat.
 */
export function runDiscovery(walletId: string, unlock: Unlock, opts: { onProgress?: (n: number) => void; onFinished?: () => void; announce?: boolean } = {}): Promise<void> {
  if (running.has(walletId) || !canDiscover(walletId)) {
    opts.onFinished?.();
    return Promise.resolve();
  }
  running.add(walletId);
  return new Promise<void>((resolve, reject) => {
    let unlocked = false;
    useWallet
      .getState()
      .discoverAccounts(walletId, unlock, {
        onProgress: (i) => opts.onProgress?.(i + 1),
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
        running.delete(walletId);
        opts.onFinished?.();
        resolve(); // jamais laissée en suspens (ex. portefeuille devenu non-BIP-39)
      });
  });
}

export const isDiscovering = (walletId: string) => running.has(walletId);
