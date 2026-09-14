/**
 * Centre de sécurité (§4.8) — au premier plan, pas caché dans un site externe.
 * Un score simple = une liste de vérifications :
 *  - phrase de récupération sauvegardée et vérifiée
 *  - biométrie activée · verrouillage automatique réglé
 *  - approbations actives (réseau actif) avec « Révoquer »
 *  - sessions WalletConnect ouvertes avec « Déconnecter »
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, IconButton, Surface, Divider, ListRow, TokenIcon, Skeleton, Chip, Pressable } from '../ui/kit';
import { Icon, type IconName } from '../ui/icon';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { useWalletConnect } from '../lib/walletconnect';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { friendlyTxError } from '../lib/txError';
import { getAdapter, getErc20Tokens, revokeCalldata, isUnlimited, formatTokenAmount, shortAddress, EvmChainAdapter, type ApprovalItem } from '../src';

function Check({ ok, icon, title, body, actionLabel, onAction }: { ok: boolean | null; icon: IconName; title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const color = ok === null ? colors.textTertiary : ok ? colors.up : colors.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], paddingHorizontal: space[4] }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ok ? 'check' : icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body">{title}</Text>
        <Text variant="caption" tone="secondary">{body}</Text>
      </View>
      {!ok && actionLabel && onAction ? <Chip label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export default function SecurityCenter() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const sendRawTxOn = useWallet((s) => s.sendRawTxOn);
  const chain = getAdapter(activeChain).config;
  const backupVerified = useSettings((s) => s.backupVerified);
  const encryptedBackupDone = useSettings((s) => s.encryptedBackupAt !== null);
  const biometric = useSettings((s) => s.biometricEnabled);
  const autoLock = useSettings((s) => s.autoLockMinutes);
  const sessions = useWalletConnect((s) => s.sessions);
  const disconnect = useWalletConnect((s) => s.disconnect);

  const [approvals, setApprovals] = useState<ApprovalItem[] | null>(null);
  const [target, setTarget] = useState<ApprovalItem | null>(null);

  const loadApprovals = useCallback(async () => {
    if (!account) return;
    const adapter = getAdapter(activeChain);
    if (!(adapter instanceof EvmChainAdapter)) return setApprovals([]);
    try {
      const tokens = await getErc20Tokens(chain, account.address);
      setApprovals(await adapter.getApprovals(account.address, tokens));
    } catch {
      setApprovals([]);
    }
  }, [account, activeChain, chain]);
  useEffect(() => {
    setApprovals(null);
    void loadApprovals();
  }, [loadApprovals]);

  const revoke = async (unlock: Unlock) => {
    if (!target || !chain.evmChainId) return;
    try {
      await sendRawTxOn(unlock, activeChain, { to: target.token, data: revokeCalldata(target.spender), value: 0n, chainId: chain.evmChainId });
      haptic.success();
      toast.success(t("revokeSent"), `${target.symbol} · ${shortAddress(target.spender)}`);
      setApprovals((list) => (list ?? []).filter((a) => a !== target));
    } catch (e) {
      throw new Error(friendlyTxError(e));
    }
  };

  const checks = useMemo(() => [backupVerified, encryptedBackupDone, biometric, autoLock > 0 && autoLock <= 15, (approvals ?? []).every((a) => !isUnlimited(a.allowance)), sessions.length <= 3], [backupVerified, encryptedBackupDone, biometric, autoLock, approvals, sessions.length]);
  const score = checks.filter(Boolean).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/menu'))} />
        <Text variant="title2" style={{ flex: 1 }}>{t("security")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[5] }}>
        <View>
          <Text variant="balance" tabular>{score}<Text variant="title2" tone="secondary">/{checks.length}</Text></Text>
          <Text variant="bodySecondary" tone="secondary">{score === checks.length ? t("allGood") : t("pointsToFix")}</Text>
        </View>

        <Surface padded={false}>
          <Check ok={backupVerified} icon="phrase" title={t("recoveryPhraseVerified")} body={backupVerified ? t("recoveryPhraseVerifiedMsg") : t("recoveryPhraseNotVerifiedMsg")} actionLabel={t("verify")} onAction={() => router.push('/reveal-phrase')} />
          <Divider inset={68} />
          <Check ok={encryptedBackupDone} icon="share" title={t('encBackup')} body={encryptedBackupDone ? t('encBackupDoneMsg') : t('encBackupTodoMsg')} actionLabel={t('createBackupBtn')} onAction={() => router.push('/cloud-backup')} />
          <Divider inset={68} />
          <Check ok={biometric} icon="security" title={t("biometricsEnabled")} body={biometric ? t("biometricsEnabledMsg") : t("biometricsDisabledMsg")} actionLabel={t("enable")} onAction={() => router.push('/settings')} />
          <Divider inset={68} />
          <Check ok={autoLock > 0 && autoLock <= 15} icon="lock" title={t("autoLock")} body={autoLock > 0 ? t('autoLockEnabledMsg').replace('{min}', String(autoLock)) : t("autoLockDisabledMsg")} actionLabel={t("configure")} onAction={() => router.push('/settings')} />
        </Surface>

        {/* Approbations */}
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" tone="secondary">{t("approvedContracts")} · {chain.name}</Text>
          </View>
          <Surface padded={false}>
            {approvals === null ? (
              [0, 1].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center', gap: space[2] }}><Skeleton width="60%" /><Skeleton width="40%" height={12} /></View>)
            ) : approvals.length === 0 ? (
              <View style={{ padding: space[4] }}><Text variant="bodySecondary" tone="secondary">{chain.family === 'evm' ? t("noApprovalsEvm") : t("noApprovalsNonEvm")}</Text></View>
            ) : (
              approvals.map((a, i) => (
                <React.Fragment key={`${a.token}-${a.spender}`}>
                  <ListRow
                    left={<TokenIcon symbol={a.symbol} logo={a.logo} seed={a.token} size={36} />}
                    title={`${a.symbol} → ${shortAddress(a.spender)}`}
                    subtitle={isUnlimited(a.allowance) ? t("unlimitedAmount") : t("upToAmount").replace('{amount}', `${formatTokenAmount(a.allowance, a.decimals)} ${a.symbol}`)}
                    right={<Chip label={t("revoke")} onPress={() => setTarget(a)} />}
                  />
                  {i < approvals.length - 1 ? <Divider inset={64} /> : null}
                </React.Fragment>
              ))
            )}
          </Surface>
        </View>

        {/* Sessions WalletConnect */}
        <View style={{ gap: space[2] }}>
          <Text variant="caption" tone="secondary">{t("connectedSites")}</Text>
          <Surface padded={false}>
            {sessions.length === 0 ? (
              <View style={{ padding: space[4] }}><Text variant="bodySecondary" tone="secondary">{t("noConnectedSites")}</Text></View>
            ) : (
              sessions.map((s, i) => (
                <React.Fragment key={s.topic}>
                  <ListRow title={s.name} subtitle={s.url.replace(/^[a-z]+:\/\//i, '')} right={<Chip label={t("disconnect")} onPress={() => disconnect(s.topic).then(() => toast.success(t("disconnected"), s.name)).catch(() => toast.error(t("cannotDisconnect")))} />} />
                  {i < sessions.length - 1 ? <Divider inset={16} /> : null}
                </React.Fragment>
              ))
            )}
          </Surface>
        </View>

        <Pressable onPress={() => router.push('/settings')} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
          <Text variant="caption" tone="secondary">{t("allSecuritySettings")}</Text>
        </Pressable>
      </ScrollView>

      <ConfirmUnlock
        visible={!!target}
        title={t("revokeApproval")}
        subtitle={target ? `${target.symbol} · ${shortAddress(target.spender)} · ${chain.name}` : undefined}
        perform={revoke}
        onDone={() => setTarget(null)}
        onCancel={() => setTarget(null)}
      />
    </View>
  );
}
