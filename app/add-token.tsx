import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useCustomTokens } from '../lib/customTokensStore';
import { useT } from '../lib/settingsStore';
import { getAdapter, getTokenMetadata, isValidEvmAddress, type TokenMeta } from '../src';

export default function AddToken() {
  const { colors, typography } = useTheme();
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

  if (!isEvm) {
    return (
      <Screen scroll>
      <ScreenHeader />
        <Title>{t('addToken')}</Title>
        <Muted>{t('evmOnlyToken')}</Muted>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Title>{t('addToken')}</Title>
      <Muted>{t('pasteContractOn').replace('{chain}', chain.name)}</Muted>
      <Card>
        <TextInput
          value={contract}
          onChangeText={(v) => {
            setContract(v);
            setMeta(null);
          }}
          placeholder="0x…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ color: colors.text, fontSize: 15, paddingVertical: spacing(1) }}
        />
      </Card>

      {meta ? (
        <Card>
          <Text style={typography.bodyStrong}>{meta.name} ({meta.symbol})</Text>
          <Muted>{meta.decimals} {t('decimalsWord')}</Muted>
        </Card>
      ) : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <View style={{ flex: 1 }} />
      {meta ? (
        <Button label={`${t('addWord')} ${meta.symbol}`} onPress={onAdd} />
      ) : (
        <Button label={checking ? t('verifying') : t('verifyToken')} loading={checking} onPress={onCheck} />
      )}
    </Screen>
  );
}
