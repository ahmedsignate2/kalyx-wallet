import React, { useState } from 'react';
import { View, Text, TextInput, Alert, Pressable } from 'react-native';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { Chip } from '../ui/premium';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import {
  getAdapter,
  getSwapQuote,
  parseAmount,
  formatBalance,
  isWalletError,
  NATIVE_TOKEN,
  NOVA_FEE,
  type SwapQuote,
} from '../src';

interface Tok {
  symbol: string;
  address: string;
  decimals: number;
}

// Tokens courants par réseau (natif + stablecoins).
const TOKENS: Record<string, Tok[]> = {
  ethereum: [
    { symbol: 'ETH', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  ],
  polygon: [
    { symbol: 'POL', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
  ],
  base: [
    { symbol: 'ETH', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  ],
  bnb: [
    { symbol: 'BNB', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  ],
};

export default function Swap() {
  const t = useT();
  const activeChain = useWallet((s) => s.activeChain);
  const account = useWallet((s) => s.account);
  const executeSwap = useWallet((s) => s.executeSwap);
  const chain = getAdapter(activeChain).config;

  const tokens = TOKENS[activeChain] ?? [];
  const available = chain.family === 'evm' && !chain.testnet && tokens.length > 0 && !!chain.evmChainId;

  const [from, setFrom] = useState(0); // index dans tokens
  const [to, setTo] = useState(1);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!available || !account) {
    return (
      <Screen>
        <Title>{t('navExchange')}</Title>
        <Muted>
          Le swap est disponible sur les réseaux EVM mainnet (Ethereum, Polygon, Base, BNB).
          Change de réseau depuis l’accueil.
        </Muted>
      </Screen>
    );
  }

  const fromTok = tokens[from];
  const toTok = tokens[to];

  const onQuote = async () => {
    setError(null);
    setQuote(null);
    if (from === to) {
      setError('Choisis deux tokens différents.');
      return;
    }
    let raw: bigint;
    try {
      raw = parseAmount(amount, fromTok.decimals).raw;
    } catch (e) {
      setError(isWalletError(e) ? e.message : 'Montant invalide');
      return;
    }
    setLoading(true);
    try {
      const q = await getSwapQuote({
        fromChainId: chain.evmChainId!,
        toChainId: chain.evmChainId!,
        fromToken: fromTok.address,
        toToken: toTok.address,
        fromAmount: raw,
        fromAddress: account.address,
      });
      if (!q) setError('Aucune route trouvée (LI.FI). Réessaie ou change de montant.');
      else setQuote(q);
    } finally {
      setLoading(false);
    }
  };

  const onSwap = () => {
    if (!quote) return;
    if (pin.length < 6) {
      setError('Entre ton PIN pour signer.');
      return;
    }
    const recv = formatBalance(quote.toAmount, quote.toToken.decimals, 6);
    const min = formatBalance(quote.toAmountMin, quote.toToken.decimals, 6);
    Alert.alert(
      'Confirmer le swap',
      `Tu envoies : ${amount} ${fromTok.symbol}\n` +
        `Tu reçois ≈ ${recv} ${toTok.symbol}\n` +
        `Minimum garanti : ${min} ${toTok.symbol}\n` +
        `Via : ${quote.toolName}\n` +
        `Frais Nova : ${(Number(NOVA_FEE) * 100).toFixed(1)}%\n` +
        `Réseau : ${chain.name}`,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: 'Échanger', onPress: submit },
      ],
    );
  };

  const submit = async () => {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await executeSwap(quote, { pin });
      setPin('');
      setQuote(null);
      Alert.alert('Swap envoyé', hash, [{ text: 'OK' }]);
    } catch (e) {
      setError(
        isWalletError(e) && e.code === 'WRONG_PIN'
          ? 'PIN incorrect.'
          : e instanceof Error
            ? e.message
            : 'Échec du swap.',
      );
    } finally {
      setBusy(false);
    }
  };

  const pickRow = (label: string, selected: number, onPick: (i: number) => void) => (
    <Card>
      <Text style={typography.muted}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
        {tokens.map((tk, i) => (
          <Chip key={tk.symbol} label={tk.symbol} tone={i === selected ? 'accent' : 'neutral'} onPress={() => { onPick(i); setQuote(null); }} />
        ))}
      </View>
    </Card>
  );

  return (
    <Screen>
      <Title>{t('navExchange')}</Title>
      <Muted>Swap sur {chain.name} · via LI.FI (agrégateur DEX).</Muted>

      {pickRow('De', from, setFrom)}
      <Card>
        <Text style={typography.muted}>Montant ({fromTok.symbol})</Text>
        <TextInput
          value={amount}
          onChangeText={(v) => { setAmount(v); setQuote(null); }}
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 22, paddingVertical: spacing(1) }}
        />
      </Card>
      {pickRow('Vers', to, setTo)}

      {quote ? (
        <Card>
          <Text style={typography.bodyStrong}>
            ≈ {formatBalance(quote.toAmount, quote.toToken.decimals, 6)} {toTok.symbol}
          </Text>
          <Muted>Min : {formatBalance(quote.toAmountMin, quote.toToken.decimals, 6)} {toTok.symbol} · via {quote.toolName}</Muted>
          <Card style={{ backgroundColor: colors.bgElevated, marginTop: spacing(1) }}>
            <Text style={typography.muted}>PIN (pour signer)</Text>
            <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
          </Card>
        </Card>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <View style={{ flex: 1 }} />
      {quote ? (
        <Button label={busy ? 'Échange…' : 'Échanger'} loading={busy} onPress={onSwap} />
      ) : (
        <Button label={loading ? 'Recherche de route…' : 'Obtenir un devis'} loading={loading} onPress={onQuote} />
      )}
    </Screen>
  );
}
