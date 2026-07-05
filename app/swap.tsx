import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Alert, Pressable, Image, Animated, Vibration, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { SuccessModal } from '../ui/SuccessModal';
import { notifyAndLog } from '../lib/notificationCenter';
import { watchConfirmation } from '../lib/txWatch';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type SwapStatus } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';
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

const STATUS_LABEL: Record<SwapStatus, string> = {
  approving: 'Approbation du token…',
  approvalWait: 'Attente de l’approbation…',
  swapping: 'Envoi du swap…',
  confirming: 'Confirmation sur la blockchain…',
};

const TW_CHAIN: Record<string, string> = { ethereum: 'ethereum', polygon: 'polygon', bnb: 'smartchain', base: 'base' };
const TW_NATIVE: Record<string, string> = { ethereum: 'ethereum', polygon: 'polygon', bnb: 'smartchain', base: 'ethereum' };
const TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

function logoFor(novaChain: string, tok: Tok): string {
  if (tok.address === NATIVE_TOKEN) return `${TW}/${TW_NATIVE[novaChain]}/info/logo.png`;
  return `${TW}/${TW_CHAIN[novaChain]}/assets/${tok.address}/logo.png`;
}

function TokenPill({ chainId, tok, selected, onPress }: { chainId: string; tok: Tok; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: radii.pill,
          paddingVertical: spacing(0.75),
          paddingHorizontal: spacing(1.5),
          backgroundColor: selected ? colors.accent : colors.glass,
          borderWidth: 1,
          borderColor: selected ? colors.accent : colors.glassBorder,
        }}
      >
        {!err ? (
          <Image source={{ uri: logoFor(chainId, tok) }} style={{ width: 18, height: 18, borderRadius: 9 }} onError={() => setErr(true)} />
        ) : null}
        <Text style={{ color: selected ? '#fff' : colors.text, fontFamily: fonts.bold }}>{tok.symbol}</Text>
      </View>
    </Pressable>
  );
}

