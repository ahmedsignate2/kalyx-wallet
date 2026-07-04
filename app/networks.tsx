import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Title, Muted } from '../ui/components';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { listChains } from '../src';

export default function Networks() {
  const { colors, typography } = useTheme();
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);

  const choose = (id: string) => {
    setActiveChain(id);
    router.back();
  };

  return (
    <Screen>
      <Title>Réseau</Title>
      <Muted>Même adresse sur tous les réseaux EVM. Seul le réseau interrogé change.</Muted>
      <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
        {listChains().map((c) => {
          const active = c.id === activeChain;
          return (
            <Pressable key={c.id} onPress={() => choose(c.id)}>
              <Card
                style={{
                  borderColor: active ? colors.accent : colors.cardBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <Text style={typography.body}>{c.name}</Text>
                  <Muted>
                    {c.nativeSymbol}
                    {c.testnet ? ' · testnet' : ' · mainnet (fonds réels)'}
                  </Muted>
                </View>
                {active ? <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text> : null}
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
