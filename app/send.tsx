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
import { withWatchOnlyGate } from '../ui/WatchOnlyGate';
import { fill } from '../lib/i18n';
import { usePaidAddresses } from '../lib/historySpam';
import { sameAddress } from '../lib/txAuditProbe';
import { holdingLabel } from '../lib/holdingLabel';
import { SendResult } from '../ui/SendResult';
import { RecipientFacts } from '../ui/RecipientFacts';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { holdingIcon } from '../ui/kit/useFallbackLogo';
import { KeyboardAvoid } from '../ui/KeyboardAvoid';
import { friendlyTxError } from '../lib/txError';

/** Refus de la préparation qui sont CERTAINS : affichés sous le montant, avant le code. */
const PRECHECK_BLOCKING = new Set(['SOL_RENT_SENDER', 'SOL_RENT_RECIPIENT', 'INSUFFICIENT_FUNDS', 'AMOUNT_TOO_SMALL', 'INSUFFICIENT_GAS', 'MEMO_REQUIRED', 'INVALID_ADDRESS', 'INVALID_AMOUNT']);
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { LogoImage, Text, Button, IconButton, Surface, Divider, ListRow, TokenRow, AddressGlyph, AmountKeypad, StepBar, HoldRing, TxSteps, Chip, Skeleton, Input, EmptyState, SegmentedControl, type TxStage, Pressable as KPressable } from '../ui/kit';
import { Icon } from '../ui/icon';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { ContactPicker } from '../ui/ContactPicker';
import { FadeInUp } from '../ui/FadeInUp';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { useRecentRecipients, type RecipientFamily } from '../lib/recentRecipientsStore';
import { useContacts } from '../lib/contactsStore';
import { usePortfolioStore, splitHoldings, type Holding } from '../lib/portfolio';
import { notifyAndLog } from '../lib/notificationCenter';
import { technicalLogger } from '../lib/technicalLogger';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';
import {
  getAdapter, hasChain, isWalletError, isValidEvmAddress, isValidSolanaAddress, isWalletAddress, isValidBtcAddress, parseAmount, formatTokenAmount, formatInputAmount,
  formatAmount, formatFiat, getCustomTokens, looksLikeEnsName, resolveEnsName, detectPoisoning, groupAddress, shortAddress,
  estimateGasReserve, getPrices, getTokenPrices, chainIconUrl, EvmChainAdapter, SolanaChainAdapter, TonAdapterV2, JETTON_TRANSFER_TON, normalizeTonDomain,
  findAdapterV2, getAdapterV2, isValidTonAddress, transferFeeFor, amountAfterTransferFee,
  type FeeOptions, type FeeSpeed, type FeeQuotes, type TransferFeeConfig,
  simulateSendTransaction, type SimulationResult,
} from '../src';
import { addressForChain } from '../lib/accountAddress';
import { useHistoryStore } from '../lib/historyStore';
import { AntiDrainerBanner } from '../src/components/security/AntiDrainerBanner';

type Step = 0 | 1 | 2 | 3 | 4;

