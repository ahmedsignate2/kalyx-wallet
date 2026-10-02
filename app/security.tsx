/**
 * Centre de sécurité (§4.8) — au premier plan, pas caché dans un site externe.
 * Un score simple = une liste de vérifications :
 *  - phrase de récupération sauvegardée et vérifiée
 *  - biométrie activée · verrouillage automatique réglé
 *  - approbations actives (réseau actif) avec « Révoquer »
 *  - sessions WalletConnect ouvertes avec « Déconnecter »
 */
import { GOLD, NovaHero, SectionLabel } from '../ui/nova';
import { IsMyAddress } from '../ui/IsMyAddress';
import { useWhitelist } from '../lib/whitelistStore';
import Svg, { Circle } from 'react-native-svg';
import { fetchApprovalCandidates } from '../src/domain/security/goplus';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Surface, Divider, ListRow, TokenIcon, Skeleton, Chip, Pressable, ScreenHeader } from '../ui/kit';
import { Icon, type IconName } from '../ui/icon';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { useWalletConnect } from '../lib/walletconnect';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { getAdapter, getErc20Tokens, revokeCalldata, isUnlimited, formatTokenAmount, shortAddress, EvmChainAdapter, type ApprovalItem } from '../src';

function Check({ ok, icon, title, body, actionLabel, onAction }: { ok: boolean | null; icon: IconName; title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const color = ok === null ? colors.textTertiary : ok ? colors.up : colors.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[3], paddingHorizontal: space[4] }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ok ? 'check' : icon} size={18} color={color} />
      </View>
      {/* L'action passe SOUS le texte : à droite, elle écrasait la phrase sur huit lignes. */}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="body">{title}</Text>
        <Text variant="caption" tone="secondary">{body}</Text>
        {!ok && actionLabel && onAction ? <View style={{ alignSelf: 'flex-start', marginTop: space[2] }}><Chip label={actionLabel} onPress={onAction} /></View> : null}
      </View>
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
  const wlOn = useWhitelist((s) => s.wl.enabled);
  useEffect(() => {
    void import('../lib/whitelistStore').then((m) => m.loadWhitelist());
  }, []);
  const encryptedBackupDone = useSettings((s) => s.encryptedBackupAt !== null);
  const biometric = useSettings((s) => s.biometricEnabled);
  const autoLock = useSettings((s) => s.autoLockMinutes);
  const sessions = useWalletConnect((s) => s.sessions);
  const disconnect = useWalletConnect((s) => s.disconnect);

  const [approvals, setApprovals] = useState<ApprovalItem[] | null>(null);
  const [approvalsIncomplete, setApprovalsIncomplete] = useState(false);
  const [target, setTarget] = useState<ApprovalItem | null>(null);

  const loadApprovals = useCallback(async () => {
    if (!account) return;
    const adapter = getAdapter(activeChain);
    if (!(adapter instanceof EvmChainAdapter)) return setApprovals([]);
    try {
      const [tokens, candidates] = await Promise.all([
        getErc20Tokens(chain, account.address).catch(() => []),
        chain.evmChainId ? fetchApprovalCandidates(chain.evmChainId, account.address) : Promise.resolve(null),
      ]);
      const report = await adapter.getApprovalsReport(account.address, tokens, candidates);
      setApprovals(report.items);
      setApprovalsIncomplete(report.incomplete);
    } catch {
      setApprovals([]);
      setApprovalsIncomplete(true);
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
      /*
       * L'ERREUR D'ORIGINE, relayée telle quelle : c'est ConfirmUnlock qui la
       * traduit (avec la langue). La traduire ici puis relancer une Error nue
       * la faisait retraduire à partir de sa phrase — qui ne correspondait plus
       * à rien : « Transaction échouée. Réessaie » à chaque fois, le vrai motif
       * perdu (loyer Solana, solde, mémo…).
       */
      throw e;
    }
  };

  const checks = useMemo(() => [backupVerified, encryptedBackupDone, biometric, autoLock > 0 && autoLock <= 15, !approvalsIncomplete && (approvals ?? []).every((a) => !isUnlimited(a.allowance)), sessions.length <= 3], [backupVerified, encryptedBackupDone, biometric, autoLock, approvals, approvalsIncomplete, sessions.length]);
  const score = checks.filter(Boolean).length;

  const allDone = score === checks.length;
  const R = 34;
  const C = 2 * Math.PI * R;
  /*
   * THÈME NOVA : même en-tête et même héros que les autres écrans secondaires.
   * L'anneau de score EST le disque du héros (vert quand tout est fait, or
   * tant qu'il reste des points), le titre et la phrase dessous.
   */
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[2], paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[5] }} showsVerticalScrollIndicator={false}>
        <ScreenHeader fallback="/menu" />
        <NovaHero title={t('security')} subtitle={allDone ? t('allGood') : t('pointsToFix')}>
          <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center', borderRadius: 40, backgroundColor: colors.surface1 }}>
            <Svg width={80} height={80} style={{ position: 'absolute' }}>
              <Circle cx={40} cy={40} r={R} stroke={colors.surface3} strokeWidth={6} fill="none" />
              <Circle cx={40} cy={40} r={R} stroke={allDone ? colors.up : GOLD} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={`${C * (checks.length ? score / checks.length : 0)} ${C}`} transform="rotate(-90 40 40)" />
            </Svg>
            <Text variant="title2" tabular>{score}<Text variant="caption" tone="secondary">/{checks.length}</Text></Text>
          </View>
        </NovaHero>

        <Surface padded={false}>
          <Check ok={backupVerified} icon="phrase" title={backupVerified ? t("recoveryPhraseVerified") : t("recoveryPhrase")} body={backupVerified ? t("recoveryPhraseVerifiedMsg") : t("recoveryPhraseNotVerifiedMsg")} actionLabel={t("verify")} onAction={() => router.push('/reveal-phrase')} />
          <Divider inset={68} />
          <Check ok={encryptedBackupDone} icon="share" title={t('encBackup')} body={encryptedBackupDone ? t('encBackupDoneMsg') : t('encBackupTodoMsg')} actionLabel={t('createBackupBtn')} onAction={() => router.push('/cloud-backup')} />
          <Divider inset={68} />
          <Check ok={biometric} icon="security" title={biometric ? t("biometricsEnabled") : t("biometrics")} body={biometric ? t("biometricsEnabledMsg") : t("biometricsDisabledMsg")} actionLabel={t("enable")} onAction={() => router.push('/settings')} />
          <Divider inset={68} />
          <Check ok={autoLock > 0 && autoLock <= 15} icon="lock" title={t("autoLock")} body={autoLock > 0 ? t('autoLockEnabledMsg').replace('{min}', String(autoLock)) : t("autoLockDisabledMsg")} actionLabel={t("configure")} onAction={() => router.push('/settings')} />
        </Surface>

        {/* Approbations */}
        <View style={{ gap: space[2] }}>
          <SectionLabel>{`${t("approvedContracts")} · ${chain.name}`}</SectionLabel>
          <Surface padded={false}>
            {approvals === null ? (
              [0, 1].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center', gap: space[2] }}><Skeleton width="60%" /><Skeleton width="40%" height={12} /></View>)
            ) : approvals.length === 0 && approvalsIncomplete ? (
              <View style={{ padding: space[4] }}><Text variant="bodySecondary" tone="warning">{t('approvalsIncomplete')}</Text></View>
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

        {/* Vérifier qu'une adresse est bien à soi (avant de la partager). */}
        <IsMyAddress />

        {/* Liste blanche des destinataires (anti-vol : ajouts et désactivation différés de 24 h). */}
        <Pressable onPress={() => router.push('/whitelist')} accessibilityRole="button" accessibilityLabel={t('wlTitle')}>
          <Surface>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <Icon name="security" size={20} color={wlOn ? colors.up : colors.textSecondary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body">{t('wlTitle')}</Text>
                <Text variant="caption" tone="secondary" numberOfLines={2}>{wlOn ? t('wlActiveBadge') : t('wlEnable')}</Text>
              </View>
              <Icon name="chevron" size={16} color={colors.textTertiary} />
            </View>
          </Surface>
        </Pressable>

        {/* Sessions WalletConnect */}
        <View style={{ gap: space[2] }}>
          <SectionLabel>{t("connectedSites")}</SectionLabel>
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
