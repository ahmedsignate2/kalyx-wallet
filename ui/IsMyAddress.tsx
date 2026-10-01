/** Carte « Est-ce mon adresse ? » (écran Sécurité). Logique : lib/isMyAddress.ts. */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Input, Pressable as KPressable, Text } from './kit';
import { Icon } from './icon';
import { useTheme } from './theme';
import { fontFamily } from './tokens';
import { useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';
import { loadAccounts, type StoredAccount } from '../lib/secureStore';
import { accountDisplayName } from '../lib/walletNames';
import { buildAddressIndex, lookupAddress, type WalletAccounts } from '../lib/isMyAddress';

const FAMILY = { evm: 'EVM', solana: 'Solana', bitcoin: 'Bitcoin', ton: 'TON' } as const;

export function IsMyAddress() {
  const { colors } = useTheme();
  const t = useT();
  const wallets = useWallet((s) => s.wallets);
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const activeAccounts = useWallet((s) => s.accounts);
  /*
   * TOUS les portefeuilles, pas seulement l'actif : l'adresse d'un autre
   * portefeuille de l'app aurait été déclarée « pas à toi ». Les comptes
   * publics (adresses) sont lus une fois ; aucune clé n'est touchée.
   */
  const [others, setOthers] = useState<WalletAccounts<StoredAccount>[]>([]);
  /** Lecture des autres portefeuilles : en cours, ou incomplète — jamais un « non » sans avoir tout vu. */
  const [othersState, setOthersState] = useState<'loading' | 'ok' | 'partial'>('loading');
  /** Relecture demandée depuis l'avertissement « certains portefeuilles n'ont pas pu être vérifiés ». */
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setOthersState('loading');
    Promise.all(
      wallets.filter((w) => w.id !== activeWalletId).map(async (w) => {
        const accounts = await loadAccounts(w.id).catch(() => null);
        return { walletId: w.id, accounts: accounts ?? [], failed: accounts == null };
      }),
    ).then((list) => {
      if (!alive) return;
      setOthers(list);
      setOthersState(list.some((x) => x.failed) ? 'partial' : 'ok');
    });
    return () => {
      alive = false;
    };
  }, [wallets, activeWalletId, reload]);
  const index = useMemo(() => buildAddressIndex([{ walletId: activeWalletId, accounts: activeAccounts }, ...others]), [activeWalletId, activeAccounts, others]);
  const accountsOf = (walletId: string) => (walletId === activeWalletId ? activeAccounts : others.find((o) => o.walletId === walletId)?.accounts ?? []);

  const [value, setValue] = useState('');
  const v = value.trim();
  const match = v.length >= 20 ? lookupAddress(index, v) : null;
  const account = match ? accountsOf(match.walletId).find((a) => a.index === match.index) : null;
  const walletLabel = match && wallets.length > 1 ? wallets.find((w) => w.id === match.walletId)?.label : null;
  const who = account ? `${walletLabel ? `${walletLabel} · ` : ''}${accountDisplayName(account, t)}` : '';
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 24, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
      <Text variant="body" style={{ fontFamily: fontFamily.semibold }}>{t('isMyAddressTitle')}</Text>
      <Text variant="caption" tone="secondary">{t('isMyAddressHint')}</Text>
      <Input value={value} onChangeText={setValue} placeholder="0x… · bc1… · UQ…" sensitive />
      {v.length >= 20 ? (
        <KPressable
          disabled={!!match || othersState !== 'partial'}
          onPress={() => setReload((n) => n + 1)}
          accessibilityRole={!match && othersState === 'partial' ? 'button' : undefined}
          accessibilityLabel={!match && othersState === 'partial' ? t('retry') : undefined}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Icon name={match ? 'check' : othersState === 'partial' ? 'warning' : 'info'} size={16} color={match ? colors.up : othersState === 'partial' ? colors.warning : colors.textSecondary} />
          <Text variant="caption" style={{ color: match ? colors.up : colors.textSecondary, flex: 1 }}>
            {match && account
              ? t('isMyAddressYes').replace('{account}', who).replace('{family}', FAMILY[match.family])
              : othersState === 'loading'
                ? '…'
                : othersState === 'partial'
                  ? t('isMyAddressPartial')
                  : t('isMyAddressNo')}
            {!match && othersState === 'partial' ? <Text variant="caption" style={{ color: colors.primary }}>{` · ${t('retry')}`}</Text> : null}
          </Text>
        </KPressable>
      ) : null}
    </View>
  );
}
