/**
 * Envoyer (§4.3) — quatre étapes, barre de progression fine :
 *  1. Destinataire : coller, scanner, ENS, récents, contacts. Glyphe, détection
 *     d'EMPOISONNEMENT (bloquante), adresse jamais utilisée (douce), contrat.
 *  2. Montant : clavier maison, bascule devise/token, Max moins les frais,
 *     message clair si pas assez de gas.
 *  3. Récapitulatif (sheet) : à qui, combien (token + devise), réseau, frais en
 *     devise, simulation « ton solde passera de A à B », MAINTENIR pour envoyer.
 *  4. Suivi : Envoyée → Incluse → Confirmée, on peut quitter (notification).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable as RNPressable, Image } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Text, Button, IconButton, Surface, Divider, ListRow, TokenRow, AddressGlyph, AmountKeypad, StepBar, Sheet, HoldButton, TxSteps, Chip, Skeleton, Input, EmptyState, SegmentedControl, type TxStage } from '../ui/kit';
import { Icon } from '../ui/icon';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { useRecentRecipients, type RecipientFamily } from '../lib/recentRecipientsStore';
import { useContacts } from '../lib/contactsStore';
import { usePortfolioStore, splitHoldings, type Holding } from '../lib/portfolio';
import { notifyAndLog } from '../lib/notificationCenter';
import { friendlyTxError } from '../lib/txError';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';
import {
  getAdapter, isWalletError, isValidEvmAddress, isValidSolanaAddress, isValidBtcAddress, parseAmount, formatTokenAmount, formatInputAmount,
  formatAmount, formatFiat, getCustomTokens, looksLikeEnsName, resolveEnsName, detectPoisoning, groupAddress, shortAddress,
  estimateGasReserve, getPrices, getTokenPrices, chainIconUrl, EvmChainAdapter, SolanaChainAdapter, type FeeOptions, type FeeSpeed,
} from '../src';

type Step = 0 | 1 | 2 | 3 | 4;

export default function Send() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const fiat = useSettings((s) => s.fiat);
  const showTestnets = useSettings((s) => s.showTestnets);
  const sym = fiatSymbol(fiat);
  const wallet = useWallet();
  const { account, activeChain, accounts } = wallet;
  const chain = getAdapter(activeChain).config;
  const family = chain.family as RecipientFamily;
  const recents = useRecentRecipients((s) => s.recents).filter((r) => r.family === family);
  const addRecent = useRecentRecipients((s) => s.add);
  const contacts = useContacts((s) => s.contacts);
  const params = useLocalSearchParams<{ to?: string; amount?: string; contract?: string; mint?: string; symbol?: string; decimals?: string; chain?: string }>();
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const pf = usePortfolioStore();

  // « Quoi envoyer » (étape 0) : depuis l'accueil, on choisit le TOKEN et la chaîne
  // en découle. Depuis la page d'un token (params), on saute cette étape.
  const presetToken = !!(params.contract || params.mint || params.chain);
  const [step, setStep] = useState<Step>(presetToken ? 1 : 0);
  const [picked, setPicked] = useState<Holding | null>(null);
  const [search, setSearch] = useState('');
  const [environment, setEnvironment] = useState<'mainnet' | 'testnet'>('mainnet');
  useEffect(() => {
    if (params.chain && params.chain !== activeChain) setActiveChain(String(params.chain));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.chain]);
  const decimalsParam = params.decimals != null ? Number(params.decimals) : chain.nativeDecimals;
  const token = picked
    ? picked.kind === 'erc20' ? { kind: 'erc20' as const, contract: picked.contract!, symbol: picked.symbol, decimals: picked.decimals }
      : picked.kind === 'spl' ? { kind: 'spl' as const, mint: picked.contract!, symbol: picked.symbol, decimals: picked.decimals }
      : null
    : params.contract
      ? { kind: 'erc20' as const, contract: String(params.contract), symbol: String(params.symbol ?? 'TOKEN'), decimals: decimalsParam }
      : params.mint
        ? { kind: 'spl' as const, mint: String(params.mint), symbol: String(params.symbol ?? 'TOKEN'), decimals: decimalsParam }
        : null;
  const symbol = token ? token.symbol : chain.nativeSymbol;
  const decimals = token ? token.decimals : chain.nativeDecimals;
  const isNativeSend = !token;

  const [to, setTo] = useState(String(params.to ?? ''));
  const [amount, setAmount] = useState(String(params.amount ?? ''));
  // Retour du scanner / des contacts : les params changent, on les applique.
  useEffect(() => {
    if (params.to) setTo(String(params.to));
  }, [params.to]);
  useEffect(() => {
    if (params.amount) setAmount(String(params.amount));
  }, [params.amount]);
  // Étape 0 : le portefeuille agrégé doit être chargé (cache d'abord).
  useEffect(() => {
    const st = accounts.find((a) => a.index === wallet.activeAccountIndex) ?? accounts[0];
    if (!st) return;
    const a = { evmAddress: st.evmAddress, solAddress: st.solAddress, btcAddress: st.btcAddress };
    pf.hydrate(a, fiat).then(() => pf.refresh(a, fiat, { includeTestnets: showTestnets, force: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.activeAccountIndex, fiat, showTestnets]);
  const [inFiat, setInFiat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Adresse valide selon la famille ──
  const validAddress = useCallback((a: string) => (family === 'evm' ? isValidEvmAddress(a) : family === 'solana' ? isValidSolanaAddress(a) : isValidBtcAddress(a)), [family]);

  // ── ENS ──
  const isEns = family === 'evm' && looksLikeEnsName(to.trim());
  const [ens, setEns] = useState<{ status: 'idle' | 'resolving' | 'found' | 'notfound'; address: string | null }>({ status: 'idle', address: null });
  useEffect(() => {
    if (!isEns) return setEns({ status: 'idle', address: null });
    setEns({ status: 'resolving', address: null });
    const name = to.trim();
    const timer = setTimeout(() => {
      resolveEnsName(name).then((a) => setEns(a ? { status: 'found', address: a } : { status: 'notfound', address: null })).catch(() => setEns({ status: 'notfound', address: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [to, isEns]);
  const recipient = isEns ? ens.address ?? '' : to.trim();
  const recipientOk = !!recipient && validAddress(recipient);

  // ── Confiance : mes comptes + récents + contacts ──
  const known = useMemo(() => [...accounts.flatMap((a) => [a.evmAddress, a.solAddress ?? '', a.btcAddress]).filter(Boolean), ...recents.map((r) => r.address), ...contacts.map((c) => c.address)], [accounts, recents, contacts]);
  const poisoning = recipientOk ? detectPoisoning(recipient, known) : null;
  const isKnown = recipientOk && known.some((k) => k.toLowerCase() === recipient.toLowerCase());
  const contactName = contacts.find((c) => c.address.toLowerCase() === recipient.toLowerCase())?.name;
  const [isContract, setIsContract] = useState(false);
  useEffect(() => {
    setIsContract(false);
    if (!recipientOk || family !== 'evm') return;
    const a = getAdapter(activeChain);
    if (a instanceof EvmChainAdapter) a.isContract(recipient).then(setIsContract);
  }, [recipient, recipientOk, family, activeChain]);

  // ── Solde, prix, frais ──
  const [balance, setBalance] = useState<bigint | null>(null);
  const [nativeBal, setNativeBal] = useState<bigint | null>(null);
  const [price, setPrice] = useState(0);
  const [nativePrice, setNativePrice] = useState(0);
  const [feeOptions, setFeeOptions] = useState<FeeOptions | null>(null);
  const [speed, setSpeed] = useState<FeeSpeed>('normal');
  const [reserve, setReserve] = useState<bigint>(0n);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    const a = getAdapter(activeChain);
    (async () => {
      const [nat, res, np] = await Promise.all([
        a.getBalance(account.address).then((b) => b.raw).catch(() => null),
        estimateGasReserve(a).then((r) => r.raw).catch(() => 0n),
        chain.coingeckoId ? getPrices([chain.coingeckoId], fiat).then((p) => p[chain.coingeckoId!]?.price ?? 0).catch(() => 0) : Promise.resolve(0),
      ]);
      if (!alive) return;
      setNativeBal(nat);
      setReserve(res);
      setNativePrice(np);
      if (!token) {
        setBalance(nat);
        setPrice(np);
      } else if (token.kind === 'erc20') {
        const [t] = await getCustomTokens(chain, account.address, [token.contract]).catch(() => [] as { raw: bigint }[]);
        const tp = chain.coingeckoPlatform ? await getTokenPrices(chain.coingeckoPlatform, [token.contract], fiat).catch(() => ({} as Record<string, number>)) : {};
        if (!alive) return;
        setBalance(t?.raw ?? 0n);
        setPrice(tp[token.contract.toLowerCase()] ?? 0);
      } else if (token.kind === 'spl' && a instanceof SolanaChainAdapter) {
        const list = await a.getSplTokens(account.address).catch(() => []);
        const tp = await getTokenPrices('solana', [token.mint], fiat).catch(() => ({} as Record<string, number>));
        if (!alive) return;
        setBalance(list.find((x) => x.mint === token.mint)?.raw ?? 0n);
        setPrice(tp[token.mint.toLowerCase()] ?? 0);
      }
      if (a instanceof EvmChainAdapter) a.getFeeOptions(token ? 65_000n : undefined).then((f) => alive && setFeeOptions(f)).catch(() => {});
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, activeChain, fiat, params.contract, params.mint, picked?.id]);

  // Frais en natif (unité brute) : palier EVM choisi, sinon réserve dynamique.
  const feeRaw = feeOptions ? feeOptions[speed].costWei : reserve;
  const feeFiat = Number(formatAmount(feeRaw, chain.nativeDecimals)) * nativePrice;

  // ── Montant ──
  const amountNum = Number(amount) || 0;
  const tokenAmountStr = inFiat ? (price > 0 ? (amountNum / price).toFixed(Math.min(decimals, 8)).replace(/\.?0+$/, '') : '0') : amount;
  let amountRaw = 0n;
  try {
    amountRaw = tokenAmountStr ? parseAmount(tokenAmountStr, decimals).raw : 0n;
  } catch {
    amountRaw = 0n;
  }
  const fiatOfAmount = inFiat ? amountNum : amountNum * price;
  const available = balance != null ? (isNativeSend ? (balance > feeRaw ? balance - feeRaw : 0n) : balance) : 0n;
  const overBalance = balance != null && amountRaw > available;
  const notEnoughGas = !isNativeSend && nativeBal != null && nativeBal < feeRaw;

  const setMax = () => {
    haptic.light();
    setInFiat(false);
    setAmount(formatInputAmount(available, decimals));
  };

  // ── Étape 3 → 4 ──
  const [confirming, setConfirming] = useState(false);
  const [stage, setStage] = useState<TxStage>('sent');
  const [hash, setHash] = useState<string | null>(null);

  const perform = async (unlock: Unlock) => {
    try {
      const gas = feeOptions ? { maxFeePerGas: feeOptions[speed].maxFeePerGas, maxPriorityFeePerGas: feeOptions[speed].maxPriorityFeePerGas } : undefined;
      const h =
        token?.kind === 'spl' ? await wallet.sendSolToken(recipient, tokenAmountStr, { mint: token.mint, decimals: token.decimals }, unlock)
        : token?.kind === 'erc20' ? await wallet.sendToken(recipient, tokenAmountStr, { contract: token.contract, decimals: token.decimals }, unlock, gas)
        : await wallet.signAndSend(recipient, tokenAmountStr, unlock, gas);
      setHash(h);
      setStage('sent');
      addRecent(recipient, family);
      const dest = contactName ?? (isEns ? to.trim() : shortAddress(recipient));
      notifyAndLog('tx', t("sendTitle"), t('sendSuccessMsg').replace('${formatTokenAmount(amountRaw, decimals)}', formatTokenAmount(amountRaw, decimals)).replace('${symbol}', symbol).replace('${dest}', dest));
      haptic.success();
    } catch (e) {
      if (isWalletError(e) && e.code === 'WRONG_PIN') throw e;
      throw new Error(friendlyTxError(e));
    }
  };

  // Suivi : attente de confirmation (EVM 1 bloc ; Solana poll ; BTC = envoyée).
  useEffect(() => {
    if (step !== 4 || !hash) return;
    let alive = true;
    const a = getAdapter(activeChain);
    (async () => {
      try {
        if (a instanceof EvmChainAdapter) {
          setStage('included');
          await a.waitForTx(hash);
        } else if (a instanceof SolanaChainAdapter) {
          for (let i = 0; i < 40 && alive; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const st = await a.rpc<{ value?: ({ err?: unknown; confirmationStatus?: string } | null)[] }>('getSignatureStatuses', [[hash]]).catch(() => null);
            const s = st?.value?.[0];
            if (s?.err) throw new Error('failed');
            if (s?.confirmationStatus) setStage('included');
            if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') break;
          }
        } else {
          return; // Bitcoin : pas de suivi in-app (v1)
        }
        if (alive) {
          setStage('confirmed');
          haptic.success();
          notifyAndLog('tx', t("sendConfirmTitle"), t('confirmSuccessMsg').replace('${formatTokenAmount(amountRaw, decimals)}', formatTokenAmount(amountRaw, decimals)).replace('${symbol}', symbol).replace('${contactName ?? shortAddress(recipient)}', contactName ?? shortAddress(recipient)));
        }
      } catch {
        if (alive) setStage('failed');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hash]);

  const goStep2 = () => {
    setError(null);
    if (!recipientOk) {
      const fam = family === 'evm' ? t("errNeedEvmAddress") : family === 'solana' ? t("errNeedSolAddress") : t("errNeedBtcAddress");
      return setError(isEns && ens.status === 'resolving' ? t("errResolvingEns") : isEns ? t("errEnsNotFound") : t('errNeedAddressFull').replace('${symbol}', symbol).replace('${chain.name}', chain.name).replace('${fam}', fam));
    }
    if (poisoning) return; // bloquant, message déjà affiché
    haptic.light();
    setStep(2);
  };
  const goStep3 = () => {
    setError(null);
    if (amountRaw <= 0n) return setError(t("errEnterAmount"));
    if (overBalance) return setError(`Tu possèdes ${formatTokenAmount(balance ?? 0n, decimals)} ${symbol}${isNativeSend ? ` (frais réservés : ${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol})` : ''}.`);
    if (notEnoughGas) return setError(t('errNotEnoughGas').replace('${chain.nativeSymbol}', chain.nativeSymbol).replace('${formatFiat(feeFiat)}', formatFiat(feeFiat)).replace('${sym}', sym));
    try {
      if (isNativeSend) getAdapter(activeChain).buildTransfer({ to: recipient, amount: tokenAmountStr });
    } catch (e) {
      return setError(isWalletError(e) ? e.message : t("errInvalidAmount"));
    }
    haptic.light();
    setStep(3);
  };

  const paste = async () => {
    const c = (await Clipboard.getStringAsync()).trim();
    if (c) { setTo(c); haptic.light(); }
  };

  if (!account) return null;
  const destLabel = contactName ?? (isEns ? to.trim() : null);
  const afterBalance = balance != null ? balance - amountRaw - (isNativeSend ? feeRaw : 0n) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* En-tête + barre de progression */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => (step === 0 || step === 4 || (step === 1 && presetToken) ? router.back() : setStep((s) => (s - 1) as Step))} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Text variant="title2">{step === 0 ? t("aiSend") : step === 4 ? t("headerTracking") : t('headerSendToken').replace('${symbol}', symbol)}</Text>
            {step > 0 && chainIconUrl(chain.id) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: colors.surface2 }}>
                <Image source={{ uri: chainIconUrl(chain.id) }} style={{ width: 14, height: 14, borderRadius: 7 }} />
                <Text variant="micro" tone="secondary">{chain.name}</Text>
              </View>
            ) : null}
          </View>
          {step > 0 ? <Text variant="caption" tone="tertiary">{step}/4</Text> : null}
        </View>
        {step > 0 ? <StepBar step={step} total={4} /> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[5], flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* ── 0. Quoi envoyer (agrégé multi-chaîne) ── */}
        {step === 0 ? (() => {
          const { main, small } = splitHoldings(pf.holdings);
          const q = search.trim().toLowerCase();
          const list = [...main, ...small].filter((h) => {
            const isTestnet = getAdapter(h.chainId).config.testnet === true;
            return h.raw > 0n && isTestnet === (environment === 'testnet') &&
              (!q || h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q) || getAdapter(h.chainId).config.name.toLowerCase().includes(q));
          });
          return (
            <>
              <Input placeholder="usdc, arbitrum…" value={search} onChangeText={setSearch} autoCapitalize="none" />
              {showTestnets ? <SegmentedControl items={[{ key: 'mainnet', label: t("tabMainnet") }, { key: 'testnet', label: t("tabTestnet") }]} value={environment} onChange={setEnvironment} /> : null}
              {pf.loading && pf.holdings.length === 0 ? (
                <Surface padded={false}>{[0, 1, 2].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center', gap: space[2] }}><Skeleton width="55%" /><Skeleton width="30%" height={12} /></View>)}</Surface>
              ) : list.length === 0 ? (
                <Surface><EmptyState icon="send" title={q ? t("emptySearchTitle") : t("emptySendTitle")} body={q ? undefined : t("emptySendBody")} actionLabel={q ? undefined : t("receive")} onAction={q ? undefined : () => router.replace('/receive')} /></Surface>
              ) : (
                <Surface padded={false}>
                  {list.map((h, i) => (
                    <React.Fragment key={h.id}>
                      <TokenRow
                        symbol={h.symbol}
                        name={`${h.symbol} sur ${getAdapter(h.chainId).config.name}`}
                        logo={h.kind === 'native' ? chainIconUrl(h.chainId) : h.logo}
                        address={h.contract ?? h.chainId}
                        balance={`${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`}
                        fiat={h.price > 0 ? `${formatFiat(h.fiat)} ${sym}` : undefined}
                        onPress={() => {
                          haptic.light();
                          setPicked(h);
                          setActiveChain(h.chainId);
                          setAmount('');
                          setStep(1);
                        }}
                      />
                      {i < list.length - 1 ? <Divider inset={68} /> : null}
                    </React.Fragment>
                  ))}
                </Surface>
              )}
            </>
          );
        })() : null}

        {/* ── 1. Destinataire ── */}
        {step === 1 ? (
          <>
            <Surface level={2} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3] }}>
              {recipientOk ? <AddressGlyph address={recipient} size={40} /> : <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon name="profile" size={18} tone="faint" /></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" tone="secondary">{t("labelTo")}</Text>
                <RNPressable onPress={paste} accessibilityLabel={t("a11yPasteAddress")}>
                  {recipientOk ? (
                    <>
                      <Text variant="body" numberOfLines={1}>{contactName ?? (isEns ? to.trim() : t("unknownAddress"))}</Text>
                      <Text variant="caption" tone="secondary" numberOfLines={2}>{groupAddress(recipient)}</Text>
                    </>
                  ) : (
                    <Text variant="body" numberOfLines={2} tone={to ? 'primary' : 'tertiary'}>{to || t("placeholderAddress")}</Text>
                  )}
                </RNPressable>
              </View>
              {to ? <IconButton icon="close" label={t("keypadErase")} tone="ghost" onPress={() => setTo('')} /> : null}
            </Surface>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Chip label={t("chipPaste")} icon="copy" onPress={paste} />
              <Chip label={t("chipScan")} icon="scan" onPress={() => router.push('/scan')} />
              <Chip label={t("chipContacts")} icon="contacts" onPress={() => router.push('/contacts')} />
            </View>
            {isEns && ens.status === 'resolving' ? <Text variant="caption" tone="secondary">{t("resolvingEns")}</Text> : null}

            {poisoning ? (
              <Surface style={{ borderColor: colors.danger, gap: space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Icon name="alert" size={18} color={colors.danger} /><Text variant="body" tone="danger">{t("suspiciousAddressTitle")}</Text></View>
                <Text variant="bodySecondary" tone="secondary">{t("suspiciousAddressBody")}</Text>
                <View style={{ flexDirection: 'row', gap: space[2] }}><AddressGlyph address={poisoning.lookalike} size={28} /><Text variant="caption" tone="secondary" style={{ flex: 1 }}>{groupAddress(poisoning.lookalike)}</Text></View>
                <View style={{ flexDirection: 'row', gap: space[2] }}><AddressGlyph address={recipient} size={28} /><Text variant="caption" tone="danger" style={{ flex: 1 }}>{groupAddress(recipient)}</Text></View>
              </Surface>
            ) : recipientOk && !isKnown ? (
              <Surface style={{ borderColor: colors.warning, gap: space[1] }}>
                <Text variant="body" tone="warning">{t("neverSentWarning")}</Text>
                <Text variant="bodySecondary" tone="secondary">{t("checkEndWarning")}<Text variant="body">…{recipient.slice(-4)}</Text></Text>
              </Surface>
            ) : null}
            {isContract ? <Text variant="caption" tone="warning">{t("contractAddressWarning")}</Text> : null}
            {contactName ? <Text variant="caption" tone="secondary">{t("contactLabel").replace("${contactName}", contactName)}</Text> : null}

            {recents.length > 0 ? (
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">{t("recents")}</Text>
                <Surface padded={false}>
                  {recents.slice(0, 5).map((r, i) => (
                    <React.Fragment key={r.address}>
                      <ListRow left={<AddressGlyph address={r.address} size={36} />} title={contacts.find((c) => c.address.toLowerCase() === r.address.toLowerCase())?.name ?? shortAddress(r.address)} subtitle={groupAddress(r.address)} onPress={() => setTo(r.address)} />
                      {i < Math.min(recents.length, 5) - 1 ? <Divider inset={64} /> : null}
                    </React.Fragment>
                  ))}
                </Surface>
              </View>
            ) : null}
            {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
            <View style={{ flex: 1 }} />
            <Button label={t("actionContinue")} onPress={goStep2} disabled={!recipientOk || !!poisoning} />
          </>
        ) : null}

        {/* ── 2. Montant ── */}
        {step === 2 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <AddressGlyph address={recipient} size={28} />
              <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>{t("labelTo")}{destLabel ?? shortAddress(recipient)}</Text>
            </View>
            <RNPressable onPress={() => price > 0 && setInFiat((v) => !v)} accessibilityLabel={t("a11yToggleCurrency")} style={{ paddingVertical: space[4] }}>
              <Text variant="balance" tabular numberOfLines={1} adjustsFontSizeToFit tone={overBalance ? 'danger' : 'primary'}>
                {amount || '0'} <Text variant="title2" tone="secondary">{inFiat ? sym : symbol}</Text>
              </Text>
              <Text variant="caption" tone="secondary" tabular>
                {price > 0 ? (inFiat ? `≈ ${tokenAmountStr || '0'} ${symbol}` : `≈ ${formatFiat(fiatOfAmount)} ${sym}`) : ' '}{price > 0 ? '  ⇅' : ''}
              </Text>
            </RNPressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {balance == null ? <Skeleton width={160} /> : <Text variant="caption" tone="secondary" tabular>Disponible : {formatTokenAmount(available, decimals)} {symbol}</Text>}
              <Chip label={t("chipMax")} onPress={setMax} />
            </View>
            {notEnoughGas ? <Text variant="caption" tone="warning">Il te manque un peu de {chain.nativeSymbol} pour les frais (environ {formatFiat(feeFiat)} {sym}).</Text> : null}
            {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
            <View style={{ flex: 1 }} />
            <AmountKeypad value={amount} onChange={(v) => { setAmount(v); setError(null); }} maxDecimals={inFiat ? 2 : Math.min(decimals, 8)} />
            <Button label={t("verify")} onPress={goStep3} disabled={amountRaw <= 0n} />
          </>
        ) : null}

        {/* ── 4. Suivi ── */}
        {step === 4 ? (
          <>
            <Surface style={{ gap: space[4] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <AddressGlyph address={recipient} size={44} />
                <View style={{ flex: 1 }}>
                  <Text variant="title2" tabular>{formatTokenAmount(amountRaw, decimals)} {symbol}</Text>
                  <Text variant="caption" tone="secondary">vers {destLabel ?? shortAddress(recipient)} · {chain.name}</Text>
                </View>
              </View>
              <Divider />
              <TxSteps stage={stage} />
              {stage === 'failed' ? <Text variant="caption" tone="danger">{t("txFailedMsg")}</Text> : null}
            </Surface>
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t("canLeaveScreenInfo")}</Text>
            {chain.explorerUrl && hash ? <Button label={t("viewOnExplorer")} variant="secondary" size="md" onPress={() => router.push({ pathname: '/browser', params: { url: `${chain.explorerUrl}/tx/${hash}` } })} /> : null}
            <View style={{ flex: 1 }} />
            <Button label={t("actionDone")} onPress={() => router.replace('/home')} />
          </>
        ) : null}
      </ScrollView>

      {/* ── 3. Récapitulatif (sheet) ── */}
      <Sheet visible={step === 3 && !confirming} onClose={() => setStep(2)}>
        <Text variant="title2">{t("verifyBeforeSendTitle")}</Text>
        <Surface padded={false}>
          <ListRow left={<AddressGlyph address={recipient} size={40} />} title={destLabel ?? t("labelRecipient")} subtitle={groupAddress(recipient)} />
          <Divider inset={68} />
          <ListRow title={t("txLabelAmount")} right={<View style={{ alignItems: 'flex-end' }}><Text variant="body" tabular>{formatTokenAmount(amountRaw, decimals)} {symbol}</Text>{price > 0 ? <Text variant="caption" tone="secondary" tabular>≈ {formatFiat(fiatOfAmount)} {sym}</Text> : null}</View>} />
          <Divider inset={16} />
          <ListRow title={t("labelNetwork")} right={<Text variant="body">{chain.name}</Text>} />
          <Divider inset={16} />
          <ListRow title={t("labelNetworkFee")} subtitle={feeOptions ? `${speed === 'slow' ? t("feeSlow") : speed === 'fast' ? t("feeFast") : t("feeNormal")} · ${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}` : `${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}`} right={<Text variant="body" tabular>{nativePrice > 0 ? `environ ${formatFiat(feeFiat)} ${sym}` : '—'}</Text>} />
        </Surface>
        {feeOptions ? (
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {(['slow', 'normal', 'fast'] as FeeSpeed[]).map((s) => <Chip key={s} label={s === 'slow' ? t("feeSlow") : s === 'normal' ? t("feeNormal") : t("feeFast")} selected={speed === s} onPress={() => setSpeed(s)} />)}
          </View>
        ) : null}
        {afterBalance != null ? (
          <Text variant="bodySecondary" tone="secondary">{t("balanceUpdatePreview").replace("${symbol}", symbol).replace("${formatTokenAmount(balance!, decimals)}", formatTokenAmount(balance!, decimals)).replace("${formatTokenAmount(afterBalance < 0n ? 0n : afterBalance, decimals)}", formatTokenAmount(afterBalance < 0n ? 0n : afterBalance, decimals))}</Text>
        ) : null}
        {family === 'evm' ? <Text variant="caption" tone="warning">{t("checkNetworkWarning").replace("${chain.name}", chain.name)}</Text> : null}
        {!isKnown ? <Text variant="caption" tone="warning">{t("firstTimeWarning").replace("${recipient.slice(-4)}", recipient.slice(-4))}</Text> : null}
        <HoldButton label={t("holdToSend")} onComplete={() => setConfirming(true)} />
      </Sheet>

      <ConfirmUnlock
        visible={confirming}
        title={t('sendConfirmUnlockTitle').replace('${formatTokenAmount(amountRaw, decimals)}', formatTokenAmount(amountRaw, decimals)).replace('${symbol}', symbol)}
        subtitle={t('sendConfirmUnlockSubtitle').replace('${destLabel ?? shortAddress(recipient)}', destLabel ?? shortAddress(recipient)).replace('${chain.name}', chain.name)}
        perform={perform}
        onDone={() => { setConfirming(false); setStep(4); }}
        onCancel={() => setConfirming(false)}
        aiContext={{ to: recipient, value: tokenAmountStr, method: 'transfer' }}
      />
    </View>
  );
}
