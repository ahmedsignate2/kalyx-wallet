/**
 * LISTE BLANCHE DES DESTINATAIRES (écran Sécurité → Liste blanche).
 * Règles : src/domain/security/whitelist.ts ; état et verrou : lib/whitelistStore.ts.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, Input, ScreenHeader, Text, Pressable as KPressable } from '../ui/kit';
import { NovaCard, NovaHero } from '../ui/nova';
import { PremiumScreen } from '../ui/premium';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { fill } from '../lib/i18n';
import { toast } from '../lib/toast';
import { friendlyTxError } from '../lib/txError';
import { type Unlock } from '../lib/walletStore';
import { chainNow, loadWhitelist, useWhitelist, whitelistActions } from '../lib/whitelistStore';
import { shortAddress } from '../src';

type Pending = { kind: 'enable' } | { kind: 'disable' } | { kind: 'add'; address: string; label: string };

const hoursLeft = (at: number, now: number | null) => (now == null ? 24 : Math.max(1, Math.ceil((at - now) / 3_600_000)));

export default function WhitelistScreen() {
  const { colors } = useTheme();
  const t = useT();
  const params = useLocalSearchParams<{ address?: string }>();
  const wl = useWhitelist((s) => s.wl);
  const [now, setNow] = useState<number | null>(null);
  const [address, setAddress] = useState(params.address ?? '');
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    void loadWhitelist();
    void chainNow().then(setNow);
    const id = setInterval(() => void chainNow().then(setNow), 60_000);
    return () => clearInterval(id);
  }, []);

  const perform = async (unlock: Unlock) => {
    if (!pending) return;
    if (pending.kind === 'enable') await whitelistActions.enable(unlock);
    else if (pending.kind === 'disable') await whitelistActions.requestDisable(unlock);
    else {
      await whitelistActions.add(pending.address, pending.label, unlock);
      setAddress('');
      setLabel('');
    }
  };

  return (
    <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="security" title={t('wlTitle')} subtitle={t('wlHint')} />

      <NovaCard delay={80} style={{ gap: spacing(1.5) }}>
        {wl.enabled ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={18} color={colors.up} />
              <Text variant="body" style={{ color: colors.up, flex: 1 }}>{t('wlActiveBadge')}</Text>
            </View>
            {wl.disableAt != null ? (
              <>
                <Text variant="caption" tone="warning">{fill(t('wlDisablePending'), { hours: String(hoursLeft(wl.disableAt, now)) })}</Text>
                <Button label={t('wlCancelDisable')} variant="secondary" onPress={() => void whitelistActions.cancelDisable().catch((e) => toast.error(t('wlTitle'), friendlyTxError(e, t as never)))} />
              </>
            ) : (
              <Button label={t('wlDisable')} variant="ghost" onPress={() => setPending({ kind: 'disable' })} />
            )}
          </>
        ) : (
          <Button label={t('wlEnable')} icon="security" onPress={() => setPending({ kind: 'enable' })} />
        )}
      </NovaCard>

      <NovaCard delay={140} style={{ gap: spacing(1.5) }}>
        <Text variant="body">{t('wlAdd')}</Text>
        <Input value={address} onChangeText={setAddress} placeholder="0x… · bc1… · Solana · UQ…" autoCapitalize="none" autoCorrect={false} />
        <Input value={label} onChangeText={setLabel} placeholder={t('wlLabelPh')} maxLength={32} />
        {wl.enabled ? <Text variant="caption" tone="secondary">{t('wlAddHintDelay')}</Text> : null}
        <Button label={t('wlAdd')} icon="add" disabled={address.trim().length < 20} onPress={() => setPending({ kind: 'add', address: address.trim(), label })} />
      </NovaCard>

      <NovaCard delay={200} style={{ gap: spacing(1) }}>
        {wl.entries.length === 0 ? (
          <Text variant="caption" tone="secondary">{t('wlEmpty')}</Text>
        ) : (
          wl.entries.map((e) => {
            const active = now != null && now >= e.activeAt;
            return (
              <View key={e.address} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: 6 }}>
                <Icon name={active ? 'check' : 'clock'} size={16} color={active ? colors.up : colors.warning} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body" numberOfLines={1}>{e.label || shortAddress(e.address, 8, 6)}</Text>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {e.label ? `${shortAddress(e.address, 8, 6)} · ` : ''}
                    {active ? t('wlEntryActive') : fill(t('wlEntryPending'), { hours: String(hoursLeft(e.activeAt, now)) })}
                  </Text>
                </View>
                {/* Retirer renforce la protection : sans code. */}
                <KPressable onPress={() => void whitelistActions.remove(e.address)} hitSlop={10} accessibilityLabel={t('deleteAction')}>
                  <Icon name="close" size={16} color={colors.textTertiary} />
                </KPressable>
              </View>
            );
          })
        )}
      </NovaCard>

      <ConfirmUnlock
        visible={pending != null}
        title={pending?.kind === 'enable' ? t('wlEnableConfirm') : pending?.kind === 'disable' ? t('wlDisableConfirm') : t('wlAddFromSend')}
        subtitle={pending?.kind === 'add' ? `${shortAddress(pending.address, 8, 6)} — ${t('wlAddHintDelay')}` : pending?.kind === 'disable' ? t('wlHint') : undefined}
        perform={perform}
        onDone={() => setPending(null)}
        onCancel={() => setPending(null)}
      />
    </PremiumScreen>
  );
}
