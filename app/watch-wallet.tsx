/**
 * SUIVRE UNE ADRESSE — portefeuille en lecture seule (aucune clé).
 * Logique : parseWatchAddress (src/domain/wallet/watchAddress) et
 * `addWatchWallet` (lib/walletStore). Ici : saisie, aperçu de la famille, erreurs précises.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Input, ScreenHeader, Text as KText } from '../ui/kit';
import { NovaCard, NovaHero } from '../ui/nova';
import { PremiumScreen } from '../ui/premium';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import { toast } from '../lib/toast';
import { isWalletError, parseWatchAddress, type WatchAddressError } from '../src';

const FAMILY = { evm: 'EVM', bitcoin: 'Bitcoin', solana: 'Solana' } as const;
const ERR_KEY: Record<Exclude<WatchAddressError, 'EMPTY'>, 'watchErrUnknown' | 'watchErrChecksum' | 'watchErrTon'> = {
  UNKNOWN: 'watchErrUnknown',
  BAD_CHECKSUM: 'watchErrChecksum',
  TON_UNSUPPORTED: 'watchErrTon',
};

export default function WatchWallet() {
  const { colors } = useTheme();
  const t = useT();
  const addWatchWallet = useWallet((s) => s.addWatchWallet);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = address.trim() ? parseWatchAddress(address) : null;
  const shownError = error ?? (parsed && !parsed.ok && parsed.error !== 'EMPTY' && address.trim().length >= 26 ? t(ERR_KEY[parsed.error]) : null);

  const onAdd = async () => {
    if (!parsed?.ok) {
      setError(parsed && !parsed.ok && parsed.error !== 'EMPTY' ? t(ERR_KEY[parsed.error]) : t('watchErrUnknown'));
      return;
    }
    setBusy(true);
    try {
      await addWatchWallet(parsed.address, label);
      router.back();
    } catch (e) {
      if (isWalletError(e) && e.code === 'WALLET_ALREADY_EXISTS') setError(t('watchErrExists'));
      else toast.error(t('watchTitle'), friendlyTxError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="eye" title={t('watchTitle')} subtitle={t('watchHint')} />
      <NovaCard delay={120} style={{ gap: spacing(1.5) }}>
        <Input
          value={address}
          onChangeText={(v) => {
            setAddress(v);
            setError(null);
          }}
          placeholder="0x… · bc1… · Solana"
          autoCapitalize="none"
          autoCorrect={false}
          error={shownError}
        />
        <Input value={label} onChangeText={setLabel} placeholder={t('walletNamePlaceholder')} maxLength={32} />
      </NovaCard>
      {parsed?.ok ? (
        <NovaCard delay={0} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
          <Icon name="eye" size={20} color={colors.textSecondary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <KText variant="body" numberOfLines={1} ellipsizeMode="middle">{parsed.address}</KText>
            <KText variant="caption" tone="secondary">{FAMILY[parsed.family]} · {t('watchBadge')}</KText>
          </View>
          <Icon name="check" size={20} color={colors.up} />
        </NovaCard>
      ) : null}
      <Button label={t('watchAddBtn')} icon="eye" loading={busy} disabled={!address.trim()} onPress={() => void onAdd()} />
    </PremiumScreen>
  );
}
