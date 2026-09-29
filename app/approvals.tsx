import { NovaCard, NovaHero } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import { fetchApprovalCandidates } from '../src/domain/security/goplus';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, RefreshControl } from 'react-native';
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
  /** Vérification incomplète : on ne dit JAMAIS « aucune approbation » dans ce cas. */
  const [incomplete, setIncomplete] = useState(false);
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
      const [tokens, candidates] = await Promise.all([
        getErc20Tokens(chain, account.address).catch(() => []),
        chain.evmChainId ? fetchApprovalCandidates(chain.evmChainId, account.address) : Promise.resolve(null),
      ]);
      const report = await adapter.getApprovalsReport(account.address, tokens, candidates);
      setItems(report.items);
      setIncomplete(report.incomplete);
    } catch {
      setItems([]);
      setIncomplete(true);
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
      <ScreenHeader />
      <NovaHero icon="security" title={t('spendApprovals')} subtitle={t('approvalsIntro').replace('{chain}', chain.name)} />

      {!isEvm ? (
        <GlassCard>
          <Text style={typography.muted}>{t('approvalsEvmOnly')}</Text>
        </GlassCard>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
          contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }}
        >
          {items == null ? (
            <GlassCard>{[0, 1, 2].map((i) => <SkeletonRow key={i} divider={i > 0} />)}</GlassCard>
          ) : items.length === 0 && incomplete ? (
            <GlassCard>
              <View style={{ alignItems: 'center', paddingVertical: spacing(3), gap: spacing(1) }}>
                <Icon name="warning" size={30} color={colors.warning} />
                <Text style={typography.bodyStrong}>{t('approvalsNotChecked')}</Text>
                <Text style={[typography.muted, { textAlign: 'center' }]}>{t('approvalsIncomplete')}</Text>
              </View>
            </GlassCard>
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
            items.map((it, idx) => {
              const unlimited = isUnlimited(it.allowance);
              return (
                <NovaCard key={`${it.token}-${it.spender}`} delay={Math.min(idx, 8) * 50} style={unlimited ? { borderColor: 'rgba(255,77,94,0.35)' } : undefined}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                    {it.logo ? (
                      <Image source={{ uri: it.logo }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <Avatar label={it.symbol.slice(0, 1)} color={colors.surface2} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={typography.bodyStrong}>{it.symbol}</Text>
                      <Text style={typography.muted}>{t('approvedTo')} {it.spenderName ? `${it.spenderName} · ${shorten(it.spender)}` : shorten(it.spender)}</Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 12,
                        backgroundColor: unlimited ? 'rgba(255,92,92,0.15)' : colors.surface2,
                      }}
                    >
                      <Text style={{ color: unlimited ? colors.danger : colors.textSecondary, fontSize: 12, fontFamily: fonts.semibold }}>
                        {unlimited ? `∞ ${t('unlimitedLabel')}` : `${formatTokenAmount(it.allowance, it.decimals)}`}
                      </Text>
                    </View>
                  </View>
                  {/*
                    TRANSACTION THEATER (docs/08 §13) : intention → conséquence →
                    détails techniques. L'écran montrait l'INFORMATION (le montant
                    autorisé) sans dire ce qu'elle IMPLIQUE. Une autorisation
                    illimitée affichée « ∞ » est parfaitement exacte et
                    parfaitement incompréhensible pour qui ne connaît pas le
                    mécanisme des allowances ERC-20. On dit donc d'abord ce que
                    l'app PEUT FAIRE, en français courant, et ce qui reste
                    possible plus tard.
                  */}
                  {it.risky ? <Text style={{ color: colors.danger, fontFamily: fonts.semibold, marginTop: spacing(1) }}>{t('approvalRisky')}</Text> : null}
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                    {unlimited
                      ? t('approvalIntentUnlimited').replace('{symbol}', it.symbol)
                      : t('approvalIntentLimited')
                          .replace('{amount}', formatTokenAmount(it.allowance, it.decimals))
                          .replace('{symbol}', it.symbol)}
                  </Text>
                  <KPressable
                    onPress={() => setTarget(it)}
                    style={{ marginTop: spacing(1.5), alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 23, backgroundColor: 'rgba(255,77,94,0.10)' }}
                  >
                    <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('revoke')}</Text>
                  </KPressable>
                </NovaCard>
              );
            })
          )}

          {items && items.length > 0 && incomplete ? (
            <Text style={[typography.muted, { textAlign: 'center' }]}>{t('approvalsIncomplete')}</Text>
          ) : null}
          {items && items.length > 0 && chain.explorerUrl ? (
            <KPressable onPress={() => Linking.openURL(chain.explorerUrl!)} style={{ alignSelf: 'center', paddingVertical: spacing(1) }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('revokeIsTx')}</Text>
            </KPressable>
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
