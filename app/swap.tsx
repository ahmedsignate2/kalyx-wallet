import React, { useState } from 'react';
import { View, Text, TextInput, Alert, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard, Chip } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { colors, radii, spacing, typography } from '../ui/theme';
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

  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setQuote(null);
    setError(null);
  };

  if (!available || !account) {
    return (
      <PremiumScreen>
        <Stack.Screen options={{ headerShown: true, title: t('navExchange') }} />
        <GlassCard>
          <Text style={typography.bodyStrong}>Swap indisponible ici</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            Le swap fonctionne sur les réseaux EVM mainnet (Ethereum, Polygon, Base, BNB).
            Change de réseau depuis l’accueil.
          </Text>
        </GlassCard>
      </PremiumScreen>
    );
  }

  const fromTok = tokens[from];
  const toTok = tokens[to];

  const flip = () => {
    setFrom(to);
    setTo(from);
    reset();
  };

  const onQuote = async () => {
    reset();
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
      if (!q) setError('Aucune route trouvée. Change le montant ou les tokens.');
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
        `Via : ${quote.toolName} · frais Nova ${(Number(NOVA_FEE) * 100).toFixed(1)}%\n` +
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
      setAmount('');
      Alert.alert('Swap envoyé ✅', hash, [{ text: 'OK' }]);
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

  const tokenChips = (selected: number, onPick: (i: number) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
      {tokens.map((tk, i) => (
        <Chip key={tk.symbol} label={tk.symbol} tone={i === selected ? 'accent' : 'neutral'} onPress={() => { onPick(i); reset(); }} />
      ))}
    </View>
  );

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: t('navExchange') }} />
      <Text style={typography.muted}>Swap sur {chain.name} · agrégateur LI.FI</Text>

      {/* De */}
      <GlassCard glow>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>De</Text>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{fromTok.symbol}</Text>
        </View>
        <TextInput
          value={amount}
          onChangeText={(v) => { setAmount(v); reset(); }}
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 32, fontWeight: '800', paddingVertical: spacing(0.5) }}
        />
        {tokenChips(from, setFrom)}
      </GlassCard>

      {/* Bouton d'inversion */}
      <View style={{ alignItems: 'center', marginVertical: -spacing(1.5), zIndex: 2 }}>
        <Pressable onPress={flip}>
          <View style={{ width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="convert" size={20} color={colors.accent} />
          </View>
        </Pressable>
      </View>

      {/* Vers */}
      <GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>Vers (estimé)</Text>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{toTok.symbol}</Text>
        </View>
        <Text style={{ color: quote ? colors.text : colors.textMuted, fontSize: 32, fontWeight: '800', paddingVertical: spacing(0.5) }}>
          {quote ? formatBalance(quote.toAmount, quote.toToken.decimals, 6) : '—'}
        </Text>
        {tokenChips(to, setTo)}
      </GlassCard>

      {/* Détails du devis */}
      {quote ? (
        <GlassCard>
          <Row label="Minimum reçu" value={`${formatBalance(quote.toAmountMin, quote.toToken.decimals, 6)} ${toTok.symbol}`} />
          <Row label="Via" value={quote.toolName} />
          <Row label="Frais Nova" value={`${(Number(NOVA_FEE) * 100).toFixed(1)} %`} />
          <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, marginTop: spacing(1), paddingTop: spacing(1) }}>
            <Text style={typography.muted}>PIN (pour signer)</Text>
            <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} style={{ color: colors.text, fontSize: 22, letterSpacing: 6 }} />
          </View>
        </GlassCard>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      {quote ? (
        <Button label={busy ? 'Échange…' : 'Échanger'} loading={busy} onPress={onSwap} />
      ) : (
        <Button label={loading ? 'Recherche de route…' : 'Obtenir un devis'} loading={loading} onPress={onQuote} />
      )}
    </PremiumScreen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={typography.muted}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
