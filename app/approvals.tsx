import { NovaCard, NovaHero } from '../ui/nova';
import { withWatchOnlyGate } from '../ui/WatchOnlyGate';
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
import { fill } from '../lib/i18n';
import { friendlyTxError } from '../lib/txError';
import {
  getAdapter,
  EvmChainAdapter,
  getErc20Tokens,
  formatTokenAmount,
  isUnlimited,
  type ApprovalItem,
} from '../src';

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function ApprovalsInner() {
  const { colors, typography } = useTheme();
  const t = useT();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const revokeApprovals = useWallet((s) => s.revokeApprovals);
  const chain = getAdapter(activeChain).config;
  const isEvm = chain.family === 'evm';

  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  /** Vérification incomplète : on ne dit JAMAIS « aucune approbation » dans ce cas. */
  const [incomplete, setIncomplete] = useState(false);
  const [loading, setLoading] = useState(false);
  /*
   * RÉVOCATION GROUPÉE. On coche ce qu'on veut retirer (ou « Révoquer » sur une
   * carte = elle seule), UNE confirmation, puis une transaction par
   * autorisation (store.revokeApprovals). La progression reste à l'écran.
   */
  const keyOf = (it: { token: string; spender: string }) => `${it.token.toLowerCase()}-${it.spender.toLowerCase()}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (it: ApprovalItem) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(keyOf(it))) next.delete(keyOf(it));
      else next.add(keyOf(it));
      return next;
    });
  // Autorisations à révoquer (attente de confirmation biométrie/PIN).
  const [targets, setTargets] = useState<ApprovalItem[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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
      // Les plus dangereuses d'abord : signalées, puis illimitées.
      const rank = (x: ApprovalItem) => (x.risky ? 0 : isUnlimited(x.allowance) ? 1 : 2);
      setItems([...report.items].sort((a, b) => rank(a) - rank(b)));
      setIncomplete(report.incomplete);
      setSelected(new Set());
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

  /**
   * Exécuté par ConfirmUnlock. Rend la main dès la clé lue (code faux → rejet,
   * la feuille le signale) ; les transactions partent ensuite, progression à
   * l'écran — un lot dépasse vite le délai de la fenêtre biométrique.
   */
  const perform = (unlock: Unlock) =>
    new Promise<void>((resolve, reject) => {
      const list = targets ?? [];
      if (!list.length) return resolve();
      let unlocked = false;
      revokeApprovals(unlock, activeChain, list, {
        onUnlocked: () => {
          unlocked = true;
          setProgress({ done: 0, total: list.length });
          resolve();
        },
        onProgress: (done, total) => setProgress({ done, total }),
      })
        .then((res) => {
          const sentKeys = new Set(list.filter((_, k) => res[k].status === 'sent').map(keyOf));
          const skipped = res.filter((r) => r.status === 'skipped').length;
          const stop = res.find((r) => r.status === 'failed');
          const notSent = res.filter((r) => r.status === 'notSent').length;
          // Retirées localement (les transactions se confirment) ; le reste reste coché pour réessayer.
          setItems((cur) => (cur ?? []).filter((x) => !sentKeys.has(keyOf(x))));
          setSelected(new Set(list.filter((x) => !sentKeys.has(keyOf(x))).map(keyOf)));
          if (sentKeys.size) toast.success(t('revokeSent'), fill(t('revokeBatchDone'), { count: String(sentKeys.size) }));
          if (skipped) toast.warning(t('revoke'), fill(t('revokeBatchSkipped'), { count: String(skipped) }));
          if (stop && stop.status === 'failed') {
            toast.error(t('revoke'), fill(t('revokeBatchStopped'), { reason: friendlyTxError(stop.error, t as never), count: String(notSent + 1) }));
          }
        })
        .catch((e) => {
          if (!unlocked) reject(e);
          else toast.error(t('revoke'), friendlyTxError(e, t as never));
        })
        .finally(() => {
          setProgress(null);
          setTargets(null);
        });
    });

  const selectedItems = (items ?? []).filter((x) => selected.has(keyOf(x)));
  const busy = progress !== null;

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
            <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), justifyContent: 'center' }}>
              <KPressable disabled={busy} onPress={() => setSelected(new Set(items.map(keyOf)))} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surface2 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontFamily: fonts.semibold }}>{t('selectAllApprovals')}</Text>
              </KPressable>
              {items.some((x) => isUnlimited(x.allowance)) ? (
                <KPressable disabled={busy} onPress={() => setSelected(new Set(items.filter((x) => isUnlimited(x.allowance) || x.risky).map(keyOf)))} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surface2 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontFamily: fonts.semibold }}>{t('selectUnlimitedApprovals')}</Text>
                </KPressable>
              ) : null}
              {selected.size ? (
                <KPressable disabled={busy} onPress={() => setSelected(new Set())} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('clearSelection')}</Text>
                </KPressable>
              ) : null}
            </View>
            {items.map((it, idx) => {
              const unlimited = isUnlimited(it.allowance);
              return (
                <NovaCard key={`${it.token}-${it.spender}`} delay={Math.min(idx, 8) * 50} style={unlimited ? { borderColor: 'rgba(255,77,94,0.35)' } : undefined}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                    <KPressable
                      onPress={() => toggle(it)}
                      disabled={busy}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected.has(keyOf(it)) }}
                      accessibilityLabel={`${t('revoke')} ${it.symbol}`}
                      style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected.has(keyOf(it)) ? colors.danger : colors.border, backgroundColor: selected.has(keyOf(it)) ? colors.danger : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {selected.has(keyOf(it)) ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
                    </KPressable>
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
                    onPress={() => setTargets([it])}
                    disabled={busy}
                    style={{ marginTop: spacing(1.5), alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 23, backgroundColor: 'rgba(255,77,94,0.10)' }}
                  >
                    <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('revoke')}</Text>
                  </KPressable>
                </NovaCard>
              );
            })}
            </>
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

      {isEvm && (busy || selectedItems.length > 0) ? (
        <KPressable
          onPress={() => setTargets(selectedItems)}
          disabled={busy}
          accessibilityRole="button"
          style={{ marginTop: spacing(1), height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, opacity: busy ? 0.7 : 1 }}
        >
          <Text style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: 15 }}>
            {busy && progress ? fill(t('revokeProgress'), { done: String(Math.min(progress.done + 1, progress.total)), total: String(progress.total) }) : fill(t('revokeSelected'), { count: String(selectedItems.length) })}
          </Text>
        </KPressable>
      ) : null}

      <ConfirmUnlock
        visible={targets != null && !busy}
        title={targets && targets.length > 1 ? fill(t('revokeBatchTitle'), { count: String(targets.length) }) : t('confirmRevoke')}
        subtitle={
          targets && targets.length > 1
            ? t('revokeBatchSubtitle')
            : targets?.[0]
              ? t('revokeSubtitle').replace('{spender}', shorten(targets[0].spender)).replace('{symbol}', targets[0].symbol)
              : undefined
        }
        perform={perform}
        onDone={() => undefined}
        onCancel={() => setTargets(null)}
      />
    </PremiumScreen>
    </>
  );
}

// Lecture seule : rien à signer ni à recevoir à son nom ici (ui/WatchOnlyGate).
export default withWatchOnlyGate(ApprovalsInner);
