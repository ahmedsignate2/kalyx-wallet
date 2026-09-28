/**
 * Sonde du journal de diagnostic (voir lib/debugJournal.ts) : l'écran affiché
 * et les changements d'état du coffre. Aucune donnée secrète : seulement des
 * drapeaux (verrouillé, portefeuille présent…), des identifiants et des tailles.
 */
import { useEffect } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { useWallet } from '../lib/walletStore';
import { journal } from '../lib/debugJournal';

export function JournalProbe() {
  const pathname = usePathname();
  const segments = useSegments();
  useEffect(() => {
    journal('nav', `écran : ${pathname}  (${segments.join('/')})`);
  }, [pathname, segments]);

  useEffect(() => {
    const pick = (s: ReturnType<typeof useWallet.getState>) => ({
      ready: s.ready,
      hasWallet: s.hasWallet,
      isUnlocked: s.isUnlocked,
      activeWalletId: s.activeWalletId,
      wallets: s.wallets.length,
      activeChain: s.activeChain,
      activeAccountIndex: s.activeAccountIndex,
      accounts: s.accounts.length,
      failedAttempts: s.failedAttempts,
      draft: s.draftMnemonic ? 'présent' : 'aucun',
    });
    let prev = pick(useWallet.getState());
    journal('state', 'coffre :', prev);
    return useWallet.subscribe((s) => {
      const next = pick(s);
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== prev[k]);
      if (changed.length) journal('state', `coffre : ${changed.map((k) => `${k} ${String(prev[k])} → ${String(next[k])}`).join(', ')}`);
      prev = next;
    });
  }, []);
  return null;
}
