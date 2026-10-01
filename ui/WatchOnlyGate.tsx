/**
 * Écrans qui SIGNENT (envoyer, échanger, placer) sur un portefeuille en lecture
 * seule : on l'explique d'emblée plutôt que de laisser remplir un formulaire qui
 * échouerait au code. Le coffre refuse de toute façon (WATCH_ONLY).
 */
import React from 'react';
import { router } from 'expo-router';
import { Button, ScreenHeader } from './kit';
import { NovaHero } from './nova';
import { PremiumScreen } from './premium';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';

export function useIsWatchOnly(): boolean {
  return useWallet((s) => s.wallets.find((w) => w.id === s.activeWalletId)?.type === 'watch');
}

export function withWatchOnlyGate<P extends object>(Screen: React.ComponentType<P>, opts: { header?: boolean } = {}) {
  return function Gated(props: P) {
    const watch = useIsWatchOnly();
    const t = useT();
    if (!watch) return <Screen {...props} />;
    return (
      <PremiumScreen>
        {opts.header !== false ? <ScreenHeader /> : null}
        <NovaHero icon="eye" title={t('watchBadge')} subtitle={t('watchBanner')} />
        <Button label={t('myWallets')} icon="wallets" variant="secondary" onPress={() => router.push('/wallets')} />
      </PremiumScreen>
    );
  };
}
