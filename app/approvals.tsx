import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { PremiumScreen, GlassCard, SkeletonRow, Avatar } from '../ui/premium';
import { PinPromptModal } from '../ui/PinPromptModal';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import {
  getAdapter,
  EvmChainAdapter,
  getErc20Tokens,
  formatBalance,
  isUnlimited,
  revokeCalldata,
  type ApprovalItem,
} from '../src';

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Approvals() {
  const { colors, typography } = useTheme();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const sendRawTxOn = useWallet((s) => s.sendRawTxOn);
  const pinLength = useSettings((s) => s.pinLength);
  const chain = getAdapter(activeChain).config;
  const isEvm = chain.family === 'evm';

  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Approbation en cours de révocation (attente du PIN).
  const [target, setTarget] = useState<ApprovalItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinErr, setPinErr] = useState(0);

  const load = useCallback(async () => {
    if (!account || !isEvm) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const adapter = getAdapter(activeChain);
      if (!(adapter instanceof EvmChainAdapter)) {
        setItems([]);
        return;
      }
      const tokens = await getErc20Tokens(chain, account.address);
      const approvals = await adapter.getApprovals(account.address, tokens);
      setItems(approvals);
    } catch {
      setItems([]);
      toast.error('Erreur', 'Impossible de charger les approbations.');
    } finally {
      setLoading(false);
    }
  }, [account, activeChain, chain, isEvm]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (pin: string) => {
    if (!target) return;
    setBusy(true);
    try {
      await sendRawTxOn(
        { pin },
        activeChain,
        { to: target.token, data: revokeCalldata(target.spender), value: 0n, chainId: chain.evmChainId! },
      );
      toast.success('Révocation envoyée', `${target.symbol} · ${shorten(target.spender)}`);
      // Retire l'entrée localement (la tx est en cours de minage).
      setItems((cur) => (cur ?? []).filter((x) => !(x.token === target.token && x.spender === target.spender)));
      setTarget(null);
    } catch (e) {
      setPinErr((n) => n + 1);
      toast.error('Échec', e instanceof Error ? e.message.slice(0, 80) : 'Révocation impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Approbations' }} />

      <View style={{ alignItems: 'center', gap: spacing(1), marginBottom: spacing(0.5) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="security" size={26} color={colors.accent} />
        </View>
        <Text style={typography.title}>Autorisations de dépense</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          Les contrats que tu as autorisés à dépenser tes tokens sur {chain.name}. Révoque ce que tu n’utilises plus.
        </Text>
      </View>

      {!isEvm ? (
        <GlassCard>
          <Text style={typography.muted}>Les approbations concernent les réseaux EVM. Change de réseau depuis l’accueil.</Text>
        </GlassCard>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
          contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }}
        >
          {items == null ? (
            <GlassCard>{[0, 1, 2].map((i) => <SkeletonRow key={i} divider={i > 0} />)}</GlassCard>
          ) : items.length === 0 ? (
            <GlassCard>
              <View style={{ alignItems: 'center', paddingVertical: spacing(3), gap: spacing(1) }}>
                <Icon name="check" size={30} color={colors.up} />
                <Text style={typography.bodyStrong}>Aucune approbation active</Text>
                <Text style={[typography.muted, { textAlign: 'center' }]}>
                  Rien à révoquer sur tes tokens détenus. C’est le bon état.
                </Text>
              </View>
            </GlassCard>
          ) : (
            items.map((it) => {
              const unlimited = isUnlimited(it.allowance);
              return (
                <GlassCard key={`${it.token}-${it.spender}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                    {it.logo ? (
                      <Image source={{ uri: it.logo }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <Avatar label={it.symbol.slice(0, 1)} color={colors.glassStrong} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={typography.bodyStrong}>{it.symbol}</Text>
                      <Text style={typography.muted}>Autorisé : {shorten(it.spender)}</Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                        backgroundColor: unlimited ? 'rgba(255,92,92,0.15)' : colors.glassStrong,
                      }}
                    >
                      <Text style={{ color: unlimited ? colors.danger : colors.textMuted, fontSize: 12, fontFamily: fonts.semibold }}>
                        {unlimited ? '∞ Illimité' : `${formatBalance(it.allowance, it.decimals, 4)}`}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => { setPinErr(0); setTarget(it); }}
                    style={{ marginTop: spacing(1.5), alignItems: 'center', paddingVertical: spacing(1.25), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.danger + '66' }}
                  >
                    <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>Révoquer</Text>
                  </Pressable>
                </GlassCard>
              );
            })
          )}

          {items && items.length > 0 && chain.explorerUrl ? (
            <Pressable onPress={() => Linking.openURL(chain.explorerUrl!)} style={{ alignSelf: 'center', paddingVertical: spacing(1) }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Une révocation est une transaction (frais de réseau).</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <PinPromptModal
        visible={target != null}
        title="Confirmer la révocation"
        subtitle={target ? `Retirer l’autorisation de ${shorten(target.spender)} sur ${target.symbol}.` : undefined}
        expectedLength={pinLength >= 6 ? pinLength : undefined}
        busy={busy}
        errorSignal={pinErr}
        onSubmit={revoke}
        onCancel={() => setTarget(null)}
      />
    </PremiumScreen>
  );
}
