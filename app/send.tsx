import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Alert, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { SuccessModal } from '../ui/SuccessModal';
import { Icon } from '../ui/icon';
import { notifyAndLog } from '../lib/notificationCenter';
import { watchConfirmation } from '../lib/txWatch';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';
import { getAdapter, isWalletError, isValidEvmAddress, isValidSolanaAddress, parseAmount } from '../src';

export default function Send() {
  const { colors, typography } = useTheme();
  const signAndSend = useWallet((s) => s.signAndSend);
  const sendToken = useWallet((s) => s.sendToken);
  const sendSolToken = useWallet((s) => s.sendSolToken);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;
  const params = useLocalSearchParams<{ to?: string; amount?: string; contract?: string; mint?: string; symbol?: string; decimals?: string }>();
  const toParam = params.to;
  const amountParam = params.amount;
  const decimals = params.decimals != null ? Number(params.decimals) : 18;
  // 3 modes : token SPL (mint), token ERC-20 (contract), ou natif.
  const token = params.contract
    ? { kind: 'erc20' as const, contract: String(params.contract), symbol: String(params.symbol ?? 'TOKEN'), decimals }
    : params.mint
      ? { kind: 'spl' as const, mint: String(params.mint), symbol: String(params.symbol ?? 'TOKEN'), decimals }
      : null;
  const symbol = token ? token.symbol : chain.nativeSymbol;
  const [to, setTo] = useState('');

  useEffect(() => {
    if (toParam) setTo(String(toParam));
  }, [toParam]);
  const [amount, setAmount] = useState('');
  useEffect(() => {
    if (amountParam) setAmount(String(amountParam));
  }, [amountParam]);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Succès : hash + résumé de ce qui vient d'être envoyé (pour l'écran animé).
  const [success, setSuccess] = useState<{ hash: string; summary: string } | null>(null);

  const onReview = () => {
    setError(null);
    try {
      // Validation hors-ligne immédiate (adresse + montant).
      if (token?.kind === 'spl') {
        if (!isValidSolanaAddress(to)) throw new Error('Adresse Solana du destinataire invalide.');
        parseAmount(amount, token.decimals);
      } else if (token?.kind === 'erc20') {
        if (!isValidEvmAddress(to)) throw new Error('Adresse du destinataire invalide.');
        parseAmount(amount, token.decimals); // lève si le montant est mal formé
      } else {
        getAdapter(activeChain).buildTransfer({ to, amount });
      }
    } catch (e) {
      setError(isWalletError(e) ? e.message : e instanceof Error ? e.message : 'Saisie invalide');
      return;
    }
    if (pin.length < 6) {
      setError('Entre ton PIN pour signer.');
      return;
    }
    Alert.alert(
      "Confirmer l'envoi",
      `Réseau : ${chain.name}\nMontant : ${amount} ${symbol}\nÀ : ${to}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Envoyer', onPress: submit },
      ],
    );
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const hash =
        token?.kind === 'spl'
          ? await sendSolToken(to, amount, { mint: token.mint, decimals: token.decimals }, { pin })
          : token?.kind === 'erc20'
            ? await sendToken(to, amount, { contract: token.contract, decimals: token.decimals }, { pin })
            : await signAndSend(to, amount, { pin });
      setPin('');
      const summary = `${amount} ${symbol} envoyés à ${to.slice(0, 8)}…${to.slice(-6)}`;
      setSuccess({ hash, summary });
      notifyAndLog('tx', 'Transaction envoyée', summary);
      void watchConfirmation(activeChain, hash, summary); // notif à la confirmation
    } catch (e) {
      setError(friendlyTxError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Envoyer {token ? token.symbol : ''}</Title>
      <Muted>
        {token ? `Transfert du token ${token.symbol}` : 'Transfert natif'} sur {chain.name}
        {chain.testnet ? ' (testnet)' : ' — fonds réels'}.
      </Muted>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>Adresse du destinataire</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
            <Pressable onPress={() => router.push('/scan')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="scan" size={16} color={colors.accent} />
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Scanner</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/contacts?pick=1')} hitSlop={8}>
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Carnet</Text>
            </Pressable>
          </View>
        </View>
        <TextInput
          value={to}
          onChangeText={setTo}
          placeholder={chain.family === 'bitcoin' ? 'bc1…' : chain.family === 'solana' ? 'Adresse Solana…' : '0x…'}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }}
        />
      </Card>

      <Card>
        <Text style={typography.muted}>Montant ({symbol})</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={{ color: colors.text, fontSize: 22, paddingVertical: spacing(1) }}
        />
      </Card>

      <Card>
        <Text style={typography.muted}>PIN (pour signer)</Text>
        <TextInput
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={12}
          style={{ color: colors.text, fontSize: 22, letterSpacing: 6, paddingVertical: spacing(1) }}
        />
      </Card>

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <View style={{ flex: 1 }} />
      <Button label={busy ? 'Envoi…' : 'Vérifier et envoyer'} loading={busy} onPress={onReview} />

      <SuccessModal
        visible={success != null}
        title="Transaction envoyée"
        message={success?.summary}
        hash={success?.hash}
        explorerUrl={chain.explorerUrl}
        onClose={() => {
          setSuccess(null);
          router.replace('/home');
        }}
      />
    </Screen>
  );
}
