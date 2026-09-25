/**
 * Envoyer (web) — même parcours que l'app (app/send.tsx, §4.3), quatre étapes
 * et barre de progression :
 *  0. Quoi envoyer : TOUS les actifs détenus, tous réseaux (portefeuille
 *     agrégé partagé avec l'app, spam exclu), le réseau découle du choix.
 *  1. Destinataire : coller, contacts, ENS, récents ; glyphe, EMPOISONNEMENT
 *     (bloquant), adresse jamais utilisée (douce), contrat.
 *  2. Montant : clavier maison, bascule devise/token, Max moins les frais.
 *  3. Récapitulatif (sheet) + simulation Anti-Drainer, MAINTENIR pour envoyer.
 *  4. Suivi : Envoyée → Incluse → Confirmée.
 *
 * Différence fondamentale avec l'app : ce site ne signe JAMAIS. Le « maintenir »
 * envoie la demande au téléphone via WalletConnect ; PIN/biométrie et signature
 * se font dans Kalyx :
 *  - EVM     : eth_sendTransaction (natif ou transfer ERC-20).
 *  - Solana  : la transaction (SOL ou SPL) est construite ici NON signée, le
 *              téléphone la signe (solana_signTransaction), ce site la diffuse.
 *  - Bitcoin : sendTransfer — le téléphone construit, signe et diffuse.
 * Les frais réseau affichés sont une estimation — c'est le téléphone qui les fixe.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable as RNPressable, Image, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { base64 } from '@scure/base';
import { Text, Button, IconButton, Surface, Divider, ListRow, TokenRow, AddressGlyph, AmountKeypad, StepBar, Sheet, HoldButton, TxSteps, Chip, Skeleton, Input, EmptyState, type TxStage } from '../kit';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { space, SCREEN_MARGIN, radius } from '../tokens';
import { useSettings, useT, fiatSymbol } from '../../lib/settingsStore';
import { useRecentRecipients, type RecipientFamily } from '../../lib/recentRecipientsStore';
import { useContacts } from '../../lib/contactsStore';
import { useWebConnect } from '../../lib/webConnect';
import { usePortfolioStore, splitHoldings, type Holding } from '../../lib/portfolio';
import { submitSolanaSigned } from '../../lib/solanaSubmit';
import { toast } from '../../lib/toast';
import {
  getAdapter, isValidEvmAddress, isValidSolanaAddress, isValidBtcAddress, parseAmount, formatTokenAmount, formatInputAmount, formatAmount, formatFiat,
  getPrices, looksLikeEnsName, resolveEnsName, detectPoisoning, groupAddress, shortAddress,
  estimateGasReserve, chainIconUrl, EvmChainAdapter, SolanaChainAdapter, type FeeOptions, simulateSendTransaction, type SimulationResult,
  type ChainConfig,
} from '../../src';
import { buildTransferMessage, encodeLength } from '../../src/domain/chains/solTx';
import { buildSplTransferMessage } from '../../src/domain/chains/solSpl';
import { AntiDrainerBanner } from '../../src/components/security/AntiDrainerBanner';
import { encodeErc20Transfer, hexQuantity } from './evmEncode';
import { useWebT } from './webI18n';
import { KalyxSpinner } from './motion';
import { addressForChain, chainOf, useWebPortfolioAccount } from './webAccounts';

type Step = 0 | 1 | 2 | 3 | 4;

/** Transaction Solana « legacy » NON signée : 1 signature vide + message. */
function unsignedSolanaTx(message: Uint8Array): string {
  return base64.encode(Uint8Array.from([...encodeLength(1), ...new Array<number>(64).fill(0), ...message]));
}

function pick<T>(o: unknown, keys: string[]): T | undefined {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (v != null) return v as T;
  }
  return undefined;
}

