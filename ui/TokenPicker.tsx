import { useT } from "../lib/settingsStore";
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Image, Modal, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { fonts, radii, spacing, useTheme } from './theme';
import { haptic } from '../lib/haptics';
import { Icon } from './icon';
import { getAdapter, listChains } from '../src';
import { useTokenStore, type Tok } from '../lib/tokenStore';
import { useWallet } from '../lib/walletStore';
import { formatAmount, formatTokenAmount } from '../src';

interface TokenPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (token: Tok, chainId: string) => void;
  initialChainId: string;
}

export function TokenPicker({ visible, onClose, onSelect, initialChainId }: TokenPickerProps) {
  const t = useT();
  const { colors, typography } = useTheme();
  const [search, setSearch] = useState('');
  const [selectedChain, setSelectedChain] = useState(initialChainId);
  const [heldTokens, setHeldTokens] = useState<Record<string, bigint>>({});

  const fetchTokens = useTokenStore(s => s.fetchTokens);
  const tokensByChain = useTokenStore(s => s.tokensByChain);
  const loading = useTokenStore(s => s.loading);
  const account = useWallet(s => s.account);

  const chains = useMemo(() => listChains({ includeTestnets: false }).filter(c => c.family === 'evm' || c.family === 'solana'), []);

  useEffect(() => {
    if (visible && account?.address) {
      fetchTokens(selectedChain);
      
      // 1. Fetch native balance for selectedChain
      getAdapter(selectedChain).getBalance(account.address).then(b => {
        setHeldTokens(prev => ({
          ...prev,
          ['0x0000000000000000000000000000000000000000']: b.raw,
          ['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee']: b.raw,
          ['11111111111111111111111111111111']: b.raw,
          ['so11111111111111111111111111111111111111112']: b.raw,
        }));
      }).catch(() => {});

      // 2. Fetch token balances for selectedChain
      const adapter = getAdapter(selectedChain) as any;
      if (adapter.getSplTokens) {
        adapter.getSplTokens(account.address).then((tokens: any[]) => {
          const map: Record<string, bigint> = {};
          tokens.forEach(t => map[t.mint.toLowerCase()] = t.raw);
          setHeldTokens(prev => ({ ...prev, ...map }));
        }).catch(() => {});
      }
      if (adapter.config.family === 'evm') {
        import('../src').then(src => {
           src.getErc20Tokens(adapter.config, account.address).then((tokens: any[]) => {
              const map: Record<string, bigint> = {};
              tokens.forEach((t: any) => { map[t.contract.toLowerCase()] = t.raw; });
              setHeldTokens(prev => ({ ...prev, ...map }));
           }).catch(() => {});
        });
      }
    }
  }, [visible, selectedChain, fetchTokens, account]);

  const rawTokens = tokensByChain[selectedChain] ?? [];
  const isLoading = loading[selectedChain] && rawTokens.length === 0;

  const filteredTokens = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return rawTokens;
    return rawTokens.filter(t => 
      t.symbol.toLowerCase().includes(q) || 
      t.name?.toLowerCase().includes(q) || 
      t.address.toLowerCase().includes(q)
    );
  }, [rawTokens, search]);

  const renderItem = ({ item }: { item: Tok }) => {
    const t = useT();
    const balance = heldTokens[item.address.toLowerCase()];
    return (
      <Pressable 
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          padding: spacing(1.5),
          backgroundColor: pressed ? colors.glass : 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: colors.glassBorder,
        })}
        onPress={() => {
          haptic.selection();
          onSelect(item, selectedChain);
          onClose();
        }}
      >
        <Image 
          source={{ uri: item.logo || 'https://via.placeholder.com/32' }} 
          style={{ width: 32, height: 32, borderRadius: 16, marginRight: spacing(1.5) }} 
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{item.symbol}</Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12 }}>{item.name || item.symbol}</Text>
        </View>
        {balance != null && balance > 0n ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{formatTokenAmount(balance, item.decimals)}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ height: '85%', backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' }}>
        <View style={{ padding: spacing(2), borderBottomWidth: 1, borderBottomColor: colors.glassBorder, backgroundColor: colors.bgElevated }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1.5) }}>
            <Text style={{ color: colors.text, fontFamily: fonts.extrabold, fontSize: 20 }}>{t("tokenSelect")}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Icon name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgDeep, borderRadius: radii.md, paddingHorizontal: spacing(1.5), height: 44 }}>
            <Icon name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("tokenSearchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, marginLeft: spacing(1) }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={{ paddingVertical: spacing(1), borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={chains}
            keyExtractor={c => c.id}
            contentContainerStyle={{ paddingHorizontal: spacing(2), gap: spacing(1) }}
            renderItem={({ item }) => {
              const active = item.id === selectedChain;
              return (
                <Pressable
                  onPress={() => {
                    haptic.selection();
                    setSelectedChain(item.id);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: spacing(0.75),
                    paddingHorizontal: spacing(1.25),
                    borderRadius: radii.pill,
                    backgroundColor: active ? colors.accent : colors.glass,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.glassBorder,
                  }}
                >
                  <Text style={{ color: active ? colors.onPrimary : colors.text, fontFamily: fonts.semibold, fontSize: 14 }}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>

        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <FlatList
            data={filteredTokens}
            keyExtractor={(item) => `${selectedChain}-${item.address}`}
            renderItem={renderItem}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={5}
            ListEmptyComponent={
              <View style={{ padding: spacing(4), alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontFamily: fonts.medium }}>{t("tokenNoneFound")}</Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