function SendInner() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const fiat = useSettings((s) => s.fiat);
  const showTestnets = useSettings((s) => s.showTestnets);
  const sym = fiatSymbol(fiat);
  const wallet = useWallet();
  const { account, activeChain, accounts } = wallet;
  const params = useLocalSearchParams<{ to?: string; amount?: string; contract?: string; mint?: string; jetton?: string; exp?: string; symbol?: string; decimals?: string; chain?: string; references?: string; memo?: string; payee?: string; note?: string }>();
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const pf = usePortfolioStore();

  // « Quoi envoyer » (étape 0) : depuis l'accueil, on choisit le TOKEN et la chaîne
  // en découle. Depuis la page d'un token (params), on saute cette étape.
  const presetToken = !!(params.contract || params.mint || params.jetton || params.chain);
  /**
   * Demande de paiement complète : destinataire ET montant fournis par le lien.
   *
   * Dans ce cas l'utilisateur n'a rien à ressaisir, et surtout il ne doit PAS
   * repasser par l'étape « quoi envoyer » — elle appelle `setAmount('')` et
   * effaçait donc le montant que le lien venait de fournir. On part de l'étape
   * du montant, et un effet fait avancer au récapitulatif par la VALIDATION
   * habituelle : la sauter laisserait passer un montant supérieur au solde ou
   * des frais impayables.
   */
  const isPrefilledPayment = !!(params.to && params.amount);
  /** Détails annoncés par le lien de paiement, pour le récapitulatif. */
  const payeeLabel = params.payee ? String(params.payee) : null;
  const noteLabel = params.note ? String(params.note) : null;
  const memoLabel = params.memo ? String(params.memo) : null;
  const [step, setStep] = useState<Step>(isPrefilledPayment ? 2 : presetToken ? 1 : 0);
  const [picked, setPicked] = useState<Holding | null>(null);
  const [search, setSearch] = useState('');
  const [environment, setEnvironment] = useState<'mainnet' | 'testnet'>('mainnet');

  const targetChainId = picked?.chainId ?? (params.chain && hasChain(String(params.chain)) ? String(params.chain) : activeChain);
  const chain = getAdapter(targetChainId).config;
  const family: RecipientFamily = chain.family;

  useEffect(() => {
    if (targetChainId !== activeChain) {
      setActiveChain(targetChainId);
    }
  }, [targetChainId, activeChain, setActiveChain]);

  const activeSt = accounts.find((a) => a.index === wallet.activeAccountIndex) ?? accounts[0];
  // La fonction unique : sans elle, un envoi TON serait parti de l'adresse EVM.
  const senderAddress = useMemo(() => addressForChain(activeSt, chain), [activeSt, chain]);

  const recents = useRecentRecipients((s) => s.recents).filter((r) => r.family === family);
  const addRecent = useRecentRecipients((s) => s.add);
  const contacts = useContacts((s) => s.contacts);

  const decimalsParam = params.decimals != null ? Number(params.decimals) : chain.nativeDecimals;
  const token = picked
    ? picked.kind === 'erc20' ? { kind: 'erc20' as const, contract: picked.contract!, symbol: picked.symbol, decimals: picked.decimals }
      : picked.kind === 'spl' ? { kind: 'spl' as const, mint: picked.contract!, symbol: picked.symbol, decimals: picked.decimals }
      : picked.kind === 'jetton' ? { kind: 'jetton' as const, master: picked.contract!, symbol: picked.symbol, decimals: picked.decimals }
      : null
    : params.contract
      ? { kind: 'erc20' as const, contract: String(params.contract), symbol: String(params.symbol ?? 'TOKEN'), decimals: decimalsParam }
      : params.mint
        ? { kind: 'spl' as const, mint: String(params.mint), symbol: String(params.symbol ?? 'TOKEN'), decimals: decimalsParam }
        : params.jetton
          ? { kind: 'jetton' as const, master: String(params.jetton), symbol: String(params.symbol ?? 'TOKEN'), decimals: decimalsParam }
          : null;
  const symbol = token ? token.symbol : chain.nativeSymbol;
  const decimals = token ? token.decimals : chain.nativeDecimals;
  const isNativeSend = !token;

  const cleanAddressInput = (str: string): string | null => {
    const trimmed = (str ?? '').trim();
    if (
      !trimmed ||
      trimmed.includes('Exception') ||
      trimmed.includes('Error') ||
      trimmed.includes('java.') ||
      trimmed.includes('at com.') ||
      trimmed.includes('\n') ||
      trimmed.includes('\r') ||
      trimmed.length > 120
    ) {
      return null;
    }
    return trimmed;
  };

  const [to, setTo] = useState(cleanAddressInput(String(params.to ?? '')) ?? '');
  const [amount, setAmount] = useState(String(params.amount ?? ''));
  // Retour du scanner / des contacts : les params changent, on les applique.
  useEffect(() => {
    if (params.to) {
      const cleaned = cleanAddressInput(String(params.to));
      if (cleaned) setTo(cleaned);
    }
  }, [params.to]);
  useEffect(() => {
    if (params.amount) setAmount(String(params.amount));
  }, [params.amount]);
  // Étape 0 : le portefeuille agrégé doit être chargé (cache d'abord).
  useEffect(() => {
    const st = accounts.find((a) => a.index === wallet.activeAccountIndex) ?? accounts[0];
    if (!st) return;
    const a = { evmAddress: st.evmAddress, solAddress: st.solAddress, btcAddress: st.btcAddress, tonPublicKey: st.tonPublicKey, tonVersion: st.tonVersion };
    pf.hydrate(a, fiat, { includeTestnets: showTestnets }).then(() => pf.refresh(a, fiat, { includeTestnets: showTestnets, force: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.activeAccountIndex, fiat, showTestnets]);
  const [inFiat, setInFiat] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  // Vérification de l'envoi par la chaîne (sans clé) avant le récapitulatif.
  const [checking, setChecking] = useState(false);
  const [pickContact, setPickContact] = useState(false);
  /*
   * COMMENTAIRE saisi par l'utilisateur, quand la chaîne en porte un. Les
   * plateformes d'échange l'exigent pour attribuer un dépôt TON : sans champ, un
   * dépôt partait sans propriétaire. Un lien de paiement qui fixe déjà le mémo
   * garde la main — l'écran l'affiche sans le rendre modifiable.
   */
  const [comment, setComment] = useState('');
  const memoCapable = !!findAdapterV2(targetChainId)?.capabilities.memo;
  const memo = params.memo ? String(params.memo) : comment.trim() || undefined;

  // ── Adresse valide selon la famille ──
  /*
   * Une validation PAR FAMILLE, sans cas par défaut. Le ternaire précédent
   * retombait sur Bitcoin : une adresse TON aurait été jugée selon la règle
   * Bitcoin — donc refusée, ou pire, une adresse Bitcoin acceptée pour TON.
   */
  const validAddress = useCallback((a: string) => {
    switch (family) {
      case 'evm': return isValidEvmAddress(a);
      case 'solana': return isValidSolanaAddress(a);
      case 'bitcoin': return isValidBtcAddress(a);
      case 'ton': return isValidTonAddress(a, { testnet: !!chain.testnet });
    }
  }, [family, chain.testnet]);

  // ── Noms : ENS sur EVM, TON DNS (« kalyx.ton ») sur TON ──
  const tonDomain = family === 'ton' ? normalizeTonDomain(to) : null;
  const isEns = (family === 'evm' && looksLikeEnsName(to.trim())) || !!tonDomain;
  const [ens, setEns] = useState<{ status: 'idle' | 'resolving' | 'found' | 'notfound'; address: string | null }>({ status: 'idle', address: null });
  useEffect(() => {
    if (!isEns) return setEns({ status: 'idle', address: null });
    setEns({ status: 'resolving', address: null });
    const name = to.trim();
    const timer = setTimeout(() => {
      const ton = tonDomain ? findAdapterV2(targetChainId) : null;
      (ton instanceof TonAdapterV2 ? ton.resolveDomain(tonDomain!) : resolveEnsName(name))
        .then((a) => {
          const cleaned = a ? cleanAddressInput(a) : null;
          setEns(cleaned ? { status: 'found', address: cleaned } : { status: 'notfound', address: null });
        })
        .catch(() => setEns({ status: 'notfound', address: null }));
    }, 400);
    return () => clearTimeout(timer);
  }, [to, isEns, tonDomain, targetChainId]);
  const recipient = isEns ? ens.address ?? '' : to.trim();
  const recipientOk = !!recipient && validAddress(recipient);

  // ── Confiance : mes comptes + récents + contacts ──
  // Mes adresses sur CE réseau aussi (TON se calcule) : s'envoyer à soi-même n'est pas « une adresse jamais utilisée ».
  const paid = usePaidAddresses();
  const known = useMemo(() => [...accounts.flatMap((a) => [a.evmAddress, a.solAddress ?? '', a.btcAddress, addressForChain(a, chain)]).filter(Boolean), ...recents.map((r) => r.address), ...contacts.map((c) => c.address), ...paid], [accounts, recents, contacts, chain, paid]);
  const poisoning = recipientOk ? detectPoisoning(recipient, known) : null;
  // Pour l'audit IA : ce que l'appareil sait de CE destinataire exact.
  const sameAddr = (a: string) => sameAddress(a, recipient); // TON : EQ… / UQ… / 0:… sont la même adresse
  const isOwnRecipient = recipientOk && accounts.some((a) => [a.evmAddress, a.solAddress ?? '', a.btcAddress, addressForChain(a, chain)].some(sameAddr));
  const paidBefore = recipientOk && (paid.some(sameAddr) || recents.some((r) => sameAddr(r.address)));
  const isKnown = recipientOk && known.some((k) => k.toLowerCase() === recipient.toLowerCase());
  const contactName = contacts.find((c) => sameAddress(c.address, recipient))?.name;
  const [isContract, setIsContract] = useState(false);
  /** Destinataire Solana qui n'est pas une clé publique : PDA / compte de jeton. */
  const isSolanaPda = family === 'solana' && recipientOk && !isWalletAddress(recipient);
  useEffect(() => {
    setIsContract(false);
    if (!recipientOk || family !== 'evm') return;
    const a = getAdapter(targetChainId);
    if (a instanceof EvmChainAdapter) a.isContract(recipient).then(setIsContract);
  }, [recipient, recipientOk, family, targetChainId]);

  // ── Solde, prix, frais ──
  const [balance, setBalance] = useState<bigint | null>(null);
  const [nativeBal, setNativeBal] = useState<bigint | null>(null);
  const [price, setPrice] = useState(0);
  const [nativePrice, setNativePrice] = useState(0);
  const [feeOptions, setFeeOptions] = useState<FeeOptions | null>(null);
  /*
   * Frais PRÉLEVÉS PAR LE JETON (extension Token-2022). Le programme retient un
   * pourcentage à l'arrivée : sans l'afficher, on annonce « tu envoies 100 » et
   * 99,5 arrivent, et l'utilisateur en conclut que le portefeuille a perdu la
   * différence.
   */
  const [tokenFee, setTokenFee] = useState<TransferFeeConfig | null>(null);
  const [speed, setSpeed] = useState<FeeSpeed>('normal');
  const [reserve, setReserve] = useState<bigint>(0n);
  /** Jetton TON : coût RÉEL (émulé), distinct du TON joint au message qu'il faut avoir. */
  const [jettonFee, setJettonFee] = useState<bigint | null>(null);
  useEffect(() => {
    setBalance(picked?.raw ?? null);
    setPrice(picked?.price ?? 0);
    setNativeBal(picked?.kind === 'native' ? picked.raw : null);
    setNativePrice(0);
    setFeeOptions(null);
    setReserve(0n);
    setJettonFee(null);
    setAmountError(null);

    if (!senderAddress) return;
    let alive = true;
    const a = getAdapter(targetChainId);
    (async () => {
      const [nat, res, np] = await Promise.all([
        a.getBalance(senderAddress).then((b) => b.raw).catch(() => null),
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
      } else if (token.kind === 'erc20' && family === 'evm') {
        const [t] = await getCustomTokens(chain, senderAddress, [token.contract]).catch(() => [] as { raw: bigint }[]);
        const tp = chain.coingeckoPlatform ? await getTokenPrices(chain.coingeckoPlatform, [token.contract], fiat).catch(() => ({} as Record<string, number>)) : {};
        if (!alive) return;
        setBalance(t?.raw ?? 0n);
        setPrice(tp[token.contract.toLowerCase()] ?? 0);
      } else if (token.kind === 'spl' && a instanceof SolanaChainAdapter) {
        const list = await a.getSplTokens(senderAddress).catch(() => []);
        const tp = await getTokenPrices('solana', [token.mint], fiat).catch(() => ({} as Record<string, number>));
        if (!alive) return;
        setBalance(list.find((x) => x.mint === token.mint)?.raw ?? 0n);
        setPrice(tp[token.mint.toLowerCase()] ?? 0);
      } else if (token.kind === 'jetton') {
        const ton = findAdapterV2(targetChainId);
        const list = ton instanceof TonAdapterV2 ? await ton.jettons(senderAddress, fiat).catch(() => []) : [];
        if (!alive) return;
        const held = list.find((x) => x.master === token.master.toLowerCase());
        setBalance(held?.raw ?? 0n);
        setPrice(held?.verification === 'whitelist' ? held.price : 0);
        // Le message emporte ce TON pour le gaz (l'excédent revient) : il faut l'avoir.
        setReserve(JETTON_TRANSFER_TON);
        // Coût réel, émulé sur un envoi à soi-même : c'est lui qu'on affiche.
        if (ton instanceof TonAdapterV2 && held && held.raw > 0n) {
          ton.prepareSend(senderAddress, { to: senderAddress, amount: 1n, token: { id: held.master, symbol: held.symbol, decimals: held.decimals } })
            .then((d) => alive && setJettonFee(d.fee))
            .catch(() => {});
        }
      }
      /*
       * PALIERS DE FRAIS — une seule demande, quelle que soit la chaîne.
       *
       * Il y avait ici trois branches `instanceof`, et Bitcoin chiffrait sur une
       * taille SUPPOSÉE : une entrée, deux sorties. Or le coût d'une transaction
       * Bitcoin dépend du nombre d'entrées réellement retenues — annoncer le
       * prix d'une entrée quand le paiement en demandera cinq trompait de
       * 4 × 68 vB. `quoteFees` fait une vraie sélection de pièces, palier par
       * palier, et l'écran n'a plus à savoir de quelle chaîne il parle.
       */
      const v2 = findAdapterV2(targetChainId);
      if (v2?.capabilities.feeTiers && v2.quoteFees) {
        const ref = token
          ? { id: token.kind === 'spl' ? token.mint : token.kind === 'jetton' ? token.master : token.contract, symbol, decimals }
          : null;
        v2.quoteFees(senderAddress, { to: recipientOk ? recipient : senderAddress, amount: 1n, token: ref })
          .then((q: FeeQuotes) => {
            if (!alive) return;
            // `FeeOptions` attend la forme EVM : `costWei` porte le coût, les
            // deux autres champs ne servent qu'au palier EVM, qui les relit.
            const tier = (t: (typeof q)['slow']) => {
              const o = t.opaque as { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } | bigint | number;
              const evm = typeof o === 'object' && o !== null && 'maxFeePerGas' in o ? o : null;
              return {
                maxFeePerGas: evm?.maxFeePerGas ?? 0n,
                maxPriorityFeePerGas: evm?.maxPriorityFeePerGas ?? 0n,
                costWei: t.cost,
              };
            };
            setFeeOptions({ slow: tier(q.slow), normal: tier(q.normal), fast: tier(q.fast) });
          })
          .catch(() => {});
      }

      // Frais PRÉLEVÉS PAR LE JETON (Token-2022) : propre à Solana.
      if (a instanceof SolanaChainAdapter && token?.kind === 'spl') {
        a.getTransferFeeConfig(token.mint).then((c) => alive && setTokenFee(c)).catch(() => {});
      } else {
        setTokenFee(null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderAddress, targetChainId, fiat, params.contract, params.mint, params.jetton, picked?.id]);

  // Frais en natif (unité brute) : palier EVM choisi, sinon réserve dynamique.
  // Ce qu'il faut AVOIR en natif pour envoyer, et ce que l'envoi COÛTE : identiques,
  // sauf pour un jetton TON (0,05 TON joints, l'excédent revient).
  const gasRequired = feeOptions ? feeOptions[speed].costWei : reserve;
  const feeRaw = token?.kind === 'jetton' && jettonFee != null ? jettonFee : gasRequired;
  let feeFiat = 0;
  if (family === 'bitcoin') {
    const feeInBtc = Number(feeRaw) / 1e8;
    feeFiat = feeInBtc * nativePrice;
  } else if (family === 'solana') {
    const feeInSol = Number(feeRaw) / 1e9;
    feeFiat = feeInSol * nativePrice;
  } else {
    feeFiat = Number(formatAmount(feeRaw, chain.nativeDecimals)) * nativePrice;
  }

  // ── Montant ──
  const amountNum = Number(amount) || 0;
  const tokenAmountStr = inFiat ? (price > 0 ? (amountNum / price).toFixed(Math.min(decimals, 8)).replace(/\.?0+$/, '') : '0') : amount;
  let amountRaw = 0n;
  try {
    amountRaw = tokenAmountStr ? parseAmount(tokenAmountStr, decimals).raw : 0n;
  } catch {
    amountRaw = 0n;
  }
  // Prélèvement du jeton sur CE montant (0 si le mint n'en a pas). Calculé ici,
  // après `amountRaw` : il dépend du montant, pas seulement du jeton.
  const transferFeeRaw = transferFeeFor(amountRaw, tokenFee);
  const fiatOfAmount = inFiat ? amountNum : amountNum * price;
  const available = balance != null ? (isNativeSend ? (balance > feeRaw ? balance - feeRaw : 0n) : balance) : 0n;
  const overBalance = balance != null && amountRaw > available;
  const hasEnteredAmount = parseFloat(amount || '0') > 0;
  const notEnoughGas = hasEnteredAmount && nativeBal != null && nativeBal < gasRequired;
  const approxVal = feeFiat > 0 ? `${formatFiat(feeFiat)} ${sym}` : `${formatAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}`;
  const missingFeeText = t('aboutApprox').replace('{amount}', gasRequired === feeRaw ? approxVal : `${formatAmount(gasRequired, chain.nativeDecimals)} ${chain.nativeSymbol}`);

  /*
   * BITCOIN : les frais dépendent des pièces retenues, donc du MONTANT. Le devis
   * plus haut part d'un montant fictif (1 sat, une seule entrée) ; sans ce
   * recalcul, le récapitulatif annonçait moins de frais que l'envoi réel n'en
   * prélevait dès que le paiement demandait plusieurs pièces.
   */
  useEffect(() => {
    if (family !== 'bitcoin' || !recipientOk || amountRaw <= 0n) return;
    const v2 = findAdapterV2(targetChainId);
    if (!v2?.quoteFees) return;
    let alive = true;
    const timer = setTimeout(() => {
      v2.quoteFees!(senderAddress, { to: recipient, amount: amountRaw, token: null })
        .then((q: FeeQuotes) => {
          if (!alive) return;
          const tier = (x: (typeof q)['slow']) => ({ maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, costWei: x.cost });
          setFeeOptions({ slow: tier(q.slow), normal: tier(q.normal), fast: tier(q.fast) });
        })
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [family, recipientOk, recipient, amountRaw, targetChainId, senderAddress]);

  const setMax = async () => {
    haptic.light();
    setAmountError(null);
    // Bitcoin : le vrai maximum paie les frais de TOUTES les pièces dépensées.
    const btc = family === 'bitcoin' && !token ? (findAdapterV2(targetChainId) as { maxSendable?: (f: string, to: string, sp: FeeSpeed) => Promise<{ amount: bigint }> } | undefined) : undefined;
    if (btc?.maxSendable) {
      const m = await btc.maxSendable(senderAddress, recipientOk ? recipient : senderAddress, speed).catch(() => null);
      if (m) {
        setInFiat(false);
        setAmount(m.amount > 0n ? formatInputAmount(m.amount, decimals) : '0');
        return;
      }
    }
    if (balance != null && balance > 0n && available === 0n) {
      setAmount('0');
      // Aucun message rouge affiché si le montant est à 0
    } else {
      setInFiat(false);
      setAmount(formatInputAmount(available, decimals));
    }
  };

  // ── Étape 3 → 4 ──
  const [confirming, setConfirming] = useState(false);
  const [stage, setStage] = useState<TxStage>('sent');
  const [hash, setHash] = useState<string | null>(null);

  // ── Anti-Drainer simulation ──
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [forceSendChecked, setForceSendChecked] = useState<boolean>(false);

  useEffect(() => {
    if (step !== 3 || !recipient) {
      setSimResult(null);
      setIsSimulating(false);
      setForceSendChecked(false);
      return;
    }

    let alive = true;
    setIsSimulating(true);
    setForceSendChecked(false);

    const adapter = getAdapter(targetChainId);
    const evmProvider = adapter instanceof EvmChainAdapter ? adapter : undefined;
    const chainIdNum = chain.evmChainId ?? (typeof chain.id === 'string' && !isNaN(Number(chain.id)) ? Number(chain.id) : undefined);

    simulateSendTransaction({
      family: family as 'evm' | 'solana' | 'bitcoin',
      from: senderAddress,
      to: recipient,
      amount: amountRaw,
      tokenSymbol: symbol,
      tokenDecimals: decimals,
      provider: evmProvider,
      chainId: chainIdNum,
    })
      .then((res) => {
        if (alive) {
          setSimResult(res);
          setIsSimulating(false);
        }
      })
      .catch((err) => {
        technicalLogger.logTx('step_3_simulation_error', { error: String(err) }, true);
        if (alive) {
          setIsSimulating(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [step, recipient, amountRaw, symbol, decimals, family, senderAddress, targetChainId, chain.evmChainId, chain.id]);

  const perform = async (unlock: Unlock) => {
    technicalLogger.logTx('step_3_signing_start', {
      symbol,
      amount: tokenAmountStr,
      recipient,
      chain: chain.name,
      speed,
    });
    try {
      // `speed` accompagne toujours le palier : Bitcoin n'a pas de « prix du
      // gaz », c'est le palier lui-même que l'adapter traduit en sat/vB.
      /*
       * Les champs de frais sont OMIS quand les paliers ne sont pas chargés,
       * jamais mis à zéro : `prepareSend` fait `gas?.maxFeePerGas ?? réseau`, et
       * `0n` n'est pas nullish — il écraserait les frais du réseau par zéro,
       * donc une transaction refusée. Sans palier, l'adapter prend ceux du
       * réseau côté EVM et le palier « normal » côté Bitcoin.
       */
      /*
       * Repères et mémo de Solana Pay, venus du QR ou du lien profond. Ils ne
       * changent rien au transfert mais sans eux le marchand ne retrouve jamais
       * la transaction — son terminal reste sur « en attente ».
       */
      const payExtras = {
        references: params.references ? String(params.references).split(',').filter(Boolean) : undefined,
        memo,
        // Échéance d'une facture TON Pay : inscrite dans le message, refusée par la chaîne au-delà.
        expiresAt: params.exp ? Number(params.exp) : undefined,
      };
      const gas = {
        ...(feeOptions
          ? {
              maxFeePerGas: feeOptions[speed].maxFeePerGas,
              maxPriorityFeePerGas: feeOptions[speed].maxPriorityFeePerGas,
            }
          : {}),
        speed,
        ...payExtras,
      };
      /*
       * Le coffre envoie sur le réseau ACTIF ; l'écran affiche `targetChainId`.
       * Ils sont alignés par un effet — s'ils ne l'étaient pas (bascule refusée,
       * course), un envoi « sur Base » partirait sur Ethereum avec la même
       * adresse. On refuse plutôt que de deviner.
       */
      if (useWallet.getState().activeChain !== targetChainId) throw new Error(t('errNetworkMismatch'));
      const h =
        token?.kind === 'jetton' ? await wallet.sendJetton(recipient, tokenAmountStr, { master: token.master, decimals: token.decimals }, unlock, { memo, expiresAt: payExtras.expiresAt })
        : token?.kind === 'spl' ? await wallet.sendSolToken(recipient, tokenAmountStr, { mint: token.mint, decimals: token.decimals }, unlock, payExtras)
        : token?.kind === 'erc20' ? await wallet.sendToken(recipient, tokenAmountStr, { contract: token.contract, decimals: token.decimals }, unlock, gas)
        : await wallet.signAndSend(recipient, tokenAmountStr, unlock, gas);
      setHash(h);
      setStage('sent');
      // Les soldes et l'activité affichés ne sont plus justes : le prochain écran les redemande.
      pf.invalidate();
      if (senderAddress) useHistoryStore.getState().markStale(chain.id, senderAddress);
      technicalLogger.logTx('step_4_broadcast_success', { txHash: h, symbol, chain: chain.name });
      addRecent(recipient, family);
      const dest = contactName ?? (isEns ? to.trim() : shortAddress(recipient));
      notifyAndLog('tx', t("sendTitle"), fill(t('sendSuccessMsg'), { amount: formatTokenAmount(amountRaw, decimals), symbol: symbol, dest: dest }));
      haptic.success();
    } catch (e) {
      technicalLogger.logTx('step_4_broadcast_failed', { error: e instanceof Error ? e.message : String(e), chain: chain.name }, true);
      /*
       * L'ERREUR D'ORIGINE, relayée telle quelle : c'est ConfirmUnlock qui la
       * traduit (avec la langue). La traduire ici puis relancer une Error nue
       * la faisait retraduire à partir de sa phrase — qui ne correspondait plus
       * à rien : « Transaction échouée. Réessaie » à chaque fois, le vrai motif
       * perdu (loyer Solana, solde, mémo…).
       */
      throw e;
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
        } else if (chain.family === 'ton') {
          /*
           * TON : l'adaptateur retrouve la transaction par le hachage normalisé
           * du message et lit ses phases — pas de « diffusé donc réussi ». Un
           * envoi sauté faute de fonds, ou expiré, est un échec.
           */
          const st = await getAdapterV2(activeChain).waitForTx(hash);
          if (st.status !== 'confirmed') throw new Error(st.status === 'failed' ? st.reason ?? 'failed' : st.status);
        } else {
          return; // Bitcoin : pas de suivi in-app (v1)
        }
        if (alive) {
          setStage('confirmed');
          technicalLogger.logTx('step_4_confirmed', { txHash: hash, chain: chain.name });
          haptic.success();
          notifyAndLog('tx', t("sendConfirmTitle"), fill(t('confirmSuccessMsg'), { amount: formatTokenAmount(amountRaw, decimals), symbol: symbol, dest: contactName ?? shortAddress(recipient) }));
        }
      } catch (err) {
        technicalLogger.logTx('step_4_confirmation_failed', { txHash: hash, error: String(err), chain: chain.name }, true);
        if (alive) setStage('failed');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hash]);

  const goStep2 = () => {
    setAddressError(null);
    if (!recipientOk) {
      technicalLogger.logTx('step_1_address_invalid', { input: to, isEns, chain: chain.name }, true);
      const fam = family === 'evm' ? t("errNeedEvmAddress") : family === 'solana' ? t("errNeedSolAddress") : family === 'ton' ? t("errNeedTonAddress") : t("errNeedBtcAddress");
      return setAddressError(isEns && ens.status === 'resolving' ? t(tonDomain ? 'resolvingName' : 'errResolvingEns') : isEns ? t(tonDomain ? 'errNameNotFound' : 'errEnsNotFound') : fill(t('errNeedAddressFull'), { symbol: symbol, chain: chain.name, fam: fam }));
    }
    if (poisoning) {
      technicalLogger.logTx('step_1_address_poisoning_blocked', { recipient, chain: chain.name }, true);
      return; // bloquant, message déjà affiché
    }
    technicalLogger.logTx('step_1_address_validated', { recipient, isEns, chain: chain.name });
    haptic.light();
    setAmountError(null);
    setStep(2);
  };
  const goStep3 = async () => {
    setAmountError(null);
    if (amountRaw <= 0n) return setAmountError(t("errEnterAmount"));
    if (overBalance) {
      const held = `${formatTokenAmount(balance ?? 0n, decimals)} ${symbol}`;
      return setAmountError(isNativeSend ? t('sendOverBalanceFee').replace('{amount}', held).replace('{fee}', `${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}`) : t('sendOverBalance').replace('{amount}', held));
    }
    if (notEnoughGas) {
      technicalLogger.logTx('step_2_not_enough_gas', { chain: chain.name, feeRaw: feeRaw.toString() }, true);
      return; // bloquant, message déjà affiché — même convention que l'empoisonnement
    }
    technicalLogger.logTx('step_2_fee_simulation', {
      amount: tokenAmountStr,
      symbol,
      feeRaw: feeRaw.toString(),
      available: available.toString(),
      chain: chain.name,
    });
    try {
      if (isNativeSend) getAdapter(targetChainId).buildTransfer({ to: recipient, amount: tokenAmountStr });
    } catch (e) {
      technicalLogger.logTx('step_2_buildTransfer_failed', { error: isWalletError(e) ? e.message : String(e), chain: chain.name }, true);
      /*
       * L'ADRESSE, PAS LE MONTANT. Un lien de paiement saute l'étape du
       * destinataire : une adresse au checksum faux arrivait jusqu'ici, et
       * l'écran disait « Montant invalide » — l'utilisateur corrigeait un
       * montant juste. On le ramène au destinataire avec la vraie raison.
       */
      if (isWalletError(e) && e.code === 'INVALID_ADDRESS') {
        setStep(1);
        setAddressError(t('errInvalidAddress'));
        return;
      }
      return setAmountError(isWalletError(e) && /décimales/.test(e.message) ? t('errTooManyDecimals').replace('{max}', String(decimals)) : t("errInvalidAmount"));
    }
    /*
     * LA CHAÎNE EST CONSULTÉE ICI, AVANT LE CODE. Les refus certains — loyer
     * minimal Solana, solde Bitcoin insuffisant une fois les pièces choisies,
     * montant sous le seuil de poussière, commentaire exigé — n'arrivaient
     * qu'APRÈS le PIN et ses secondes de déchiffrement : on tapait son code pour
     * apprendre qu'il fallait changer le montant, encore et encore. La
     * préparation ne demande aucune clé : on la fait maintenant, et le message
     * chiffré s'affiche sous le montant. Un réseau muet ne bloque rien : la
     * vérification se refera à l'envoi.
     */
    const v2 = isNativeSend && (family === 'solana' || family === 'bitcoin' || family === 'ton') ? findAdapterV2(targetChainId) : undefined;
    if (v2?.prepareSend) {
      setChecking(true);
      try {
        const draft = await v2.prepareSend(senderAddress, { to: recipient, amount: amountRaw, token: null, speed, memo });
        if (draft.warnings.some((w) => w.code === 'MEMO_REQUIRED')) return setAmountError(t('errMemoRequired'));
      } catch (e) {
        if (isWalletError(e) && PRECHECK_BLOCKING.has(e.code)) {
          technicalLogger.logTx('step_2_precheck_refused', { code: e.code, chain: chain.name }, true);
          return setAmountError(friendlyTxError(e, t));
        }
        // Réseau indisponible ou erreur inattendue : on laisse l'envoi trancher.
      } finally {
        setChecking(false);
      }
    }
    haptic.light();
    setStep(3);
  };

  /*
   * Avance automatiquement au récapitulatif quand le lien a tout fourni.
   *
   * On attend le SOLDE, sans quoi la validation refuserait un montant
   * parfaitement payable. Et on passe par `goStep3`, donc par les mêmes
   * contrôles que la saisie manuelle : si le montant dépasse le solde ou si les
   * frais sont impayables, l'utilisateur reste sur l'étape du montant avec
   * l'erreur affichée et le montant prérempli — ce qui est précisément
   * l'information utile.
   */
  const autoAdvanced = useRef(false);
  useEffect(() => {
    if (!isPrefilledPayment || autoAdvanced.current) return;
    if (step !== 2 || balance == null || amountRaw <= 0n) return;
    // Pour un envoi de la pièce native, on attend aussi les frais : les juger
    // avant leur chargement produirait une erreur qui disparaîtrait ensuite.
    if (isNativeSend && !feeOptions) return;
    autoAdvanced.current = true;
    void goStep3();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrefilledPayment, step, balance, amountRaw, isNativeSend, feeOptions]);

  const paste = async () => {
    try {
      const c = (await Clipboard.getStringAsync()).trim();
      const cleaned = cleanAddressInput(c);
      if (cleaned) {
        setTo(cleaned);
        setAddressError(null);
        haptic.light();
      }
    } catch {
      // silencieux
    }
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
          <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => { setAddressError(null); setAmountError(null); (step === 0 || step === 4 || (step === 1 && presetToken) ? router.back() : setStep((s) => (s - 1) as Step)); }} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            {/* Le titre rétrécit (une ligne) : long (« Vérifie avant d'envoyer »), il poussait la pastille du réseau sur le compteur d'étapes. */}
            <Text variant="title2" numberOfLines={1} style={{ flexShrink: 1 }}>{step === 0 ? t("aiSend") : step === 4 ? t("headerTracking") : step === 3 ? t("verifyBeforeSendTitle") : (fill(t('headerSendToken'), { symbol: symbol }) + (chain.testnet ? ` (${chain.name})` : ''))}</Text>
            {step > 0 && chainIconUrl(chain.id) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: colors.surface2, flexShrink: 0 }}>
                <LogoImage uri={chainIconUrl(chain.id)!} size={14} />
                <Text variant="micro" tone="secondary">{chain.name}</Text>
              </View>
            ) : null}
          </View>
          {step > 0 ? <Text variant="caption" tone="tertiary">{step}/4</Text> : null}
        </View>
        {step > 0 ? <StepBar step={step} total={4} /> : null}
      </View>

      {/* Le clavier ne recouvre plus l'adresse, le montant, le mémo ni « Continuer » (Android bord à bord). */}
      <KeyboardAvoid style={{ flex: 1 }}>
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
                        name={holdingLabel(h.symbol, getAdapter(h.chainId).config.name, [h.name])}
                        {...(() => {
                          const ic = holdingIcon(h, getAdapter(h.chainId).config, chainIconUrl(h.chainId));
                          return { logo: ic.logo, chainBadge: ic.badge };
                        })()}
                        chainId={h.chainId}
                        address={h.contract ?? h.chainId}
                        balance={`${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`}
                        fiat={h.price > 0 ? `${formatFiat(h.fiat)} ${sym}` : undefined}
                        onPress={() => {
                          haptic.light();
                          setPicked(h);
                          setActiveChain(h.chainId);
                          setAmount('');
                          setAddressError(null);
                          setAmountError(null);
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

        {/*
          CHAQUE ÉTAPE ENTRE EN FONDU. Les étapes s'échangeaient instantanément :
          le contenu changeait du tout au tout sans que rien ne relie l'avant à
          l'après, et c'est ce qui donnait cette sécheresse. `flex: 1` sur
          l'enrobage est obligatoire — l'espaceur qui pousse le bouton en bas
          d'écran s'écraserait sinon, et l'animation changerait la mise en page.
        */}
        {/* ── 1. Destinataire ── */}
        {step === 1 ? (
          <FadeInUp style={{ flex: 1, gap: space[5] }}>
            <Surface level={2} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3] }}>
              {recipientOk ? <AddressGlyph address={recipient} size={40} /> : <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon name="profile" size={18} tone="faint" /></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" tone="secondary">{t("labelTo")}</Text>
                <KPressable onPress={paste} accessibilityLabel={t("a11yPasteAddress")}>
                  {recipientOk ? (
                    <>
                      <Text variant="body" numberOfLines={1}>{contactName ?? (isEns ? to.trim() : t("unknownAddress"))}</Text>
                      <Text variant="caption" tone="secondary" numberOfLines={2}>{groupAddress(recipient)}</Text>
                    </>
                  ) : (
                    <Text variant="body" numberOfLines={2} tone={to ? 'primary' : 'tertiary'}>{to || t("placeholderAddress")}</Text>
                  )}
                </KPressable>
              </View>
              {to ? <IconButton icon="close" label={t("keypadErase")} tone="ghost" onPress={() => setTo('')} /> : null}
            </Surface>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Chip label={t("chipPaste")} icon="copy" onPress={paste} />
              <Chip label={t("chipScan")} icon="scan" onPress={() => router.push('/scan')} />
              {/*
                LE CONTACT SE CHOISIT SUR PLACE. Ce bouton menait à l'écran des
                contacts, donc hors du tunnel : on perdait le jeton choisi et il
                fallait revenir. Une feuille garde l'utilisateur où il est.
              */}
              <Chip label={t("chipContacts")} icon="contacts" onPress={() => setPickContact(true)} />
            </View>
            {isEns && ens.status === 'resolving' ? <Text variant="caption" tone="secondary">{t(tonDomain ? 'resolvingName' : 'resolvingEns')}</Text> : null}

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
            {/*
              Adresse Solana hors-courbe : c'est une PDA — compte de jeton ou
              compte de programme — que personne ne peut signer. Y envoyer du
              SOL, c'est le perdre définitivement, et l'adresse d'un compte de
              jeton se copie aussi facilement que celle d'un portefeuille.
            */}
            {isSolanaPda ? <Text variant="caption" tone="warning">{t('solanaPdaWarning')}</Text> : null}
            {contactName ? <Text variant="caption" tone="secondary">{fill(t('contactLabel'), { contact: contactName })}</Text> : null}

            {memoCapable && !params.memo ? (
              <View style={{ gap: space[1] }}>
                <Text variant="caption" tone="secondary">{t('commentLabel')}</Text>
                <Input placeholder={t('commentPlaceholder')} value={comment} onChangeText={setComment} autoCapitalize="none" maxLength={120} />
                {family === 'ton' ? <Text variant="caption" tone="tertiary">{t('commentHint')}</Text> : null}
              </View>
            ) : null}

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
            {addressError ? <Text variant="caption" tone="danger">{addressError}</Text> : null}
            <View style={{ flex: 1 }} />
            <Button label={t("actionContinue")} onPress={goStep2} disabled={!recipientOk || !!poisoning} />
          </FadeInUp>
        ) : null}

        {/* ── 2. Montant ── */}
        {step === 2 ? (
          <FadeInUp style={{ flex: 1, gap: space[5] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <AddressGlyph address={recipient} size={28} />
              <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>{t("labelTo")} {destLabel ?? shortAddress(recipient)}</Text>
            </View>
            <KPressable onPress={() => price > 0 && setInFiat((v) => !v)} accessibilityLabel={t("a11yToggleCurrency")} style={{ paddingVertical: space[4] }}>
              <Text variant="balance" tabular numberOfLines={1} adjustsFontSizeToFit tone={overBalance ? 'danger' : 'primary'}>
                {amount || '0'} <Text variant="title2" tone="secondary">{inFiat ? sym : symbol}</Text>
              </Text>
              <Text variant="caption" tone="secondary" tabular>
                {price > 0 ? (inFiat ? `≈ ${tokenAmountStr || '0'} ${symbol}` : `≈ ${formatFiat(fiatOfAmount)} ${sym}`) : ' '}{price > 0 ? '  ⇅' : ''}
              </Text>
            </KPressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {balance == null ? <Skeleton width={160} /> : <Text variant="caption" tone="secondary" tabular>{t("balanceLabel")} : {formatTokenAmount(balance, decimals)} {symbol}</Text>}
              <Chip label={t("chipMax")} onPress={setMax} />
            </View>
            {/*
              MANQUE DE GAZ : un seul message, et il BLOQUE.
              Il s'affichait deux fois — en orange ici, et en rouge juste
              dessous parce que `goStep3` remettait le texte identique dans
              `amountError`. Deux tonalités pour le même fait laissaient croire
              à deux problèmes distincts. Le message est dérivé de l'état, donc
              vivant sous la frappe, là où `amountError` est effacé à chaque
              touche ; et il est en rouge, parce que l'envoi est impossible.
            */}
            {notEnoughGas ? <Text variant="caption" tone="danger">{t('notEnoughGasForFee').replace('{symbol}', chain.nativeSymbol).replace('{details}', missingFeeText)}</Text> : null}
            {amountError && hasEnteredAmount ? <Text variant="caption" tone="danger">{amountError}</Text> : null}
            <View style={{ flex: 1 }} />
            <AmountKeypad value={amount} onChange={(v) => { setAmount(v); setAmountError(null); }} maxDecimals={inFiat ? 2 : Math.min(decimals, 8)} />
            <Button label={t("verify")} onPress={() => void goStep3()} loading={checking} disabled={amountRaw <= 0n || checking} />
          </FadeInUp>
        ) : null}

        {/*
          ── 3. Récapitulatif, plein écran (Nova) ──
          C'était une feuille : le montant s'y lisait en petit, au milieu de la
          liste. Le récapitulatif est le dernier regard avant que l'argent parte,
          il mérite l'écran entier — le montant en grand, le destinataire avec
          ses quatre derniers caractères en clair, puis l'anneau à maintenir.
        */}
        {step === 3 ? (
          <FadeInUp style={{ flex: 1, gap: space[4] }}>
            <View style={{ alignItems: 'center', gap: 6, paddingTop: space[2] }}>
              <Text variant="micro" tone="secondary" style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>{t('sendYouSend')}</Text>
              <Text variant="balance" tabular numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 52, lineHeight: 58, textAlign: 'center' }}>
                {formatTokenAmount(amountRaw, decimals)} <Text variant="title2" tone="secondary">{symbol}</Text>
              </Text>
              {price > 0 ? <Text variant="bodySecondary" tone="secondary" tabular>≈ {formatFiat(fiatOfAmount)} {sym}</Text> : null}
            </View>
            {/* Ce qu'on sait du destinataire, en clair, avant de signer. */}
            <RecipientFacts
              to={recipient}
              chainId={targetChainId}
              from={senderAddress}
              facts={{ contactName, ownAccount: isOwnRecipient, paidBefore, lookalikeOf: poisoning?.lookalike, isContract }}
            />
            <Surface padded={false} style={{ borderRadius: 26 }}>
              {/*
                CE QUE LE LIEN ANNONCE, en tête et non dans un toast qui disparaît.
                Bénéficiaire et motif sont écrits par l'émetteur du lien : affichés,
                jamais vérifiés — mais c'est la seule chose qui permet à
                l'utilisateur de reconnaître ce qu'il paie.
              */}
              {payeeLabel ? (
                <>
                  <ListRow title={t('payRequestFrom')} right={<Text variant="body">{payeeLabel}</Text>} />
                  <Divider inset={16} />
                </>
              ) : null}
              {noteLabel ? (
                <>
                  <ListRow title={t('labelReason')} right={<Text variant="body">{noteLabel}</Text>} />
                  <Divider inset={16} />
                </>
              ) : null}
              {memoLabel ? (
                <>
                  {/* Le mémo part ON-CHAIN, contrairement aux deux précédents. */}
                  <ListRow title={t('labelOnChainMemo')} right={<Text variant="body">{memoLabel}</Text>} />
                  <Divider inset={16} />
                </>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <AddressGlyph address={recipient} size={34} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="body" numberOfLines={1}>{destLabel ?? t("labelRecipient")}</Text>
                  <Text variant="caption" tone="secondary" numberOfLines={1} style={{ fontFamily: 'monospace' }}>
                    {recipient.slice(0, 6)}…<Text variant="caption" style={{ fontFamily: 'monospace', color: colors.text }}>{recipient.slice(-4)}</Text>
                  </Text>
                </View>
                {/* Le badge « Premier envoi / Contact connu » faisait doublon avec la fiche Destinataire au-dessus. */}
              </View>
              <Divider inset={76} />
              <ListRow title={t("labelNetwork")} right={<Text variant="body">{chain.name}</Text>} />
              <Divider inset={16} />
              <ListRow title={t("labelNetworkFee")} subtitle={feeOptions ? `${speed === 'slow' ? t("feeSlow") : speed === 'fast' ? t("feeFast") : t("feeNormal")} · ${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}` : `${formatTokenAmount(feeRaw, chain.nativeDecimals)} ${chain.nativeSymbol}`} right={<Text variant="body" tabular>{nativePrice > 0 ? t('aboutApprox').replace('{amount}', `${formatFiat(feeFiat)} ${sym}`) : '—'}</Text>} />
              {/*
                Le jeton lui-même prélève : on montre ce qui ARRIVERA, pas seulement
                ce qui part. C'est le seul endroit où l'utilisateur peut encore
                renoncer en connaissance de cause.
              */}
              {transferFeeRaw > 0n ? (
                <ListRow
                  title={t('tokenTransferFee')}
                  subtitle={`${formatTokenAmount(transferFeeRaw, decimals)} ${symbol}`}
                  right={<Text variant="body" tabular>{`${t('recipientGets')} ${formatTokenAmount(amountAfterTransferFee(amountRaw, tokenFee), decimals)} ${symbol}`}</Text>}
                />
              ) : null}
            </Surface>
            {feeOptions ? (
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                {(['slow', 'normal', 'fast'] as FeeSpeed[]).map((s) => <Chip key={s} label={s === 'slow' ? t("feeSlow") : s === 'normal' ? t("feeNormal") : t("feeFast")} selected={speed === s} onPress={() => setSpeed(s)} />)}
              </View>
            ) : null}
            {afterBalance != null ? (
              <Text variant="bodySecondary" tone="secondary">{fill(t('balanceUpdatePreview'), { symbol: symbol, before: formatTokenAmount(balance!, decimals), after: formatTokenAmount(afterBalance < 0n ? 0n : afterBalance, decimals) })}</Text>
            ) : null}
            {/* Frais qui écrasent le montant (2 € envoyés, 5 € de frais) : le dire avant la signature. */}
            {feeFiat > 0 && fiatOfAmount > 0 && feeFiat > fiatOfAmount * 0.5 ? (
              <Text variant="caption" tone="warning">{t('sendHighFee').replace('{pct}', String(Math.round((feeFiat / fiatOfAmount) * 100)))}</Text>
            ) : null}
            {family === 'evm' ? <Text variant="caption" tone="warning">{fill(t('checkNetworkWarning'), { chain: chain.name })}</Text> : null}
            {!isKnown ? <Text variant="caption" tone="warning">{fill(t('firstTimeWarning'), { end: recipient.slice(-4) })}</Text> : null}

            {/*
              LES DEUX GARDE-FOUS QUI MANQUAIENT ICI.
          
              L'empoisonnement d'adresse et la PDA Solana n'étaient signalés qu'à
              l'étape 1, et `goStep2` en était le SEUL blocage. Or un lien de paiement
              prérempli démarre à l'étape 2 et rejoint directement le récapitulatif :
              il ne passait donc par aucun des deux. Un QR menant à une adresse
              sosie, ou à un compte de jeton Solana, arrivait ici sans un mot.
          
              Le récapitulatif est le seul point que TOUS les chemins traversent.
              C'est donc ici que le garde-fou doit vivre, en plus de l'étape 1.
            */}
            {poisoning ? (
              <Surface style={{ borderColor: colors.danger, gap: space[2] }}>
                <Text variant="body" tone="danger">{t("suspiciousAddressTitle")}</Text>
                <Text variant="caption" tone="secondary">{t("suspiciousAddressBody")}</Text>
                <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                  <AddressGlyph address={poisoning.lookalike} size={28} />
                  <Text variant="caption" tone="secondary" style={{ flex: 1 }}>{groupAddress(poisoning.lookalike)}</Text>
                </View>
              </Surface>
            ) : null}
            {isSolanaPda ? <Text variant="caption" tone="danger">{t('solanaPdaWarning')}</Text> : null}
            <AntiDrainerBanner loading={isSimulating} simulation={simResult} />
            {simResult?.warningLevel === 'critical' ? (
              <KPressable
                onPress={() => setForceSendChecked((v) => !v)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[2],
                  paddingVertical: space[1],
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: forceSendChecked ? colors.danger : colors.border,
                    backgroundColor: forceSendChecked ? colors.danger : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {forceSendChecked ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
                </View>
                <Text variant="caption" tone="danger" style={{ flex: 1 }}>
                  {t('antiDrainerForceSendConfirm')}
                </Text>
              </KPressable>
            ) : null}
          </FadeInUp>
        ) : null}

        {/* ── 4. Suivi ── */}
        {step === 4 ? (
          <>
            {/* Le moment de l'envoi : orbite, comète d'or, puis célébration à la confirmation. */}
            <SendResult stage={stage} amount={`${formatTokenAmount(amountRaw, decimals)} ${symbol}`} dest={`${t('towards')} ${destLabel ?? shortAddress(recipient)} · ${chain.name}`} />
            <Surface style={{ gap: space[4] }}>
              <TxSteps stage={stage} />
              {stage === 'failed' ? <Text variant="caption" tone="danger">{t("txFailedMsg")}</Text> : null}
            </Surface>
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t("canLeaveScreenInfo")}</Text>
            {hash ? <Button label={t('trackTransaction')} variant="secondary" size="md" onPress={() => router.push({ pathname: '/tracking', params: { hash, chainId: chain.id } })} /> : null}
            <View style={{ flex: 1 }} />
            <Button label={t("actionDone")} onPress={() => router.dismissTo('/home')} />
          </>
        ) : null}
      </ScrollView>
      {/*
        L'ANNEAU « MAINTENIR POUR ENVOYER » EST FIXÉ EN BAS, hors du défilement :
        au bout du récapitulatif, il passait sous la barre système dès que le
        contenu dépassait l'écran (« Maintenir pour envoyer » coupé). Seul le
        récapitulatif défile au-dessus — comme Phantom et Rainbow.
      */}
      {step === 3 ? (
        <View style={{ alignItems: 'center', paddingTop: space[2], paddingBottom: insets.bottom + space[3], backgroundColor: colors.bg }}>
          <HoldRing
            hint={t("holdToSend")}
            holdingHint={t('holdKeepGoing')}
            onComplete={() => setConfirming(true)}
            /*
              ET ILS BLOQUENT. Les afficher sans empêcher l'envoi ne servirait à
              rien pour une PDA : les fonds y sont définitivement perdus, il n'y a
              pas de cas légitime à couvrir. L'adresse sosie bloque aussi, par
              cohérence avec l'étape 1 qui la bloquait déjà.
            */
            disabled={
              isSimulating ||
              !!poisoning ||
              isSolanaPda ||
              (simResult?.warningLevel === 'critical' && !forceSendChecked)
            }
            danger={simResult?.warningLevel === 'critical'}
          />
        </View>
      ) : null}
      </KeyboardAvoid>

      {/*
        Filtré sur la famille de la chaîne active : proposer un contact Bitcoin
        pendant un envoi Solana ne produirait qu'un refus incompréhensible.
      */}
      <ContactPicker
        visible={pickContact}
        family={family}
        onClose={() => setPickContact(false)}
        onPick={(address) => {
          setTo(address);
          setAddressError(null);
        }}
      />

      <ConfirmUnlock
        visible={confirming}
        title={fill(t('sendConfirmUnlockTitle'), { amount: formatTokenAmount(amountRaw, decimals), symbol: symbol })}
        subtitle={fill(t('sendConfirmUnlockSubtitle'), { dest: destLabel ?? shortAddress(recipient), chain: chain.name })}
        perform={perform}
        onDone={() => { setConfirming(false); setStep(4); }}
        onCancel={() => setConfirming(false)}
        aiContext={{
          to: recipient,
          value: `${formatTokenAmount(amountRaw, decimals)} ${symbol}`,
          method: 'transfer',
          network: chain.name,
          chainId: targetChainId,
          from: senderAddress,
          fiatValue: price > 0 ? `${formatFiat(fiatOfAmount)} ${sym}` : undefined,
          memo,
          recipient: {
            contactName,
            ownAccount: isOwnRecipient,
            paidBefore: paidBefore,
            lookalikeOf: poisoning?.lookalike,
            isContract,
          },
        }}
      />
    </View>
  );
}

// Lecture seule : rien à signer ici (ui/WatchOnlyGate).
export default withWatchOnlyGate(SendInner);