export function SendFlow({ chain: initialChain, onClose, onReceive }: { chain: ChainConfig; onClose: () => void; onReceive: () => void }) {
  const t = useT();
  const tw = useWebT();
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const showTestnets = useSettings((s) => s.showTestnets);
  const sym = fiatSymbol(fiat);
  const request = useWebConnect((s) => s.request);
  const setChain = useWebConnect((s) => s.setChain);
  const accounts = useWebConnect((s) => s.accounts);

  const [step, setStep] = useState<Step>(0);
  const [picked, setPicked] = useState<Holding | null>(null);
  const [search, setSearch] = useState('');

  // ── 0. Portefeuille agrégé (même store que l'app : tous réseaux, spam exclu) ──
  const pf = usePortfolioStore();
  const pfAccount = useWebPortfolioAccount();
  useEffect(() => {
    if (!pfAccount) return;
    pf.hydrate(pfAccount, fiat).then(() => pf.refresh(pfAccount, fiat, { includeTestnets: showTestnets, force: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pfAccount, fiat, showTestnets]);

  const chain = (picked ? chainOf(picked.chainId) : undefined) ?? initialChain;
  const family = chain.family as RecipientFamily;
  const senderAddress = useMemo(() => addressForChain(accounts, chain.id), [accounts, chain.id]);

  const token = picked && picked.kind !== 'native' ? { kind: picked.kind, contract: picked.contract!, symbol: picked.symbol, decimals: picked.decimals } : null;
  const symbol = picked?.symbol ?? chain.nativeSymbol;
  const decimals = picked?.decimals ?? chain.nativeDecimals;
  const isNativeSend = !token;

  const recents = useRecentRecipients((s) => s.recents).filter((r) => r.family === family);
  const addRecent = useRecentRecipients((s) => s.add);
  const contacts = useContacts((s) => s.contacts);

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [inFiat, setInFiat] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);

  const cleanAddressInput = (str: string): string | null => {
    const trimmed = (str ?? '').trim();
    if (!trimmed || /\s/.test(trimmed) || trimmed.length > 120) return null;
    return trimmed;
  };

  const validAddress = useCallback((a: string) => (family === 'evm' ? isValidEvmAddress(a) : family === 'solana' ? isValidSolanaAddress(a) : isValidBtcAddress(a)), [family]);

  // ── ENS (EVM seulement) ──
  const isEns = family === 'evm' && looksLikeEnsName(to.trim());
  const [ens, setEns] = useState<{ status: 'idle' | 'resolving' | 'found' | 'notfound'; address: string | null }>({ status: 'idle', address: null });
  useEffect(() => {
    if (!isEns) return setEns({ status: 'idle', address: null });
    setEns({ status: 'resolving', address: null });
    const name = to.trim();
    const timer = setTimeout(() => {
      resolveEnsName(name)
        .then((a) => setEns(a ? { status: 'found', address: a } : { status: 'notfound', address: null }))
        .catch(() => setEns({ status: 'notfound', address: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [to, isEns]);
  const recipient = isEns ? ens.address ?? '' : to.trim();
  const recipientOk = !!recipient && validAddress(recipient);

  // ── Confiance : mes comptes (session WalletConnect) + récents + contacts ──
  const known = useMemo(() => [...accounts.map((a) => a.address), ...recents.map((r) => r.address), ...contacts.map((c) => c.address)].filter(Boolean), [accounts, recents, contacts]);
  const poisoning = recipientOk ? detectPoisoning(recipient, known) : null;
  const isKnown = recipientOk && known.some((k) => k.toLowerCase() === recipient.toLowerCase());
  const contactName = contacts.find((c) => c.address.toLowerCase() === recipient.toLowerCase())?.name;
  const [isContract, setIsContract] = useState(false);
  useEffect(() => {
    setIsContract(false);
    if (!recipientOk || family !== 'evm') return;
    const a = getAdapter(chain.id);
    if (a instanceof EvmChainAdapter) a.isContract(recipient).then(setIsContract).catch(() => {});
  }, [recipient, recipientOk, family, chain.id]);

  // ── Solde, prix, frais (estimation — le téléphone fixe les frais réels) ──
  const balance = picked?.raw ?? null;
  const price = picked?.price ?? 0;
  const nativeHolding = pf.holdings.find((h) => h.kind === 'native' && h.chainId === chain.id) ?? null;
  const [nativeBal, setNativeBal] = useState<bigint | null>(null);
  const [nativePrice, setNativePrice] = useState(0);
  const [feeOptions, setFeeOptions] = useState<FeeOptions | null>(null);
  const [reserve, setReserve] = useState<bigint>(0n);
  useEffect(() => {
    setFeeOptions(null);
    setReserve(0n);
    setNativeBal(nativeHolding?.raw ?? null);
    setNativePrice(nativeHolding?.price ?? 0);
    if (!picked || !senderAddress) return;
    let alive = true;
    const a = getAdapter(chain.id);
    a.getBalance(senderAddress).then((b) => alive && setNativeBal(b.raw)).catch(() => {});
    if (!nativeHolding?.price && chain.coingeckoId) {
      getPrices([chain.coingeckoId], fiat).then((p) => alive && setNativePrice(p[chain.coingeckoId!]?.price ?? 0)).catch(() => {});
    }
    estimateGasReserve(a).then((r) => alive && setReserve(r.raw)).catch(() => {});
    if (a instanceof EvmChainAdapter) a.getFeeOptions(token ? 65_000n : undefined).then((f) => alive && setFeeOptions(f)).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.id, chain.id, senderAddress, fiat]);
  const feeRaw = feeOptions ? feeOptions.normal.costWei : reserve;
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
  const hasEnteredAmount = parseFloat(amount || '0') > 0;
  const notEnoughGas = hasEnteredAmount && nativeBal != null && nativeBal < feeRaw;
  const approxVal = feeFiat > 0 ? `${formatFiat(feeFiat)} ${sym}` : `${formatAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}`;
  const missingFeeText = t('aboutApprox').replace('{amount}', approxVal);

  const setMax = () => {
    setAmountError(null);
    if (balance != null && balance > 0n && available === 0n) {
      setAmount('0');
    } else {
      setInFiat(false);
      setAmount(formatInputAmount(available, decimals));
    }
  };

  // ── 3 → 4 : demande au téléphone, puis suivi ──
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [stage, setStage] = useState<TxStage>('sent');
  const [hash, setHash] = useState<string | null>(null);

  // ── Anti-Drainer ──
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [forceSendChecked, setForceSendChecked] = useState(false);
  useEffect(() => {
    if (step !== 3 || !recipient) {
      setSimResult(null); setIsSimulating(false); setForceSendChecked(false);
      return;
    }
    let alive = true;
    setIsSimulating(true);
    setForceSendChecked(false);
    const adapter = getAdapter(chain.id);
    simulateSendTransaction({
      family, from: senderAddress, to: recipient, amount: amountRaw, tokenSymbol: symbol, tokenDecimals: decimals,
      provider: adapter instanceof EvmChainAdapter ? adapter : undefined, chainId: chain.evmChainId,
    })
      .then((res) => { if (alive) { setSimResult(res); setIsSimulating(false); } })
      .catch(() => { if (alive) setIsSimulating(false); });
    return () => { alive = false; };
  }, [step, recipient, amountRaw, symbol, decimals, family, senderAddress, chain.id, chain.evmChainId]);

  /** Envoie la demande de signature au téléphone selon la famille ; renvoie le hash/signature/txid. */
  const sendViaPhone = async (): Promise<string> => {
    // `request` cible la chaîne sélectionnée dans la session : on l'aligne sur celle de l'actif.
    setChain(chain.id);
    if (family === 'evm') {
      const tx = token
        ? { from: senderAddress, to: token.contract, value: '0x0', data: encodeErc20Transfer(recipient, amountRaw) }
        : { from: senderAddress, to: recipient, value: hexQuantity(amountRaw) };
      return request('eth_sendTransaction', [tx]);
    }
    if (family === 'solana') {
      const sol = getAdapter(chain.id) as SolanaChainAdapter;
      const latest = await sol.rpc<{ value?: { blockhash?: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
      const recentBlockhash = latest?.value?.blockhash;
      if (!recentBlockhash) throw new Error(tw('blockhashUnavailable'));
      const message = token
        ? buildSplTransferMessage({ from: senderAddress, to: recipient, mint: token.contract, amount: amountRaw, decimals: token.decimals, recentBlockhash })
        : buildTransferMessage({ from: senderAddress, to: recipient, lamports: amountRaw, recentBlockhash });
      const res: unknown = await request('solana_signTransaction', [{ transaction: unsignedSolanaTx(message) }]);
      const signed = pick<string>(res, ['transaction']) ?? (typeof res === 'string' ? res : undefined);
      if (!signed) throw new Error(tw('phoneNoSignedTx'));
      // Simulation + diffusion + attente de confirmation : même chemin que l'app.
      return submitSolanaSigned(signed);
    }
    const res: unknown = await request('sendTransfer', [{ recipientAddress: recipient, amount: tokenAmountStr }]);
    const txid = pick<string>(res, ['txid']) ?? (typeof res === 'string' ? res : undefined);
    if (!txid) throw new Error(tw('phoneNoTxid'));
    return txid;
  };

  const perform = async () => {
    setConfirming(true);
    setSendError(null);
    setHash(null);
    setStep(4);
    try {
      const h = await sendViaPhone();
      setHash(h);
      // Solana : submitSolanaSigned ne résout qu'une fois confirmé ; Bitcoin : pas de suivi in-app (v1).
      setStage(family === 'solana' ? 'confirmed' : 'sent');
      addRecent(recipient, family);
      toast.success(t('sendTitle'), `${formatTokenAmount(amountRaw, decimals)} ${symbol}`);
      pf.refresh(pfAccount!, fiat, { includeTestnets: showTestnets, force: true }).catch(() => {});
    } catch (e) {
      setSendError(e instanceof Error ? e.message : tw('rejectedOrFailed'));
      setStep(3);
    } finally {
      setConfirming(false);
    }
  };

  // Suivi EVM : 1 bloc.
  useEffect(() => {
    if (step !== 4 || !hash || family !== 'evm') return;
    let alive = true;
    const a = getAdapter(chain.id);
    (async () => {
      try {
        if (a instanceof EvmChainAdapter) {
          setStage('included');
          await a.waitForTx(hash);
        }
        if (alive) setStage('confirmed');
      } catch {
        if (alive) setStage('failed');
      }
    })();
    return () => { alive = false; };
  }, [step, hash, chain.id, family]);

  const goStep2 = () => {
    setAddressError(null);
    if (!recipientOk) {
      const fam = family === 'evm' ? t('errNeedEvmAddress') : family === 'solana' ? t('errNeedSolAddress') : t('errNeedBtcAddress');
      return setAddressError(isEns && ens.status === 'resolving' ? t('errResolvingEns') : isEns ? t('errEnsNotFound') : t('errNeedAddressFull').replace('${symbol}', symbol).replace('${chain.name}', chain.name).replace('${fam}', fam));
    }
    if (poisoning) return;
    setAmountError(null);
    setStep(2);
  };
  const goStep3 = () => {
    setAmountError(null);
    if (amountRaw <= 0n) return setAmountError(t('errEnterAmount'));
    if (overBalance) return setAmountError(tw('youOwn', { balance: formatTokenAmount(balance ?? 0n, decimals), symbol, reserve: isNativeSend ? tw('feesReserved', { fee: `${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}` }) : '' }));
    // Bloquant, message déjà affiché sous le montant. Le dupliquer en rouge
    // juste sous sa version orange était le même défaut que sur mobile.
    if (notEnoughGas) return;
    setSendError(null);
    setStep(3);
  };

  const paste = async () => {
    try {
      const cleaned = cleanAddressInput(await Clipboard.getStringAsync());
      if (cleaned) { setTo(cleaned); setAddressError(null); }
    } catch {
      // Presse-papiers refusé par le navigateur : l'utilisateur peut taper l'adresse.
    }
  };

  const back = () => {
    setAddressError(null); setAmountError(null);
    if (step === 0 || step === 4) return onClose();
    if (step === 1) { setPicked(null); setTo(''); }
    setStep((s) => (s - 1) as Step);
  };

  const destLabel = contactName ?? (isEns ? to.trim() : null);
  const afterBalance = balance != null ? balance - amountRaw - (isNativeSend ? feeRaw : 0n) : null;
  const explorerTx = hash && chain.explorerUrl ? `${chain.explorerUrl}/tx/${hash}` : null;

  // Étape 0 : vérifiés uniquement (main + petits soldes), jamais les « masqués » (spam).
  const { main, small } = splitHoldings(pf.holdings);
  const q = search.trim().toLowerCase();
  const list = [...main, ...small].filter((h) => {
    const c = chainOf(h.chainId);
    return h.raw > 0n && !!c && !!c.testnet === showTestnets && !!addressForChain(accounts, h.chainId) &&
      (!q || h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  });

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, zIndex: 20 }}>
      {/* En-tête + barre de progression */}
      <View style={{ paddingHorizontal: SCREEN_MARGIN }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <IconButton icon="back" label={t('back')} tone="ghost" onPress={back} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Text variant="title2">{step === 0 ? t('aiSend') : step === 4 ? t('headerTracking') : (t('headerSendToken').replace('${symbol}', symbol) + (chain.testnet ? ` (${chain.name})` : ''))}</Text>
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

      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: space[6], gap: space[5], flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* ── 0. Quoi envoyer (agrégé multi-chaîne) ── */}
        {step === 0 ? (
          <>
            <Input placeholder={tw('searchAssetPlaceholder')} value={search} onChangeText={setSearch} autoCapitalize="none" />
            {pf.loading && pf.holdings.length === 0 ? (
              <Surface padded={false}>{[0, 1, 2].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center', gap: space[2] }}><Skeleton width="55%" /><Skeleton width="30%" height={12} /></View>)}</Surface>
            ) : list.length === 0 ? (
              <Surface><EmptyState icon="send" title={q ? t('emptySearchTitle') : t('emptySendTitle')} body={q ? undefined : t('emptySendBody')} actionLabel={q ? undefined : t('receive')} onAction={q ? undefined : onReceive} /></Surface>
            ) : (
              <Surface padded={false}>
                {list.map((h, i) => (
                  <React.Fragment key={h.id}>
                    <TokenRow
                      symbol={h.symbol}
                      name={`${h.symbol} sur ${chainOf(h.chainId)?.name ?? h.chainId}`}
                      logo={h.kind === 'native' ? chainIconUrl(h.chainId) : h.logo}
                      address={h.contract ?? h.chainId}
                      balance={`${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`}
                      fiat={h.price > 0 ? `${formatFiat(h.fiat)} ${sym}` : undefined}
                      onPress={() => { setPicked(h); setAmount(''); setTo(''); setAddressError(null); setAmountError(null); setStep(1); }}
                    />
                    {i < list.length - 1 ? <Divider inset={68} /> : null}
                  </React.Fragment>
                ))}
              </Surface>
            )}
          </>
        ) : null}

        {/* ── 1. Destinataire ── */}
        {step === 1 ? (
          <>
            <Surface level={2} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3] }}>
              {recipientOk ? <AddressGlyph address={recipient} size={40} /> : <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon name="profile" size={18} tone="faint" /></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" tone="secondary">{t('labelTo')}</Text>
                {recipientOk ? (
                  <>
                    <Text variant="body" numberOfLines={1}>{contactName ?? (isEns ? to.trim() : t('unknownAddress'))}</Text>
                    <Text variant="caption" tone="secondary" numberOfLines={2}>{groupAddress(recipient)}</Text>
                  </>
                ) : (
                  // Sur web on a un clavier : saisie directe en plus de Coller/Contacts.
                  <TextInput
                    value={to}
                    onChangeText={(v) => { setTo(v); setAddressError(null); }}
                    placeholder={t('placeholderAddress')}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[typography.body, { paddingVertical: space[1] }]}
                  />
                )}
              </View>
              {to ? <IconButton icon="close" label={t('keypadErase')} tone="ghost" onPress={() => setTo('')} /> : null}
            </Surface>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Chip label={t('chipPaste')} icon="copy" onPress={paste} />
              {contacts.length ? <Chip label={t('chipContacts')} icon="contacts" selected={showContacts} onPress={() => setShowContacts((v) => !v)} /> : null}
            </View>
            {showContacts && contacts.length ? (
              <Surface padded={false}>
                {contacts.slice(0, 8).map((c, i) => (
                  <React.Fragment key={c.id}>
                    <ListRow left={<AddressGlyph address={c.address} size={36} />} title={c.name} subtitle={groupAddress(c.address)} onPress={() => { setTo(c.address); setShowContacts(false); }} />
                    {i < Math.min(contacts.length, 8) - 1 ? <Divider inset={64} /> : null}
                  </React.Fragment>
                ))}
              </Surface>
            ) : null}
            {isEns && ens.status === 'resolving' ? <Text variant="caption" tone="secondary">{t('resolvingEns')}</Text> : null}

            {poisoning ? (
              <Surface style={{ borderColor: colors.danger, gap: space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Icon name="alert" size={18} color={colors.danger} /><Text variant="body" tone="danger">{t('suspiciousAddressTitle')}</Text></View>
                <Text variant="bodySecondary" tone="secondary">{t('suspiciousAddressBody')}</Text>
                <View style={{ flexDirection: 'row', gap: space[2] }}><AddressGlyph address={poisoning.lookalike} size={28} /><Text variant="caption" tone="secondary" style={{ flex: 1 }}>{groupAddress(poisoning.lookalike)}</Text></View>
                <View style={{ flexDirection: 'row', gap: space[2] }}><AddressGlyph address={recipient} size={28} /><Text variant="caption" tone="danger" style={{ flex: 1 }}>{groupAddress(recipient)}</Text></View>
              </Surface>
            ) : recipientOk && !isKnown ? (
              <Surface style={{ borderColor: colors.warning, gap: space[1] }}>
                <Text variant="body" tone="warning">{t('neverSentWarning')}</Text>
                <Text variant="bodySecondary" tone="secondary">{t('checkEndWarning')}<Text variant="body">…{recipient.slice(-4)}</Text></Text>
              </Surface>
            ) : null}
            {isContract ? <Text variant="caption" tone="warning">{t('contractAddressWarning')}</Text> : null}
            {contactName ? <Text variant="caption" tone="secondary">{t('contactLabel').replace('${contactName}', contactName)}</Text> : null}

            {recents.length > 0 ? (
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">{t('recents')}</Text>
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
            {addressError ? <Text variant="caption" tone="danger">{addressError}</Text> : null}
            <View style={{ flex: 1 }} />
            <Button label={t('actionContinue')} onPress={goStep2} disabled={!recipientOk || !!poisoning} />
          </>
        ) : null}

        {/* ── 2. Montant ── */}
        {step === 2 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <AddressGlyph address={recipient} size={28} />
              <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>{t('labelTo')}{destLabel ?? shortAddress(recipient)}</Text>
            </View>
            <RNPressable onPress={() => price > 0 && setInFiat((v) => !v)} accessibilityLabel={t('a11yToggleCurrency')} style={{ paddingVertical: space[4] }}>
              <Text variant="balance" tabular numberOfLines={1} adjustsFontSizeToFit tone={overBalance ? 'danger' : 'primary'}>
                {amount || '0'} <Text variant="title2" tone="secondary">{inFiat ? sym : symbol}</Text>
              </Text>
              <Text variant="caption" tone="secondary" tabular>
                {price > 0 ? (inFiat ? `≈ ${tokenAmountStr || '0'} ${symbol}` : `≈ ${formatFiat(fiatOfAmount)} ${sym}`) : ' '}{price > 0 ? '  ⇅' : ''}
              </Text>
            </RNPressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {balance == null ? <Skeleton width={160} /> : <Text variant="caption" tone="secondary" tabular>{t('balanceLabel')} : {formatTokenAmount(balance, decimals)} {symbol}</Text>}
              <Chip label={t('chipMax')} onPress={setMax} />
            </View>
            {notEnoughGas ? <Text variant="caption" tone="danger">{t('notEnoughGasForFee').replace('{symbol}', chain.nativeSymbol).replace('{details}', missingFeeText)}</Text> : null}
            {amountError && hasEnteredAmount ? <Text variant="caption" tone="danger">{amountError}</Text> : null}
            <View style={{ flex: 1 }} />
            <AmountKeypad value={amount} onChange={(v) => { setAmount(v); setAmountError(null); }} maxDecimals={inFiat ? 2 : Math.min(decimals, 8)} />
            <Button label={t('verify')} onPress={goStep3} disabled={amountRaw <= 0n} />
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
                  <Text variant="caption" tone="secondary">{t('towards')} {destLabel ?? shortAddress(recipient)} · {chain.name}</Text>
                </View>
              </View>
              <Divider />
              {hash ? (
                <>
                  <TxSteps stage={stage} />
                  {stage === 'failed' ? <Text variant="caption" tone="danger">{t('txFailedMsg')}</Text> : null}
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                  <KalyxSpinner size={24} />
                  <Text variant="bodySecondary" tone="secondary" style={{ flex: 1 }}>
                    {family === 'solana' ? tw('awaitSolana') : tw('awaitPhoneSign')}
                  </Text>
                </View>
              )}
            </Surface>
            {hash ? <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t('canLeaveScreenInfo')}</Text> : null}
            {explorerTx ? <Button label={t('trackTransaction')} variant="secondary" size="md" onPress={() => { const w = (globalThis as { open?: (u: string, target?: string, features?: string) => unknown }).open; w?.(explorerTx, '_blank', 'noopener,noreferrer'); }} /> : null}
            <View style={{ flex: 1 }} />
            {hash ? <Button label={t('actionDone')} onPress={onClose} /> : null}
          </>
        ) : null}
      </ScrollView>

      {/* ── 3. Récapitulatif (sheet) ── */}
      <Sheet visible={step === 3 && !confirming} onClose={() => setStep(2)}>
        <Text variant="title2">{t('verifyBeforeSendTitle')}</Text>
        <Surface padded={false}>
          <ListRow left={<AddressGlyph address={recipient} size={40} />} title={destLabel ?? t('labelRecipient')} subtitle={groupAddress(recipient)} />
          <Divider inset={68} />
          <ListRow title={t('txLabelAmount')} right={<View style={{ alignItems: 'flex-end' }}><Text variant="body" tabular>{formatTokenAmount(amountRaw, decimals)} {symbol}</Text>{price > 0 ? <Text variant="caption" tone="secondary" tabular>≈ {formatFiat(fiatOfAmount)} {sym}</Text> : null}</View>} />
          <Divider inset={16} />
          <ListRow title={t('labelNetwork')} right={<Text variant="body">{chain.name}</Text>} />
          <Divider inset={16} />
          <ListRow title={t('labelNetworkFee')} subtitle={`${tw('feeEstimate')} · ${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}`} right={<Text variant="body" tabular>{nativePrice > 0 ? `environ ${formatFiat(feeFiat)} ${sym}` : '—'}</Text>} />
        </Surface>
        {afterBalance != null ? (
          <Text variant="bodySecondary" tone="secondary">{t('balanceUpdatePreview').replace('${symbol}', symbol).replace('${formatTokenAmount(balance!, decimals)}', formatTokenAmount(balance!, decimals)).replace('${formatTokenAmount(afterBalance < 0n ? 0n : afterBalance, decimals)}', formatTokenAmount(afterBalance < 0n ? 0n : afterBalance, decimals))}</Text>
        ) : null}
        {family === 'evm' ? <Text variant="caption" tone="warning">{t('checkNetworkWarning').replace('${chain.name}', chain.name)}</Text> : null}
        {!isKnown ? <Text variant="caption" tone="warning">{t('firstTimeWarning').replace('${recipient.slice(-4)}', recipient.slice(-4))}</Text> : null}
        <AntiDrainerBanner loading={isSimulating} simulation={simResult} />
        {simResult?.warningLevel === 'critical' ? (
          <RNPressable onPress={() => setForceSendChecked((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[1] }}>
            <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: forceSendChecked ? colors.danger : colors.border, backgroundColor: forceSendChecked ? colors.danger : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {forceSendChecked ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
            </View>
            <Text variant="caption" tone="danger" style={{ flex: 1 }}>{t('antiDrainerForceSendConfirm')}</Text>
          </RNPressable>
        ) : null}
        {sendError ? <Text variant="caption" tone="danger">{sendError}</Text> : null}
        <Text variant="caption" tone="tertiary">{tw('signOnPhoneNote')}</Text>
        <HoldButton
          label={t('holdToSend')}
          onComplete={perform}
          disabled={isSimulating || (simResult?.warningLevel === 'critical' && !forceSendChecked)}
          danger={simResult?.warningLevel === 'critical'}
        />
      </Sheet>
    </View>
  );
}
