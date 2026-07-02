import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useWallet } from '../lib/walletStore';
import { colors } from '../ui/theme';

/** Écran de démarrage : redirige selon l'existence d'un wallet. */
export default function Index() {
  const ready = useWallet((s) => s.ready);
  const hasWallet = useWallet((s) => s.hasWallet);

  useEffect(() => {
    if (!ready) return;
    router.replace(hasWallet ? '/home' : '/welcome');
  }, [ready, hasWallet]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
