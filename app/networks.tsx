import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Title, Muted } from '../ui/components';
import { SearchBar, RemoteIcon } from '../ui/premium';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { listChains, chainIconUrl } from '../src';

export default function Networks() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);

  const showTestnets = useSettings((s) => s.showTestnets);
  const all = useMemo(() => listChains({ includeTestnets: showTestnets }), [showTestnets]);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const scrolledOnce = useRef(false);

  const q = query.trim().toLowerCase();
  const chains = q
    ? all.filter((c) => c.name.toLowerCase().includes(q) || c.nativeSymbol.toLowerCase().includes(q))
    : all;

  const choose = (id: string) => {
    setActiveChain(id);
    router.back();
  };

  // Réseau actif rendu visible à l'ouverture (scroll vers sa position, une fois).
  const onActiveLayout = (y: number) => {
    if (scrolledOnce.current || q) return;
    scrolledOnce.current = true;
    if (y > 220) setTimeout(() => scrollRef.current?.scrollTo({ y: y - 120, animated: false }), 0);
  };

  return (
    <Screen>
      <Title>Réseau</Title>
      <Muted>Même adresse sur tous les réseaux EVM. Seul le réseau interrogé change.</Muted>

      {all.length > 6 ? (
        <View style={{ marginTop: spacing(1) }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Rechercher un réseau…" />
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, marginTop: spacing(1) }}
        contentContainerStyle={{ gap: spacing(1.5), paddingBottom: insets.bottom + spacing(6) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {chains.length === 0 ? (
          <Card>
            <Muted>Aucun réseau ne correspond à « {query} ».</Muted>
          </Card>
        ) : (
          chains.map((c) => {
            const active = c.id === activeChain;
            return (
              <Pressable
                key={c.id}
                onPress={() => choose(c.id)}
                onLayout={active ? (e) => onActiveLayout(e.nativeEvent.layout.y) : undefined}
              >
                <Card
                  style={{
                    borderColor: active ? colors.accent : colors.cardBorder,
                    borderWidth: active ? 1.5 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), flex: 1 }}>
                    <RemoteIcon uri={chainIconUrl(c.id)} label={c.nativeSymbol} size={36} />
                    <View>
                      <Text style={typography.body}>{c.name}</Text>
                      <Muted>
                        {c.nativeSymbol}
                        {c.testnet ? ' · testnet' : ' · mainnet (fonds réels)'}
                      </Muted>
                    </View>
                  </View>
                  {active ? <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text> : null}
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
