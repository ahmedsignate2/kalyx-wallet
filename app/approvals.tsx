import { ScreenHeader } from '../ui/kit';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { PremiumScreen, GlassCard, SkeletonRow, Avatar } from '../ui/premium';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import {
  getAdapter,
  EvmChainAdapter,
  getErc20Tokens,
  formatTokenAmount,
  isUnlimited,
  revokeCalldata,
  type ApprovalItem,
} from '../src';

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Approvals() {
  const { colors, typography } = useTheme();
  const t = useT();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const sendRawTxOn = useWallet((s) => s.sendRawTxOn);
  const chain = getAdapter(activeChain).config;
  const isEvm = chain.family === 'evm';

  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Approbation en cours de révocation (attente de confirmation biométrie/PIN).
  const [target, setTarget] = useState<ApprovalItem | null>(null);

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
      toast.error(t('errorTitle'), t('cannotLoadApprovals'));
    } finally {
      setLoading(false);
    }
  }, [account, activeChain, chain, isEvm]);

  useEffect(() => {
    load();
  }, [load]);

  // Exécuté par ConfirmUnlock (biométrie ou PIN) ; LÈVE pour laisser la feuille gérer.
  const perform = async (unlock: Unlock) => {
    if (!target) return;
    await sendRawTxOn(
      unlock,
      activeChain,
      { to: target.token, data: revokeCalldata(target.spender), value: 0n, chainId: chain.evmChainId! },
    );
    toast.success(t('revokeSent'), `${target.symbol} · ${shorten(target.spender)}`);
    // Retire l'entrée localement (la tx est en cours de minage).
    setItems((cur) => (cur ?? []).filter((x) => !(x.token === target.token && x.spender === target.spender)));
    setTarget(null);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader title={t('approvals')} />

      <View style={{ alignItems: 'center', gap: spacing(1), marginBottom: spacing(0.5) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="security" size={26} color={colors.accent} />
        </View>
        <Text style={typography.title}>{t('spendApprovals')}</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          {t('approvalsIntro').replace('{chain}', chain.name)}
        </Text>
      </View>

      {!isEvm ? (
        <GlassCard>
          <Text style={typography.muted}>{t('approvalsEvmOnly')}</Text>
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
                <Text style={typography.bodyStrong}>{t('noActiveApprovals')}</Text>
                <Text style={[typography.muted, { textAlign: 'center' }]}>
                  {t('nothingToRevoke')}
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
                      <Text style={typography.muted}>{t('approvedTo')} {shorten(it.spender)}</Text>
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
                        {unlimited ? `∞ ${t('unlimitedLabel')}` : `${formatTokenAmount(it.allowance, it.decimals)}`}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setTarget(it)}
                    style={{ marginTop: spacing(1.5), alignItems: 'center', paddingVertical: spacing(1.25), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.danger + '66' }}
                  >
                    <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('revoke')}</Text>
                  </Pressable>
                </GlassCard>
              );
            })
          )}

          {items && items.length > 0 && chain.explorerUrl ? (
            <Pressable onPress={() => Linking.openURL(chain.explorerUrl!)} style={{ alignSelf: 'center', paddingVertical: spacing(1) }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('revokeIsTx')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <ConfirmUnlock
        visible={target != null}
        title={t('confirmRevoke')}
        subtitle={target ? t('revokeSubtitle').replace('{spender}', shorten(target.spender)).replace('{symbol}', target.symbol) : undefined}
        perform={perform}
        onDone={() => setTarget(null)}
        onCancel={() => setTarget(null)}
      />
    </PremiumScreen>
    </>
  );
}
