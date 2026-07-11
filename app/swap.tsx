import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PremiumScreen, GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { SuccessModal } from '../ui/SuccessModal';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { notifyAndLog } from '../lib/notificationCenter';
import { watchConfirmation } from '../lib/txWatch';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet, type SwapStatus, type Unlock } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import {
  getAdapter,
  getErc20Tokens,
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
  logo?: string; // logo direct (tokens détenus via Alchemy) ; sinon dérivé de TrustWallet
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
  arbitrum: [
    { symbol: 'ETH', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  ],
  optimism: [
    { symbol: 'ETH', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
  ],
  avalanche: [
    { symbol: 'AVAX', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
    { symbol: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 },
  ],
  linea: [
    { symbol: 'ETH', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', decimals: 6 },
  ],
  scroll: [
    { symbol: 'ETH', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDC', address: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', decimals: 6 },
  ],
  blast: [
    { symbol: 'ETH', address: NATIVE_TOKEN, decimals: 18 },
    { symbol: 'USDB', address: '0x4300000000000000000000000000000000000003', decimals: 18 },
  ],
};

// Clés i18n des étapes du swap (traduites à l'affichage via t()).
const STATUS_KEY = {
  approving: 'stApproving',
  approvalWait: 'stApprovalWait',
  swapping: 'stSwapping',
  confirming: 'stConfirming',
} as const;

const TW_CHAIN: Record<string, string> = { ethereum: 'ethereum', polygon: 'polygon', bnb: 'smartchain', base: 'base', arbitrum: 'arbitrum', optimism: 'optimism', avalanche: 'avalanchec', linea: 'linea', scroll: 'scroll', blast: 'blast' };
const TW_NATIVE: Record<string, string> = { ethereum: 'ethereum', polygon: 'polygon', bnb: 'smartchain', base: 'ethereum', arbitrum: 'ethereum', optimism: 'ethereum', avalanche: 'avalanchec', linea: 'ethereum', scroll: 'ethereum', blast: 'ethereum' };
const TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

function logoFor(novaChain: string, tok: Tok): string {
  if (tok.logo) return tok.logo; // logo fourni par Alchemy pour les tokens détenus
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
  const [toChain, setToChain] = useState(activeChain); // chaîne de destination (bridge)
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  // Succès : hash + résumé (capturés avant reset) pour l'écran animé.
  const [success, setSuccess] = useState<{ hash: string; summary: string } | null>(null);
  const [held, setHeld] = useState<Tok[]>([]);
  const params = useLocalSearchParams<{ contract?: string }>();

  // Tokens réellement détenus sur la chaîne active → swappables même hors liste curée.
  useEffect(() => {
    let cancelled = false;
    setHeld([]);
    if (chain.family !== 'evm' || !account?.address) return;
    getErc20Tokens(chain, account.address)
      .then((detected) => {
        if (!cancelled)
          setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.contract, decimals: tk.decimals, logo: tk.logo })));
      })
      .catch(() => {
        if (!cancelled) setHeld([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, account?.address]);

  // Liste source = tokens curés + tokens détenus non déjà listés (dédupliqués par adresse).
  const curated = TOKENS[activeChain] ?? [];
  const curatedAddrs = new Set(curated.map((tk) => tk.address.toLowerCase()));
  const fromTokens = [...curated, ...held.filter((tk) => !curatedAddrs.has(tk.address.toLowerCase()))];

  // Pré-sélection si on arrive depuis le portefeuille avec un token précis.
  useEffect(() => {
    if (!params.contract) return;
    const idx = fromTokens.findIndex((tk) => tk.address.toLowerCase() === String(params.contract).toLowerCase());
    if (idx >= 0) setFrom(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.contract, fromTokens.length]);

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
          <Text style={typography.bodyStrong}>{t('swapUnavailable')}</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            Le swap/bridge fonctionne sur les réseaux EVM (Ethereum, BNB, Polygon, Base, Arbitrum, Optimism, Avalanche, Linea, Scroll, Blast). Change de réseau depuis l’accueil.
          </Text>
        </GlassCard>
      </PremiumScreen>
    );
  }

  const fromTok = fromTokens[from] ?? fromTokens[0];
  const toTokens = TOKENS[toChain] ?? [];
  const toTok = toTokens[to] ?? toTokens[0];
  const isBridge = toChain !== activeChain;
  const toChainCfg = getAdapter(toChain).config;
  const bridgeChains = Object.keys(TOKENS);

  const flip = () => {
    if (isBridge) return; // l'inversion n'a de sens qu'à chaîne égale
    setFrom(to);
    setTo(from);
    reset();
  };
  const pickToChain = (id: string) => {
    setToChain(id);
    setTo(0);
    reset();
  };

  const onQuote = async () => {
    reset();
    if (!isBridge && fromTok.address === toTok.address) {
      setError(t('swapTwoTokens'));
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
        toChainId: toChainCfg.evmChainId!,
        fromToken: fromTok.address,
        toToken: toTok.address,
        fromAmount: raw,
        fromAddress: account.address,
      });
      if (!q) setError(t('noRoute'));
      else setQuote(q);
    } finally {
      setLoading(false);
    }
  };

  // Exécuté par ConfirmUnlock (biométrie ou PIN). LÈVE en cas d'échec.
  const perform = async (unlock: Unlock) => {
    if (!quote) return;
    setStep(t('preparing'));
    try {
      const hash = await executeSwap(quote, unlock, (s) => setStep(t(STATUS_KEY[s])));
      // Résumé capturé AVANT reset() (qui efface quote/amount).
      const summary = `${amount} ${fromTok.symbol} → ≈ ${formatBalance(quote.toAmount, quote.toToken.decimals, 6)} ${toTok.symbol}`;
      reset();
      setAmount('');
      setSuccess({ hash, summary });
      notifyAndLog('tx', t('swapSent'), summary);
      void watchConfirmation(activeChain, hash, summary); // notif à la confirmation
    } finally {
      setStep(null);
    }
  };

  const impact =
    quote && quote.fromAmountUsd > 0 ? ((quote.toAmountUsd - quote.fromAmountUsd) / quote.fromAmountUsd) * 100 : null;

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: t('swapBridge') }} />

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
          {fromTokens.map((tk, i) => (
            <TokenPill key={`${tk.address}-${tk.symbol}`} chainId={activeChain} tok={tk} selected={i === from} onPress={() => { setFrom(i); reset(); }} />
          ))}
        </View>
      </GlassCard>

      {/* Bouton d'inversion (halo au toucher) */}
      <View style={{ alignItems: 'center', marginVertical: -spacing(1.75), zIndex: 2 }}>
        <Pressable onPress={flip} disabled={isBridge} style={({ pressed }) => [
          { width: 52, height: 52, borderRadius: radii.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: pressed ? colors.accent : colors.glassBorder, alignItems: 'center', justifyContent: 'center', opacity: isBridge ? 0.4 : 1 },
          pressed ? { shadowColor: colors.accent, shadowOpacity: 0.7, shadowRadius: 14, elevation: 10 } : null,
        ]}>
          <Icon name={isBridge ? 'convert' : 'convert'} size={22} color={colors.accent} />
        </Pressable>
      </View>

      {/* Vers */}
      <GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{t('toEstimated')}</Text>
          {isBridge ? <Text style={{ color: colors.accent, fontSize: 12, fontFamily: fonts.semibold }}>🌉 Bridge</Text> : null}
        </View>
        <Text style={{ color: quote ? colors.text : colors.textMuted, fontSize: 32, fontFamily: fonts.extrabold, paddingVertical: spacing(0.5) }}>
          {quote ? formatBalance(quote.toAmount, quote.toToken.decimals, 6) : '—'}
        </Text>
        {/* Chaîne de destination */}
        <Text style={[typography.muted, { fontSize: 12, marginTop: 4 }]}>{t('destNetwork')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(1), paddingVertical: spacing(1) }}>
          {bridgeChains.map((id) => {
            const on = id === toChain;
            return (
              <Pressable key={id} onPress={() => pickToChain(id)} style={{ paddingVertical: spacing(0.75), paddingHorizontal: spacing(1.5), borderRadius: radii.pill, backgroundColor: on ? colors.accent : colors.glass, borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}>
                <Text style={{ color: on ? '#fff' : colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{getAdapter(id).config.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(0.5) }}>
          {toTokens.map((tk, i) => (
            <TokenPill key={tk.symbol} chainId={toChain} tok={tk} selected={i === to} onPress={() => { setTo(i); reset(); }} />
          ))}
        </View>
      </GlassCard>

      {/* Détails du devis */}
      {quote ? (
        <GlassCard>
          <Row label={t("route")} value={`LI.FI → ${quote.toolName}`} />
          <Row label={t("minReceived")} value={`${formatBalance(quote.toAmountMin, quote.toToken.decimals, 6)} ${toTok.symbol}`} />
          {quote.gasCostNative > 0n && quote.gasToken ? (
            <Row
              label={t("networkFee")}
              value={`≈ ${formatBalance(quote.gasCostNative, quote.gasToken.decimals, 6)} ${quote.gasToken.symbol}${quote.gasCostUsd > 0 ? ` ($${quote.gasCostUsd.toFixed(2)})` : ''}`}
            />
          ) : quote.gasCostUsd > 0 ? (
            <Row label={t("networkFee")} value={`≈ $${quote.gasCostUsd.toFixed(2)}`} />
          ) : null}
          <Row label={t("novaFee")} value={`${(Number(NOVA_FEE) * 100).toFixed(1)} %`} />
          {impact != null ? <Row label={t("priceImpact")} value={`${impact.toFixed(2)} %`} color={impact < -1 ? colors.down : colors.textMuted} /> : null}
          <Row label={t("slippage")} value={`${(quote.slippage * 100).toFixed(1)} %`} />
          {quote.durationSec > 0 ? <Row label={t("estTime")} value={`≈ ${quote.durationSec}s`} /> : null}
        </GlassCard>
      ) : null}

      {error ? <ErrorBox message={error} /> : null}

      {!quote ? (
        <Button label={loading ? t('findingRoute') : 'Obtenir un devis'} loading={loading} onPress={onQuote} />
      ) : (
        <Button label={isBridge ? 'Bridger' : 'Échanger'} onPress={() => setConfirming(true)} />
      )}

      <ConfirmUnlock
        visible={confirming}
        title={isBridge ? 'Confirmer le bridge' : 'Confirmer le swap'}
        subtitle={quote ? `${amount} ${fromTok.symbol} → ≈ ${formatBalance(quote.toAmount, quote.toToken.decimals, 6)} ${toTok.symbol}` : undefined}
        statusText={step}
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />

      <SuccessModal
        visible={success != null}
        title={t('swapSent')}
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
