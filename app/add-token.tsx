import { Button, Input, ScreenHeader, Text as KText, TokenIcon } from '../ui/kit';
import { NovaCard, NovaHero } from '../ui/nova';
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { PremiumScreen } from '../ui/premium';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useCustomTokens } from '../lib/customTokensStore';
import { useT } from '../lib/settingsStore';
import { getAdapter, getTokenMetadata, isValidEvmAddress, type TokenMeta } from '../src';

export default function AddToken() {
  const { colors } = useTheme();
  const t = useT();
  const activeChain = useWallet((s) => s.activeChain);
  const add = useCustomTokens((s) => s.add);
  const chain = getAdapter(activeChain).config;

  const [contract, setContract] = useState('');
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEvm = chain.family === 'evm';

  const onCheck = async () => {
    setError(null);
    setMeta(null);
    if (!isValidEvmAddress(contract)) {
      setError(t('invalidContract'));
      return;
    }
    setChecking(true);
    try {
      const m = await getTokenMetadata(chain, contract.trim());
      if (!m || !m.symbol) {
        setError(t('tokenNotFound'));
      } else {
        setMeta(m);
      }
    } finally {
      setChecking(false);
    }
  };

  const onAdd = () => {
    add(activeChain, contract.trim());
    router.back();
  };

  /*
   * THÈME NOVA : en-tête (l'écran principal n'en avait pas — aucune flèche
   * retour), héros, champ du kit, aperçu du token trouvé, puis le bouton.
   */
  if (!isEvm) {
    return (
      <PremiumScreen>
        <ScreenHeader />
        <NovaHero icon="add" title={t('addToken')} subtitle={t('evmOnlyToken')} />
        <Button label={t('networks')} variant="secondary" icon="networks" onPress={() => router.push('/networks')} />
      </PremiumScreen>
    );
  }

  return (
    <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="add" title={t('addToken')} subtitle={t('pasteContractOn').replace('{chain}', chain.name)} />
      <NovaCard delay={140}>
        <Input
          value={contract}
          onChangeText={(v) => {
            setContract(v);
            setMeta(null);
            setError(null);
          }}
          placeholder="0x…"
          sensitive
          error={error}
          onSubmitEditing={() => void onCheck()}
          returnKeyType="search"
        />
      </NovaCard>

      {meta ? (
        <NovaCard delay={0} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
          <TokenIcon symbol={meta.symbol} seed={contract.trim()} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <KText variant="body" numberOfLines={1}>{meta.name}</KText>
            <KText variant="caption" tone="secondary">{meta.symbol} · {meta.decimals} {t('decimalsWord')} · {chain.name}</KText>
          </View>
          <Icon name="check" size={20} color={colors.up} />
        </NovaCard>
      ) : null}

      {/* Dans le défilement (et non en pied fixe) : le clavier ne le recouvre jamais. */}
      {meta ? (
        <Button label={`${t('addWord')} ${meta.symbol}`} icon="add" onPress={onAdd} />
      ) : (
        <Button label={t('verifyToken')} loading={checking} disabled={!contract.trim()} onPress={() => void onCheck()} />
      )}
    </PremiumScreen>
  );
}
