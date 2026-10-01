/** Carte « Est-ce mon adresse ? » (écran Sécurité). Logique : lib/isMyAddress.ts. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Input, Text } from './kit';
import { Icon } from './icon';
import { useTheme } from './theme';
import { fontFamily } from './tokens';
import { useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';
import { accountDisplayName } from '../lib/walletNames';
import { findMyAddress } from '../lib/isMyAddress';

const FAMILY = { evm: 'EVM', solana: 'Solana', bitcoin: 'Bitcoin', ton: 'TON' } as const;

export function IsMyAddress() {
  const { colors } = useTheme();
  const t = useT();
  const accounts = useWallet((s) => s.accounts);
  const [value, setValue] = useState('');
  const v = value.trim();
  const match = v.length >= 20 ? findMyAddress(accounts, v) : null;
  const account = match ? accounts.find((a) => a.index === match.index) : null;
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 24, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
      <Text variant="body" style={{ fontFamily: fontFamily.semibold }}>{t('isMyAddressTitle')}</Text>
      <Text variant="caption" tone="secondary">{t('isMyAddressHint')}</Text>
      <Input value={value} onChangeText={setValue} placeholder="0x… · bc1… · UQ…" sensitive />
      {v.length >= 20 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={match ? 'check' : 'info'} size={16} color={match ? colors.up : colors.textSecondary} />
          <Text variant="caption" style={{ color: match ? colors.up : colors.textSecondary, flex: 1 }}>
            {match && account ? t('isMyAddressYes').replace('{account}', accountDisplayName(account, t)).replace('{family}', FAMILY[match.family]) : t('isMyAddressNo')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
