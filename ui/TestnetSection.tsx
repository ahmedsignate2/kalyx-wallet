/**
 * Accueil — soldes des réseaux de test, à part.
 *
 * Visible seulement quand l'utilisateur affiche les réseaux de test (Réseaux).
 * Rien n'entre dans le total : ces jetons ne valent rien, et une ligne
 * « 0,5 ETH » sans mention mélangée au vrai portefeuille tromperait.
 */
import React, { useEffect } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Text, Surface, Divider, TokenRow, Pressable as KPressable } from './kit';
import { space } from './tokens';
import { useT } from '../lib/settingsStore';
import { fill } from '../lib/i18n';
import { useWallet } from '../lib/walletStore';
import { useTestnetBalances, type PortfolioAccount } from '../lib/portfolio';
import { chainIconUrl, formatTokenAmount } from '../src';

export function TestnetSection({ acct, hidden, refreshTick }: { acct: PortfolioAccount; hidden: boolean; refreshTick: number }) {
  const t = useT();
  const balances = useTestnetBalances((s) => s.balances);
  const loading = useTestnetBalances((s) => s.loading);
  const failed = useTestnetBalances((s) => s.failed);
  const at = useTestnetBalances((s) => s.at);

  useEffect(() => {
    void useTestnetBalances.getState().refresh(acct, { force: refreshTick > 0 });
  }, [acct, refreshTick]);

  const open = (chainId: string, name: string, symbol: string, amount: string) => {
    Alert.alert(`${symbol} · ${name}`, amount, [
      { text: t('actionSend'), onPress: () => { useWallet.getState().setActiveChain(chainId); router.push({ pathname: '/send', params: { chain: chainId } }); } },
      { text: t('actionReceive'), onPress: () => { useWallet.getState().setActiveChain(chainId); router.push('/receive'); } },
      { text: t('actionCancel'), style: 'cancel' },
    ]);
  };

  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
        <Text variant="caption" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('testnetSectionTitle')}</Text>
        <Text variant="micro" tone="tertiary">{t('testnetSectionNote')}</Text>
      </View>
      {balances.length > 0 ? (
        <Surface padded={false} style={{ borderRadius: 26 }}>
          {balances.map((b, i) => {
            const amount = `${formatTokenAmount(b.raw, b.chain.nativeDecimals)} ${b.chain.nativeSymbol}`;
            return (
              <React.Fragment key={b.chain.id}>
                <TokenRow
                  symbol={b.chain.nativeSymbol}
                  name={b.chain.name}
                  logo={chainIconUrl(b.chain.id)}
                  chainId={b.chain.id}
                  address={b.chain.id}
                  balance={amount}
                  fiat={t('testnetNoValue')}
                  hidden={hidden}
                  onPress={() => open(b.chain.id, b.chain.name, b.chain.nativeSymbol, amount)}
                />
                {i < balances.length - 1 ? <Divider inset={68} /> : null}
              </React.Fragment>
            );
          })}
        </Surface>
      ) : (
        <Surface>
          <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
            {loading && at === 0 ? '…' : t('testnetNoBalance')}
          </Text>
        </Surface>
      )}
      {failed.length > 0 ? (
        <KPressable onPress={() => void useTestnetBalances.getState().refresh(acct, { force: true })} style={{ alignSelf: 'center', paddingVertical: space[1] }}>
          <Text variant="caption" tone="warning">{fill(t('testnetUnreachable'), { count: String(failed.length) })}</Text>
        </KPressable>
      ) : null}
    </View>
  );
}
