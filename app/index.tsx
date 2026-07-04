import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useWallet } from '../lib/walletStore';
import { useTheme } from '../ui/theme';

/** Écran de démarrage : redirige selon l'état (wallet ? verrouillé ?). */
export default function Index() {
  const { colors } = useTheme();
  const ready = useWallet((s) => s.ready);
  const hasWallet = useWallet((s) => s.hasWallet);
  const isUnlocked = useWallet((s) => s.isUnlocked);

  useEffect(() => {
    if (!ready) return;
    if (!hasWallet) router.replace('/welcome');
    else if (!isUnlocked) router.replace('/unlock');
    else router.replace('/home');
  }, [ready, hasWallet, isUnlocked]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