export default function Swap() {
  const { colors, typography } = useTheme();
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
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  // Succès : hash + résumé (capturés avant reset) pour l'écran animé.
  const [success, setSuccess] = useState<{ hash: string; summary: string } | null>(null);
  const shakeX = useRef(new Animated.Value(0)).current;

  const shakePin = () => {
    Vibration.vibrate(80);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const reset = () => {
    setQuote(null);
    setConfirming(false);
    setError(null);
  };

  if (!available || !account) {
    return (
      <PremiumScreen>
        <Stack.Screen options={{ headerShown: true, title: t('navExchange') }} />
        <GlassCard>
          <Text style={typography.bodyStrong}>Swap indisponible ici</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            Le swap fonctionne sur Ethereum, Polygon, Base et BNB. Change de réseau depuis l’accueil.
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

  const confirm = () => {
    if (!quote) return;
    if (pin.length < 6) {
      setError('Entre ton PIN pour signer.');
      return;
    }
    const recv = formatBalance(quote.toAmount, quote.toToken.decimals, 6);
    const min = formatBalance(quote.toAmountMin, quote.toToken.decimals, 6);
    Alert.alert(
      'Confirmer le swap',
      `Tu envoies : ${amount} ${fromTok.symbol}\nTu reçois ≈ ${recv} ${toTok.symbol}\nMinimum : ${min} ${toTok.symbol}\nRéseau : ${chain.name}`,
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
    setStep('Préparation…');
    try {
      const hash = await executeSwap(quote, { pin }, (s) => setStep(STATUS_LABEL[s]));
      // Résumé capturé AVANT reset() (qui efface quote/amount).
      const summary = `${amount} ${fromTok.symbol} → ≈ ${formatBalance(quote.toAmount, quote.toToken.decimals, 6)} ${toTok.symbol}`;
      setPin('');
      reset();
      setAmount('');
      setSuccess({ hash, summary });
      notifyAndLog('tx', 'Swap envoyé', summary);
      void watchConfirmation(activeChain, hash, summary); // notif à la confirmation
    } catch (e) {
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        shakePin();
        setPin('');
      }
      setError(friendlyTxError(e));
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  const impact =
    quote && quote.fromAmountUsd > 0 ? ((quote.toAmountUsd - quote.fromAmountUsd) / quote.fromAmountUsd) * 100 : null;

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: chain.name }} />

      {/* De */}
      <GlassCard glow>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>De</Text>
        </View>
        <TextInput
          value={amount}
          onChangeText={(v) => { setAmount(v); reset(); }}
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 32, fontFamily: fonts.extrabold, paddingVertical: spacing(0.5) }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
          {tokens.map((tk, i) => (
            <TokenPill key={tk.symbol} chainId={activeChain} tok={tk} selected={i === from} onPress={() => { setFrom(i); reset(); }} />
          ))}
        </View>
      </GlassCard>

      {/* Bouton d'inversion (halo au toucher) */}
      <View style={{ alignItems: 'center', marginVertical: -spacing(1.75), zIndex: 2 }}>
        <Pressable onPress={flip} style={({ pressed }) => [
          { width: 52, height: 52, borderRadius: radii.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: pressed ? colors.accent : colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
          pressed ? { shadowColor: colors.accent, shadowOpacity: 0.7, shadowRadius: 14, elevation: 10 } : null,
        ]}>
          <Icon name="convert" size={22} color={colors.accent} />
        </Pressable>
      </View>

      {/* Vers */}
      <GlassCard>
        <Text style={typography.muted}>Vers (estimé)</Text>
        <Text style={{ color: quote ? colors.text : colors.textMuted, fontSize: 32, fontFamily: fonts.extrabold, paddingVertical: spacing(0.5) }}>
          {quote ? formatBalance(quote.toAmount, quote.toToken.decimals, 6) : '—'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
          {tokens.map((tk, i) => (
            <TokenPill key={tk.symbol} chainId={activeChain} tok={tk} selected={i === to} onPress={() => { setTo(i); reset(); }} />
          ))}
        </View>
      </GlassCard>

      {/* Détails du devis */}
      {quote ? (
        <GlassCard>
          <Row label="Route" value={`LI.FI → ${quote.toolName}`} />
          <Row label="Minimum reçu" value={`${formatBalance(quote.toAmountMin, quote.toToken.decimals, 6)} ${toTok.symbol}`} />
          {quote.gasCostNative > 0n && quote.gasToken ? (
            <Row
              label="Frais réseau"
              value={`≈ ${formatBalance(quote.gasCostNative, quote.gasToken.decimals, 6)} ${quote.gasToken.symbol}${quote.gasCostUsd > 0 ? ` ($${quote.gasCostUsd.toFixed(2)})` : ''}`}
            />
          ) : quote.gasCostUsd > 0 ? (
            <Row label="Frais réseau" value={`≈ $${quote.gasCostUsd.toFixed(2)}`} />
          ) : null}
          <Row label="Frais Nova" value={`${(Number(NOVA_FEE) * 100).toFixed(1)} %`} />
          {impact != null ? <Row label="Impact prix" value={`${impact.toFixed(2)} %`} color={impact < -1 ? colors.down : colors.textMuted} /> : null}
          <Row label="Slippage" value={`${(quote.slippage * 100).toFixed(1)} %`} />
          {quote.durationSec > 0 ? <Row label="Temps estimé" value={`≈ ${quote.durationSec}s`} /> : null}

          {confirming ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, marginTop: spacing(1), paddingTop: spacing(1) }}>
              <Text style={typography.muted}>PIN (pour signer)</Text>
              <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
                <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} autoFocus editable={!busy} style={{ color: colors.text, fontSize: 22, letterSpacing: 6 }} />
              </Animated.View>
            </View>
          ) : null}
        </GlassCard>
      ) : null}

      {error ? <ErrorBox message={error} /> : null}

      {busy && step ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), justifyContent: 'center', paddingVertical: spacing(1) }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.text }}>{step}</Text>
        </View>
      ) : !quote ? (
        <Button label={loading ? 'Recherche de route…' : 'Obtenir un devis'} loading={loading} onPress={onQuote} />
      ) : !confirming ? (
        <Button label="Échanger" onPress={() => setConfirming(true)} />
      ) : (
        <Button label="Confirmer le swap" onPress={confirm} />
      )}

      <SuccessModal
        visible={success != null}
        title="Swap envoyé"
        message={success?.summary}
        hash={success?.hash}
        explorerUrl={chain.explorerUrl}
        onClose={() => setSuccess(null)}
      />
    </PremiumScreen>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={typography.muted}>{label}</Text>
      <Text style={{ color: color ?? colors.text, fontFamily: fonts.semibold }}>{value}</Text>
    </View>
  );
}
