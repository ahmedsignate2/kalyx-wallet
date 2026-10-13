/**
 * Accueil Kalyx — direction « Nova » : le halo respire en haut à droite dans
 * son orbite (un point d'or la parcourt), le solde est aligné à gauche, puis le
 * graphique et ses périodes, quatre disques d'action (Envoyer en Lumière,
 * Recevoir, Échanger, Gagner en or) et Jetons · NFT · Activité. Le marché
 * (Tendances) vit sous les jetons ; le réseau, les notifications et le scanner
 * sont dans l'en-tête ; le menu est dans la barre flottante.
 *
 * Vitesse perçue : cache affiché immédiatement (usePortfolioStore.hydrate),
 * puis mise à jour en silence. 5 états : chargement (skeleton), normal, vide,
 * erreur (bandeau), hors ligne (OfflineBanner global).
 */
import { useNetwork } from '../../lib/networkStore';
import { useIsWatchOnly } from '../../ui/WatchOnlyGate';
import { fill } from '../../lib/i18n';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { decimalSeparator } from '../../src';
import { isDecoySession } from '../../lib/sessionMode';
import { View, RefreshControl, Alert, Image, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, interpolate, runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, Extrapolation } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MarketPanel } from '../../ui/MarketPanel';
import { Allocation } from '../../ui/Allocation';
import { HomeNudge } from '../../ui/HomeNudge';
import { NftDetailModal } from '../../ui/NftDetailModal';
import { InteractiveChart } from '../../ui/InteractiveChart';
import { Icon } from '../../ui/icon';
import { useTheme, OnSky, skyColors as sky } from '../../ui/theme';
import { Landscape } from '../../ui/Landscape';
import { StatusBar } from 'expo-status-bar';
import { space, SCREEN_MARGIN, radius, radii, fontFamily } from '../../ui/tokens';
import { useSkyPhase } from '../../ui/sky';
import { FadeInUp } from '../../ui/FadeInUp';
import { cascadeDelay } from '../../ui/motion';
import { holdingLabel } from '../../lib/holdingLabel';
import { holdingIcon } from '../../ui/kit/useFallbackLogo';
import { LogoImage, Text, IconButton, Divider, TokenRow, TokenIcon, AmountDisplay, Skeleton, EmptyState, ActivityRow, Pressable as KPressable, Card } from '../../ui/kit';
import { WalletAvatar } from '../../ui/avatarArt';
import { KalyxLogo } from '../../ui/KalyxLogo';
import { ActionTile, Pills, TextTabs } from '../../ui/nova';
import { TonNftSendSheet } from '../../ui/TonNftSendSheet';
import { useBrowserPresence, hostOf } from '../../lib/browserPresence';
import { useWallet } from '../../lib/walletStore';
import { addressForChain } from '../../lib/accountAddress';
import { accountDisplayName } from '../../lib/walletNames';
import { useSettings, useT, useActivityT, fiatSymbol } from '../../lib/settingsStore';
import { TestnetSection } from '../../ui/TestnetSection';
import { useNotifCenter, unreadCount } from '../../lib/notificationCenter';
import { usePortfolioStore, splitHoldings, verifiedSymbols, verifiedContracts, verifiedChainSymbols, portfolioHistory, peekPortfolioHistory, loadNftReport, PERIODS, type NftReport, type Period, type Holding, type ChainNft } from '../../lib/portfolio';
import { useContacts } from '../../lib/contactsStore';
import { haptic } from '../../lib/haptics';
import { toast } from '../../lib/toast';
import { isDeviceCompromised } from '../../lib/deviceSecurity';
import { IS_BETA } from '../../lib/appStage';
import { getAdapter, getMarketsByIds, nativeOfChain, chainNameOf, chainIconUrl, formatFiat, formatTokenAmount, humanizeTx, type ChartPoint, type NftItem } from '../../src';
import {
  useHistoryStore,
  useHistoryCache,
  useAnyHistoryLoading,
  useAnyHistoryFetched,
  aggregateHistory,
  type HistoryChain
} from '../../lib/historyStore';
import { useSpamOf, useHistoryChains } from '../../lib/historySpam';
import { useShallow } from 'zustand/react/shallow';

const HIDE_KEY = 'kalyx.hideBalance';
const SMALL_KEY = 'kalyx.showSmallBalances';
type Tab = 'tokens' | 'nft' | 'activity';

const LANG_LOCALES: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  ru: 'ru-RU',
  ar: 'ar-SA',
  hi: 'hi-IN',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
};

function fmtDate(t: number, period: Period, locale = 'en-US'): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return period === '1J' || period === '1S' ? `${day} · ${time}` : d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: period === '1M' ? undefined : '2-digit' });
}

/** La révélation du solde ne se joue qu'une fois par session. */
let balanceRevealed = false;

/** Lignes affichées par page (jetons, jetons non vérifiés) et NFT par page. */
const LIST_PAGE = 25;
const NFT_PAGE = 12;

export default function Home() {
  const { colors, mode } = useTheme();
  const t = useT();
  const online = useNetwork((s) => s.online);
  const activityT = useActivityT();
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  // Largeur RÉELLE du conteneur (mesurée) : ne dépend pas de la fenêtre système
  // (edge-to-edge, écrans pliables, zoom d'affichage…) → rien ne déborde ni ne se fait clipper.
  const [layoutW, setLayoutW] = useState(0);
  const screenW = layoutW || windowW;
  const account = useWallet((s) => s.account);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const activeChain = useWallet((s) => s.activeChain);
  const fiat = useSettings((s) => s.fiat);
  const backupVerified = useSettings((s) => s.backupVerified);
  const watchOnly = useIsWatchOnly(); // pas de phrase à vérifier pour une adresse suivie
  const language = useSettings((s) => s.language);
  const locale = LANG_LOCALES[language] || 'en-US';
  const unread = useNotifCenter((s) => unreadCount(s.items));
  const stored = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
  const acct = useMemo(
    () => (stored ? { evmAddress: stored.evmAddress, solAddress: stored.solAddress, btcAddress: stored.btcAddress, tonPublicKey: stored.tonPublicKey, tonVersion: stored.tonVersion } : null),
    [stored],
  );

  const periodLabels: Record<Period, string> = {
    '1J': t('period1D'),
    '1S': t('period1W'),
    '1M': t('period1M'),
    '1A': t('period1Y'),
    'Tout': t('periodAll'),
  };

  const pf = usePortfolioStore(useShallow((s) => ({ at: s.at, error: s.error, fromCache: s.fromCache, holdings: s.holdings, key: s.key, loading: s.loading, pnl24h: s.pnl24h, pnl24hPct: s.pnl24hPct, total: s.total })));
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<Tab>('tokens');
  const [period, setPeriod] = useState<Period>('1S');
  const [points, setPoints] = useState<ChartPoint[]>(() => peekPortfolioHistory(pf.key, '1S') ?? []);
  const [chartLoading, setChartLoading] = useState(false);
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [showSmall, setShowSmall] = useState(false);
  // Mémorisé : les onglets remontent l'accueil, et la section se repliait à chaque retour.
  useEffect(() => {
    AsyncStorage.getItem(SMALL_KEY).then((v) => setShowSmall(v === '1')).catch(() => {});
  }, []);
  const toggleSmall = () =>
    setShowSmall((v) => {
      AsyncStorage.setItem(SMALL_KEY, v ? '0' : '1').catch(() => {});
      return !v;
    });
  const [refreshing, setRefreshing] = useState(false);
  /** Incrémenté à chaque « tirer pour rafraîchir » : les soldes de test suivent le geste. */
  const [refreshTick, setRefreshTick] = useState(0);
  const showTestnets = useSettings((s) => s.showTestnets);
  const [showHidden, setShowHidden] = useState(false);
  const [nfts, setNfts] = useState<ChainNft[] | null>(null);
  /** Ce qui n'a pas répondu à la dernière lecture : on le dit, au lieu d'afficher « aucun NFT ». */
  const [nftIssues, setNftIssues] = useState<{ failed: string[]; unavailable: string[]; nothingAnswered: boolean } | null>(null);
  /*
   * Un réseau en panne GARDE ce qu'il montrait : une lecture ratée ne doit pas
   * faire disparaître des NFT qui étaient là il y a une minute.
   */
  const applyNftReport = useCallback((r: NftReport) => {
    const down = new Set(r.failed);
    setNfts((cur) => [...r.nfts, ...(cur ?? []).filter((n) => down.has(n.chainId))]);
    setNftIssues({ failed: r.failed, unavailable: r.unavailable, nothingAnswered: r.asked > 0 && r.failed.length + r.unavailable.length === r.asked });
  }, []);
  /*
   * MINI-COURBES (7 jours) des jetons détenus, comme la maquette : UNE requête
   * pour tous (getMarketsByIds, mise en cache), relancée seulement si la liste
   * des actifs change. En échec, les lignes restent sans courbe.
   */
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const sparkIds = useMemo(() => [...new Set(pf.holdings.filter((h) => h.verified && h.coingeckoId).map((h) => h.coingeckoId!))].sort().join(','), [pf.holdings]);
  useEffect(() => {
    if (!sparkIds) return;
    let alive = true;
    getMarketsByIds(fiat, sparkIds.split(','))
      .then((list) => { if (alive) setSparks(Object.fromEntries(list.filter((m) => m.sparkline.length > 1).map((m) => [m.id, m.sparkline]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sparkIds, fiat]);
  const [openNft, setOpenNft] = useState<ChainNft | null>(null);
  const [sendNft, setSendNft] = useState<ChainNft | null>(null);
  const contacts = useContacts((s) => s.contacts);
  const parked = useBrowserPresence((s) => s.parked);

  // Cache d'abord (instantané), puis réseau.
  const loadPortfolio = useEffectEvent(() => {
    if (!acct) return;
    const store = usePortfolioStore.getState();
    store.hydrate(acct, fiat).then((current) => { if (current) void store.refresh(acct, fiat); });
  });
  const evmAddress = acct?.evmAddress;
  const solAddress = acct?.solAddress;
  const btcAddress = acct?.btcAddress;
  const tonPublicKey = acct?.tonPublicKey;
  useEffect(() => {
    loadPortfolio();
  }, [evmAddress, solAddress, btcAddress, tonPublicKey, fiat]); // toutes les adresses de la clé du cliché

  // Solde masqué : mémorisé.
  useEffect(() => {
    AsyncStorage.getItem(HIDE_KEY).then((v) => setHidden(v === '1')).catch(() => {});
  }, []);
  const toggleHidden = () => {
    haptic.light();
    setHidden((h) => {
      AsyncStorage.setItem(HIDE_KEY, h ? '0' : '1').catch(() => {});
      return !h;
    });
  };

  // Courbe de valeur pour la période.
  const pfKey = pf.key;
  const pfAt = pf.at;
  const loadCurve = useEffectEvent((key: string) => portfolioHistory(pf.holdings, fiat, period, key));
  const hasHoldings = pf.holdings.length > 0;
  useEffect(() => {
    let alive = true;
    if (!pfKey || !hasHoldings) {
      setPoints([]);
      return;
    }
    const known = peekPortfolioHistory(pfKey, period);
    if (known) {
      setPoints(known);
      return;
    }
    setChartLoading(true);
    loadCurve(pfKey)
      .then((p) => alive && setPoints(p))
      .catch(() => alive && setPoints([]))
      .finally(() => alive && setChartLoading(false));
    return () => {
      alive = false;
    };
  }, [pfKey, pfAt, period, fiat, hasHoldings]);

  /*
   * ACTIVITÉ RÉCENTE — CACHE D'ABORD, RÉSEAU ENSUITE.
   *
   * Cet écran appelait les adaptateurs en DIRECT, avec un `Promise.all` : rien ne
   * s'affichait avant que les huit réseaux aient répondu, et rien n'était
   * conservé d'une ouverture à l'autre. Or un indexeur muet coûte cher — chaque
   * fournisseur est réessayé trois fois avec un repli exponentiel — donc un seul
   * réseau lent laissait la liste vide plusieurs dizaines de secondes, à chaque
   * ouverture de l'app.
   *
   * On lit désormais le même cache persisté que l'écran Historique : l'affichage
   * est immédiat dès la deuxième ouverture, et comme le magasin remplit le cache
   * réseau par réseau, les lignes apparaissent au fur et à mesure au lieu
   * d'attendre le plus lent.
   */
  const historyChains = useHistoryChains();
  const historyAddressFor = useCallback((chain: HistoryChain) => addressForChain(acct, chain) || undefined, [acct]);
  const historyCache = useHistoryCache();
  // Toute l'activité : le spam est écarté AVANT de garder les cinq dernières,
  // sinon cinq airdrops récents vidaient l'aperçu.
  const recent = useMemo(
    () => aggregateHistory(historyCache, historyChains, historyAddressFor),
    [historyCache, historyChains, historyAddressFor],
  );
  const spamOf = useSpamOf(recent);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);
  const recentLoading = useAnyHistoryLoading(historyChains, historyAddressFor);
  const recentFetched = useAnyHistoryFetched(historyChains, historyAddressFor);

  useEffect(() => {
    if (!account) return;
    /*
     * Chaque réseau est lancé SÉPARÉMENT et son échec absorbé seul : un réseau
     * injoignable ne doit priver l'écran ni des autres, ni du cache.
     */
    for (const chain of historyChains) {
      const address = historyAddressFor(chain);
      if (address) void fetchHistory(chain.id, address).catch(() => {});
    }
  }, [account, historyChains, historyAddressFor, fetchHistory]);

  /*
   * RETOUR SUR L'ONGLET. L'accueil reste monté : les effets ci-dessus ne
   * rejouent plus à chaque visite, et un solde invalidé par un envoi restait
   * affiché tel quel. Au retour, on redemande — les magasins jugent eux-mêmes
   * de la fraîcheur (60 s, ou tout de suite après un envoi), donc une visite
   * rapprochée ne coûte aucun appel. Le premier passage est laissé aux effets.
   */
  const seenFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!seenFocus.current) {
        seenFocus.current = true;
        return;
      }
      if (!acct) return;
      void usePortfolioStore.getState().refresh(acct, fiat);
      for (const chain of historyChains) {
        const address = historyAddressFor(chain);
        if (address) void fetchHistory(chain.id, address).catch(() => {});
      }
    }, [acct, fiat, historyChains, historyAddressFor, fetchHistory]),
  );

  /*
   * NFT agrégés, lus à l'ouverture de l'onglet. L'accueil reste monté (navigateur
   * d'onglets) : une liste lue une fois restait figée — un NFT reçu ensuite
   * n'apparaissait jamais. Elle est relue si elle a plus d'une minute, et
   * aussitôt si le compte change ; l'ancienne reste affichée pendant la lecture.
   */
  const nftsRead = useRef<{ key: string; at: number } | null>(null);
  const nftKey = acct ? `${acct.evmAddress}|${acct.solAddress ?? ''}|${acct.tonPublicKey ?? ''}` : '';
  const readNfts = useEffectEvent(() => (acct ? loadNftReport(acct) : null));
  useEffect(() => {
    if (tab !== 'nft' || !nftKey) return;
    const last = nftsRead.current;
    if (last && last.key === nftKey && Date.now() - last.at < 60_000) return;
    if (last?.key !== nftKey) setNfts(null);
    nftsRead.current = { key: nftKey, at: Date.now() };
    let alive = true;
    readNfts()?.then((r) => alive && applyNftReport(r)).catch(() => alive && setNfts((cur) => cur ?? []));
    return () => { alive = false; };
  }, [tab, nftKey, applyNftReport]);

  const retryNfts = useCallback(() => {
    if (!acct) return;
    haptic.selection();
    nftsRead.current = { key: nftKey, at: Date.now() };
    setNfts(null);
    loadNftReport(acct).then(applyNftReport).catch(() => setNfts([]));
  }, [acct, nftKey, applyNftReport]);

  const onRefresh = useCallback(async () => {
    if (!acct) return;
    /*
     * Seuil du pull-to-refresh : haptique de SÉLECTION et non `light` — le §5
     * la classe avec les touches et les bascules, pas avec les boutons. On
     * choisit de rafraîchir, on n'actionne pas un bouton.
     *
     * La suite du §10.4 est déjà portée par l'Aura, sans spinner ajouté :
     * l'ambiance passe en Synchronisation dès que `usePortfolioStore.loading`
     * devient vrai (lib/auraBinding.ts), et à la fin les chiffres roulent dans
     * le sens du changement (§8) ou rien ne bouge si le solde est identique.
     * Manque encore l'étirement du halo sous le doigt, qui demande de piloter
     * le défilement au geste — voir §23.
     */
    haptic.selection();
    setRefreshing(true);
    setRefreshTick((n) => n + 1);
    try {
      /*
       * L'historique se rafraîchit AUSSI, et en parallèle du portefeuille : le
       * geste veut dire « remets tout à jour », et l'activité en faisait partie
       * sans jamais être redemandée.
       */
      await Promise.all([
        usePortfolioStore.getState().refresh(acct, fiat, { force: true }),
        ...historyChains.map((chain) => {
          const address = historyAddressFor(chain);
          return address ? fetchHistory(chain.id, address, { force: true }).catch(() => {}) : Promise.resolve();
        }),
      ]);
      if (tab === 'nft') {
        nftsRead.current = { key: nftKey, at: Date.now() };
        const r = await loadNftReport(acct).catch(() => null);
        if (r) applyNftReport(r);
      }
    } finally {
      setRefreshing(false);
    }
  }, [acct, fiat, tab, nftKey, historyChains, historyAddressFor, fetchHistory, applyNftReport]);

  // Avertissements uniques (bêta, appareil rooté, réseaux perso à restaurer).
  const showStartupNotices = useEffectEvent(() => {
    if (isDeviceCompromised()) toast.warning(t("deviceInsecureTitle"), t("deviceInsecureDesc"));
    // Session leurre : ni lecture ni écriture de ces marqueurs (le rappel des réseaux perso appartient au vrai portefeuille).
    if (isDecoySession()) return;
    AsyncStorage.getItem('nova.betaSeen').then((seen) => {
      const next = () =>
        AsyncStorage.getItem('nova.promptRestoreNetworks').then((v) => {
          if (!v) return;
          AsyncStorage.removeItem('nova.promptRestoreNetworks');
          Alert.alert(t("customNetworksPromptTitle"), t("customNetworksPromptDesc"), [
            { text: t("actionLater"), style: 'cancel' },
            { text: t("actionRestore"), onPress: () => router.push('/developer') },
          ]);
        });
      if (seen || !IS_BETA) return void next();
      Alert.alert(t("betaTitle"), t("betaDesc"), [
        { text: t("actionUnderstood"), onPress: () => { AsyncStorage.setItem('nova.betaSeen', '1'); void next(); } },
      ]);
    });
  });
  useEffect(() => {
    showStartupNotices();
  }, []);

  /*
   * HOME MORPHING (docs/08 §9). Le solde ne DISPARAÎT jamais : il change de
   * forme. Tout est interpolé sur la position de défilement, donc réversible —
   * on remonte, il redevient grand, sans à-coup et sans seuil qui déclencherait
   * une animation jouée toute seule (§2.7).
   *
   * Pas besoin de react-native-gesture-handler : `useAnimatedScrollHandler`
   * donne la position sur le THREAD UI, ce qui suffit. Seul l'étirement du halo
   * pendant qu'on tire (§10.4) demanderait d'intercepter le geste.
   *
   * Conservé même avec « réduire les animations » : le §4.4 le prévoit
   * explicitement, puisqu'il suit le doigt et n'est pas une animation autonome.
   */
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  /** Plage de morphing, en pixels de défilement. */
  const MORPH = { from: 32, to: 132 } as const;
  /*
   * Solde géant et en-tête compact se PASSENT le relais au lieu de se
   * superposer : le grand s'efface sur la première moitié du morphing, le
   * compact n'apparaît que sur la seconde. Plus de double « 1,45 » fantôme.
   */
  const bigBalanceStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [MORPH.from, MORPH.to], [0, 1], Extrapolation.CLAMP);
    const fade = interpolate(p, [0, 0.55], [1, 0], Extrapolation.CLAMP);
    return { opacity: fade, transform: [{ scale: 1 - p * 0.22 }, { translateY: -p * 18 }] };
  });
  const compactBgStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [MORPH.from, MORPH.to], [0, 1], Extrapolation.CLAMP);
    return { opacity: interpolate(p, [0.35, 0.9], [0, 0.97], Extrapolation.CLAMP) };
  });
  const compactStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [MORPH.from, MORPH.to], [0, 1], Extrapolation.CLAMP);
    const show = interpolate(p, [0.45, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: show, transform: [{ translateY: (1 - show) * -8 }] };
  });
  /** Barre d'état : opaque seulement quand le contenu passe dessous (le ciel, lui, y monte). */
  const statusBgStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [MORPH.from, MORPH.to], [0, 1], Extrapolation.CLAMP) }));
  /** Hauteur du paysage : jusqu'au milieu des tuiles d'action (mesuré). */
  const [heroH, setHeroH] = useState(0);
  /** Le ciel suit le vrai soleil du jour, et change en direct (ui/sky). */
  const phase = useSkyPhase();
  const [focused, setFocused] = useState(true);
  const [overSky, setOverSky] = useState(true);
  useAnimatedReaction(
    () => scrollY.value < MORPH.to * 0.6,
    (cur, prev) => { if (cur !== prev) runOnJS(setOverSky)(cur); },
  );
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  /*
   * RÉVÉLATION DU SOLDE : la première fois qu'il apparaît dans la session
   * (après le déverrouillage), chaque chiffre fait un tour et se pose, de
   * gauche à droite. Une seule fois : revenir sur l'accueil ne la rejoue pas.
   */
  const [reveal, setReveal] = useState(() => !balanceRevealed);
  useEffect(() => {
    if (!reveal || (pf.loading && pf.at === 0) || hidden) return;
    balanceRevealed = true;
    const id = setTimeout(() => setReveal(false), 2600);
    return () => clearTimeout(id);
  }, [reveal, pf.loading, pf.at, hidden]);
  const prevTotal = useRef(pf.total);
  useEffect(() => { prevTotal.current = pf.total; }, [pf.total]);
  /*
   * ENTRÉE DU SOLDE : la première fois qu'il apparaît dans la session, il se
   * pose (échelle 0,94 → 1, fondu) au ressort, en même temps que ses chiffres
   * roulent. Une seule fois : revenir sur l'accueil ne la rejoue pas.
   */
  const reduceMotion = useReducedMotion();
  const balEnter = useSharedValue(balanceRevealed || reduceMotion ? 1 : 0);
  const balReady = !(pf.loading && pf.at === 0);
  useEffect(() => {
    if (balReady && balEnter.value === 0) balEnter.value = withSpring(1, { damping: 18, stiffness: 160 });
  }, [balReady, balEnter]);
  const balEnterStyle = useAnimatedStyle(() => ({ opacity: 0.15 + 0.85 * balEnter.value, transform: [{ scale: 0.94 + 0.06 * balEnter.value }] }));

  /*
   * Tous les hooks AVANT ce retour : l'accueil reste monté dans les onglets, et
   * le verrouillage vide `account` — un hook placé après aurait changé leur
   * nombre au déverrouillage (« Rendered more hooks… », écran planté).
   */
  // Listes bornées (voir plus bas) — déclarées AVANT tout retour anticipé (règle des hooks).
  const [tokenLimit, setTokenLimit] = useState(LIST_PAGE);
  const [nftLimit, setNftLimit] = useState(NFT_PAGE);
  const [unverifiedLimit, setUnverifiedLimit] = useState(LIST_PAGE);
  if (!account || !stored) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const sym = fiatSymbol(fiat);
  const hour = new Date().getHours();
  const greeting = t(hour < 5 ? 'greeting_night' : hour < 12 ? 'greeting_morning' : hour < 18 ? 'greeting_afternoon' : hour < 22 ? 'greeting_evening' : 'greeting_night');
  const initialLoading = pf.loading && pf.at === 0;
  const { main, small, hidden: unverified } = splitHoldings(pf.holdings);
  const testnetSection = showTestnets && acct ? <TestnetSection acct={acct} hidden={hidden} refreshTick={refreshTick} /> : null;
  /*
   * LISTES BORNÉES. Une grosse adresse (suivie en lecture seule, par exemple)
   * détient des centaines de jetons et de NFT : tout rendre d'un coup — chaque
   * ligne animée, avec ses logos — figeait puis faisait planter l'app. On en
   * montre une page, et « Afficher plus » ajoute la suivante.
   */
  const shownTokens = showSmall ? [...main, ...small] : main;
  const vSymbols = verifiedSymbols(pf.holdings);
  const vContracts = verifiedContracts(pf.holdings);
  const vChainSymbols = verifiedChainSymbols(pf.holdings);
  const priceBySymbol = new Map(pf.holdings.filter((h) => h.verified && h.price > 0).map((h) => [h.symbol.toUpperCase(), h.price]));
  const nameOf = (a: string) => {
    const l = a.toLowerCase();
    if (accounts.some((x) => x.evmAddress.toLowerCase() === l || x.solAddress?.toLowerCase() === l)) return t('actYou');
    return contacts.find((c) => c.address.toLowerCase() === l)?.name;
  };
  const logoOfTx = (tx: { chain: string; contract?: string }) =>
    pf.holdings.find((h) => h.chainId === tx.chain && (tx.contract ? h.contract?.toLowerCase() === tx.contract.toLowerCase() : h.kind === 'native'))?.logo;
  const humanCtx = {
    t: activityT,
    nativeSymbol: getAdapter(activeChain).config.nativeSymbol,
    nativeDecimals: getAdapter(activeChain).config.nativeDecimals,
    /*
     * LA CHAÎNE DE CHAQUE LIGNE, pas celle affichée. Cette liste agrège
     * l'historique de tous les réseaux ; sans ce résolveur, les décimales du
     * réseau actif s'appliquaient à tout, et un envoi de 1 000 satoshis vu
     * depuis Base s'affichait « 0,000000000000001 ETH » — avec, en plus, la
     * contre-valeur de l'ETH sur un montant en Bitcoin.
     */
    nativeOf: nativeOfChain,
    nameOf,
    verifiedSymbols: vSymbols,
    verifiedContracts: vContracts,
    verifiedChainSymbols: vChainSymbols,
    spamOf,
    fiatOf: (symbol: string, amount: number) => {
      const p = priceBySymbol.get(symbol.toUpperCase());
      return p ? `${formatFiat(amount * p)} ${sym}` : undefined;
    },
  };
  const mood: 'up' | 'down' | 'flat' = pf.pnl24h == null ? 'flat' : pf.pnl24h >= 0 ? 'up' : 'down';

  const shownValue = scrub ? scrub.v : pf.total;
  /*
   * Sens du roulement des chiffres (§8) : comparé au total PRÉCÉDEMMENT AFFICHÉ,
   * pas au pnl du jour — c'est le mouvement du nombre à l'écran qu'on illustre.
   * Une variation de cours fait donc bien rouler le solde, mais §8 est clair :
   * elle ne déclenche ni impulsion de l'Aura ni couleur d'alerte. Seul le sens
   * du roulement la reflète.
   */
  const rollDir: 'up' | 'down' | 'none' =
    pf.total === prevTotal.current ? 'none' : pf.total > prevTotal.current ? 'up' : 'down';
  const pnlUp = (pf.pnl24h ?? 0) >= 0;
  const chartWidth = screenW - SCREEN_MARGIN * 2;

  const openHolding = (h: Holding) => {
    if (h.kind === 'native' && h.coingeckoId) return router.push({ pathname: '/token/[id]', params: { id: h.coingeckoId, chain: h.chainId } });
    if (!h.verified) {
      return Alert.alert(t("unverifiedTokenTitle"), fill(t('unverifiedTokenDesc'), { name: h.name, symbol: h.symbol }), [{ text: t("actionUnderstoodShort") }]);
    }
    const tokenKey = h.kind === 'spl' ? 'mint' : h.kind === 'jetton' ? 'jetton' : 'contract';
    const sendParams = { [tokenKey]: h.contract!, symbol: h.symbol, decimals: String(h.decimals), chain: h.chainId };
    Alert.alert(`${h.symbol} · ${getAdapter(h.chainId).config.name}`, `${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`, [
      { text: t("actionSend"), onPress: () => { useWallet.getState().setActiveChain(h.chainId); router.push({ pathname: '/send', params: sendParams }); } },
      // Pas d'échange pour un jetton TON : le moteur d'échange (LI.FI) ne couvre pas TON.
      ...(h.kind === 'jetton' ? [] : [{ text: t("actionSwap"), onPress: () => { useWallet.getState().setActiveChain(h.chainId); router.push({ pathname: '/swap', params: { contract: h.contract! } }); } }]),
      { text: t("actionCancel"), style: 'cancel' as const },
    ]);
  };

  return (
    <View style={{ flex: 1, alignSelf: 'stretch', backgroundColor: colors.bg }} onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ headerShown: false }} />
      {/*
        LE PAYSAGE, hors du ScrollView : il reste derrière, ses plans glissent
        chacun à sa vitesse (parallaxe), et la feuille de contenu monte dessus.
        Il reste visible quand le solde est masqué : il ne dit rien du montant
        (le graphique, lui, disparaît).
      */}
      <Landscape width={screenW} height={(heroH || insets.top + 380) + 40} phase={phase} scrollY={scrollY} sunAt={0.55} veil balanceGlow={mode === 'dark' ? 0.32 : 0.18} />
      {/*
        Sur le ciel, la barre d'état est claire quel que soit le thème ; dès que
        l'en-tête compact (fond de l'app) la recouvre, elle reprend la teinte du
        thème — des icônes blanches sur le Crème seraient invisibles.
      */}
      {focused ? <StatusBar style={overSky || mode === 'dark' ? 'light' : 'dark'} /> : null}

      {/*
        En-tête compact : « 12 482,91 $ · +1,5 % ». Il n'apparaît pas, il PREND
        LE RELAIS du solde géant au même instant, de sorte que le montant reste
        lisible en continu pendant tout le défilement.
      */}
      {/*
        FOND de l'en-tête compact : sans lui, le montant flottait par-dessus les
        libellés des disques et des tokens qui défilaient dessous. Il apparaît
        avec l'en-tête, couvre la barre d'état, et se termine par un trait fin.
      */}
      {!hidden && !initialLoading ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + space[2] + 56, zIndex: 4, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border }, compactBgStyle]}
        />
      ) : null}
      {!hidden && !initialLoading ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: insets.top + space[2], left: SCREEN_MARGIN, right: SCREEN_MARGIN, zIndex: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], height: 48 },
            compactStyle,
          ]}
        >
          <Text variant="body" tabular numberOfLines={1}>{formatFiat(pf.total)} {sym}</Text>
          {pf.pnl24hPct != null ? (
            <Text variant="caption" tone={pnlUp ? 'up' : 'down'} tabular>
              {pnlUp ? '+' : '−'}{Math.abs(pf.pnl24hPct).toFixed(1).replace('.', decimalSeparator())} %
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.ScrollView
        onScroll={onScroll}
        /*
           1 et non 16 : 16 ms borne les événements à ~60 par seconde, ce qui
           saccaderait le morphing sur un écran 120 Hz. Avec
           `useAnimatedScrollHandler`, le gestionnaire s'exécute sur le thread UI
           et suivre chaque image ne coûte rien au JavaScript.
        */
        scrollEventThrottle={1}
        style={{ flex: 1, alignSelf: 'stretch' }}
        contentContainerStyle={{ paddingTop: insets.top + space[2], paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + 120, gap: space[6] }}
        refreshControl={
          /*
             Indicateur DISCRET : c'est l'Aura qui porte l'information de
             synchronisation (§10.4), le spinner système n'est là que pour le
             retour tactile du geste pendant qu'on tire.

             `progressViewOffset` (iOS ET Android en RN 0.86) : le spinner naissait
             sous la barre d'état opaque / la Dynamic Island. On le décale de la
             zone sûre plutôt que de passer par contentInset + contentOffset, qui
             décalerait l'origine du défilement lue par l'en-tête compact et le
             halo (interpolations sur `y`).
          */
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={insets.top} tintColor={sky.textSecondary} colors={[colors.textTertiary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Tout ce qui est posé sur le ciel se dessine pour lui (texte crème, verre). */}
        <OnSky>
        <View style={{ gap: space[5], marginBottom: -space[2] }}>
        {/* ── En-tête, comme la maquette : la marque à gauche ; réseau, notifications, scanner et avatar à droite ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], minWidth: 0 }} accessible accessibilityRole="header" accessibilityLabel="Kalyx">
            <KalyxLogo size={28} />
            <Text variant="title2" numberOfLines={1} style={{ letterSpacing: 0.3 }}>Kalyx</Text>
          </View>
          {/* Réseau actif (Envoyer / Swap / dApps) : un tap ouvre le sélecteur. */}
          <KPressable
            onPress={() => router.push('/networks')}
            accessibilityLabel={`${t('network')} : ${getAdapter(activeChain).config.name}`}
            /*
              LOGO SEUL, comme Phantom : le nom du réseau prenait 104 px et
              réduisait le nom du compte à « Co… ». Le nom reste dans le libellé
              (lecteur d'écran) et sur l'écran Réseaux.
            */
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingLeft: 7, paddingRight: 8, borderRadius: radius.round, backgroundColor: sky.surface1, borderWidth: 1, borderColor: sky.border, flexShrink: 0 }}
          >
            {chainIconUrl(activeChain) ? <LogoImage uri={chainIconUrl(activeChain)!} size={20} /> : <Text variant="caption" numberOfLines={1}>{getAdapter(activeChain).config.name}</Text>}
            <Icon name="caretDown" size={12} tone="muted" />
          </KPressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -space[2] }}>
            <View>
              <IconButton icon="bell" label={t("labelNotifications")} tone="ghost" onPress={() => router.push('/notifications')} />
              {unread > 0 ? <View style={{ position: 'absolute', top: 11, right: 11, width: 8, height: 8, borderRadius: radii.full, borderWidth: 1.5, borderColor: 'rgba(30,28,42,0.6)', backgroundColor: sky.warm }} /> : null}
            </View>
            {/* Scanner : seule porte d'entrée pour connecter une dApp ou la webapp par QR. */}
            <IconButton icon="scan" label={t("scanQr")} tone="ghost" onPress={() => router.push('/scan')} />
          </View>
          {/* L'avatar du compte : il ouvre le choix du compte. */}
          <KPressable onPress={() => router.push('/accounts')} accessibilityLabel={t("a11ySwitchAccount")} style={{ width: 40, height: 40, borderRadius: radii.full, borderWidth: 1.5, borderColor: sky.rim, backgroundColor: sky.surface1, alignItems: 'center', justifyContent: 'center' }}>
            <WalletAvatar size={32} />
          </KPressable>
        </View>

        {/* Salutation en grand : l'heure du jour, puis le nom du compte (un tap change de compte). */}
        <KPressable noScale onPress={() => router.push('/accounts')} accessibilityLabel={t("a11ySwitchAccount")} style={{ marginBottom: -space[3] }}>
          <Text variant="heading" numberOfLines={1}>{greeting},</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="heading" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>{accountDisplayName(stored, t)}</Text>
            <Icon name="caretDown" size={14} tone="muted" />
          </View>
        </KPressable>

        {/* ── Solde, posé sur le ciel ── */}
        <Animated.View style={[{ gap: space[1] }, bigBalanceStyle]}>
          <KPressable onLongPress={toggleHidden} delayLongPress={350} accessibilityLabel={hidden ? t("a11yHiddenBalance") : t("a11yVisibleBalance")}>
            {initialLoading ? (
              <Skeleton width={220} height={52} />
            ) : hidden ? (
              <Text variant="balance">••••••</Text>
            ) : scrub ? (
              <Text variant="balance" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.35}>{formatFiat(shownValue)} <Text variant="title2" tone="secondary">{sym}</Text></Text>
            ) : (
              <Animated.View style={[{ transformOrigin: 'left center' }, balEnterStyle]}>
                <AmountDisplay value={formatFiat(pf.total)} suffix={sym} direction={rollDir} reveal={reveal} />
              </Animated.View>
            )}
          </KPressable>
          <View style={{ height: 28, justifyContent: 'center', alignItems: 'flex-start', marginTop: space[1] }}>
            {scrub ? (
              <Text variant="caption" tone="secondary">{fmtDate(scrub.t, period, locale)}</Text>
            ) : hidden || initialLoading ? null : pf.pnl24h != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: space[3], borderRadius: radii.full, backgroundColor: sky.surface2 }}>
                <Icon name={pnlUp ? 'trendUp' : 'trendDown'} size={14} color={pnlUp ? sky.up : sky.down} />
                {/* Sur le ciel, le texte reste crème (lisible sur tout ciel) : le sens est dans le signe et la flèche colorée. */}
                <Text variant="caption" tabular style={{ fontFamily: fontFamily.semibold }}>
                {pnlUp ? '+' : '−'}{formatFiat(Math.abs(pf.pnl24h))} {sym} · {t("today")}{pf.pnl24hPct != null ? ` (${pnlUp ? '+' : '−'}${Math.abs(pf.pnl24hPct).toFixed(1).replace('.', decimalSeparator())} %)` : ''}
                </Text>
              </View>
            ) : (
              <Text variant="caption" tone="tertiary">{pf.fromCache ? t("updating") : ' '}</Text>
            )}
          </View>
        </Animated.View>

        {/* ── Graphique + périodes ── */}
        <View style={{ gap: space[3] }}>
          {points.length > 1 && !hidden ? (
            <InteractiveChart points={points} color={mood === 'down' ? '#FFC9BF' : '#FFF1DC'} width={chartWidth} height={96} onScrub={(p) => { if (p && scrub?.t !== p.t) haptic.selection(); setScrub(p); }} />
          ) : (
            <View style={{ height: 96, alignItems: 'center', justifyContent: 'center' }}>
              {chartLoading || initialLoading ? <Skeleton width="100%" height={96} /> : <Text variant="caption" tone="tertiary">{hidden ? ' ' : t("noHistoryYet")}</Text>}
            </View>
          )}
          <Pills items={PERIODS.map((p) => ({ key: p, label: periodLabels[p] || p }))} value={period} onChange={setPeriod} />
        </View>

        </View>
        </OnSky>

        {/*
          LA FEUILLE : les tuiles d'action sont à cheval sur le bord du ciel,
          puis tout le reste monte sur un fond plein aux coins arrondis.
        */}
        <View style={{ marginHorizontal: -SCREEN_MARGIN, minHeight: windowH }} onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.y + 46); setHeroH((cur) => (cur === h ? cur : h)); }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 46, left: 0, right: 0, bottom: -(insets.bottom + 120), backgroundColor: colors.bg, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl }} />
          <View style={{ flexDirection: 'row', gap: space[2], paddingHorizontal: SCREEN_MARGIN }}>
            <ActionTile index={0} primary tint="send" icon="send" label={t("actionSend")} onPress={() => router.push('/send')} />
            <ActionTile index={1} tint="receive" icon="receive" label={t("actionReceive")} onPress={() => router.push('/receive')} />
            <ActionTile index={2} tint="swap" icon="exchange" label={t("actionSwap")} onPress={() => router.push('/swap')} />
            <ActionTile index={3} tint="earn" icon="staking" label={t("actionEarn")} onPress={() => router.navigate('/earn')} />
          </View>
          <View style={{ paddingHorizontal: SCREEN_MARGIN, paddingTop: space[6], gap: space[6] }}>
        {/* Sauvegarde sautée : bandeau permanent (§4.9) */}
        {!backupVerified && !watchOnly ? (
          <KPressable onPress={() => router.push('/reveal-phrase')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radii.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.warning }}>
            <Icon name="warning" size={18} color={colors.warning} />
            <Text variant="caption" style={{ flex: 1 }}>{t("unverifiedBackupWarning")}</Text>
            <Icon name="chevron" size={14} tone="muted" />
          </KPressable>
        ) : null}

        {/* dApp mise de côté : un geste pour la retrouver telle quelle. */}
        {parked ? (
          <KPressable
            onPress={() => router.navigate('/browser')}
            accessibilityLabel={t('browserBackTo').replace('{site}', hostOf(parked.url))}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.round, backgroundColor: colors.surface2 }}
          >
            <Icon name="dapps" size={16} tone="muted" />
            <Text variant="caption" numberOfLines={1} style={{ maxWidth: 240 }}>{t('browserBackTo').replace('{site}', hostOf(parked.url))}</Text>
            <Icon name="chevron" size={12} tone="muted" />
          </KPressable>
        ) : null}

        {/* Le point de sécurité le plus important qui reste à régler (un seul à la fois). */}
        <HomeNudge />

        {/* ── Tokens · NFT · Activité ── */}
        <View style={{ gap: space[3] }}>
          <TextTabs items={[{ key: 'tokens', label: t("tabTokens") }, { key: 'nft', label: t("tabNft") }, { key: 'activity', label: t("tabActivity") }]} value={tab} onChange={setTab} />

          <Animated.View key={tab} entering={reduceMotion ? undefined : FadeInDown.duration(240)} style={{ gap: space[3] }}>
          {tab === 'tokens' ? (
            <>
            {initialLoading ? (
              <Card padded={false}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }}>
                    <Skeleton width={40} height={40} round />
                    <View style={{ flex: 1, gap: space[2] }}><Skeleton width="50%" /><Skeleton width="30%" height={12} /></View>
                    <Skeleton width={72} />
                  </View>
                ))}
              </Card>
            ) : pf.holdings.length === 0 ? (
              <>
              <Card>
                <EmptyState icon="receive" title={t("emptyTokensTitle")} body={t("emptyTokensBody")} actionLabel={t("actionReceive")} onAction={() => router.push('/receive')} />
                {/* Hors ligne → « réseau injoignable » ; sinon un échec de lecture (RPC, chaîne) : ne pas accuser le réseau. */}
                {pf.error ? <Text variant="caption" tone="warning" style={{ textAlign: 'center' }}>{t(online ? 'balancesLoadFailed' : 'errNetworkOffline')}</Text> : null}
              </Card>
              {testnetSection}
              </>
            ) : (
              <>
                <Card padded={false}>
                  {/*
                    CASCADE À L'ARRIVÉE. `cascadeDelay` était défini dans
                    `ui/motion` et utilisé NULLE PART : les listes apparaissaient
                    d'un bloc, instantanément, et c'est ce qui donnait cette
                    sécheresse. Le décalage ne dépasse pas douze lignes — au-delà
                    il vaut zéro, une attente d'une seconde pour voir une liste
                    n'est plus du raffinement.
                  */}
                  {shownTokens.slice(0, tokenLimit).map((h, i, arr) => (
                    <FadeInUp key={h.id} delay={cascadeDelay(i)}>
                      <TokenRow
                        symbol={h.symbol}
                        name={holdingLabel(h.name, getAdapter(h.chainId).config.name, [h.symbol])}
                        {...(() => {
                          const ic = holdingIcon(h, getAdapter(h.chainId).config, chainIconUrl(h.chainId));
                          return { logo: ic.logo, chainBadge: ic.badge };
                        })()}
                        chainId={h.chainId}
                        address={h.contract ?? h.chainId}
                        balance={`${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`}
                        fiat={h.price > 0 ? `${formatFiat(h.fiat)} ${sym}` : undefined}
                        changePct={h.change24h}
                        spark={h.coingeckoId ? sparks[h.coingeckoId] : undefined}
                        hidden={hidden}
                        onPress={() => openHolding(h)}
                      />
                      {i < arr.length - 1 ? <Divider inset={68} /> : null}
                    </FadeInUp>
                  ))}
                </Card>
                {shownTokens.length > tokenLimit ? (
                  <KPressable onPress={() => setTokenLimit((n) => n + LIST_PAGE)} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
                    <Text variant="caption" style={{ color: colors.primary }}>{fill(t('showMoreCount'), { count: String(shownTokens.length - tokenLimit) })}</Text>
                  </KPressable>
                ) : null}
                {small.length > 0 ? (
                  <KPressable onPress={toggleSmall} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
                    <Text variant="caption" tone="secondary">{showSmall ? t("hideSmallBalances") : fill(t('showSmallBalances'), { count: small.length.toString() })}</Text>
                  </KPressable>
                ) : null}
                {unverified.length > 0 ? (
                  <View style={{ gap: space[2] }}>
                    <KPressable onPress={() => setShowHidden((v) => !v)} style={{ alignSelf: 'center', paddingVertical: space[1] }}>
                      <Text variant="caption" tone="tertiary">{showHidden ? t("hideUnverifiedTokens") : fill(t('showUnverifiedTokens'), { count: unverified.length.toString() })}</Text>
                    </KPressable>
                    {showHidden ? (
                      <Card padded={false} style={{ opacity: 0.75 }}>
                        {unverified.slice(0, unverifiedLimit).map((h, i) => (
                          <React.Fragment key={h.id}>
                            <KPressable noScale onPress={() => openHolding(h)}>
                              <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }}>
                                <TokenIcon symbol={h.symbol} seed={h.contract ?? h.symbol} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text variant="body" tone="secondary" numberOfLines={1}>{h.name} · {getAdapter(h.chainId).config.name}</Text>
                                  <Text variant="caption" tone="warning">{t("unverifiedBadge")}</Text>
                                </View>
                                <Text variant="caption" tone="tertiary" tabular>{formatTokenAmount(h.raw, h.decimals)} {h.symbol}</Text>
                              </View>
                            </KPressable>
                            {i < Math.min(unverified.length, unverifiedLimit) - 1 ? <Divider inset={68} /> : null}
                          </React.Fragment>
                        ))}
                      </Card>
                    ) : null}
                    {showHidden && unverified.length > unverifiedLimit ? (
                      <KPressable onPress={() => setUnverifiedLimit((n) => n + LIST_PAGE)} style={{ alignSelf: 'center', paddingVertical: space[1] }}>
                        <Text variant="caption" tone="tertiary">{fill(t('showMoreCount'), { count: String(unverified.length - unverifiedLimit) })}</Text>
                      </KPressable>
                    ) : null}
                  </View>
                ) : null}
                {/* Réseaux de test : à part, sans valeur, seulement s'ils sont affichés. */}
                {testnetSection}
                {pf.error ? <Text variant="caption" tone="warning" style={{ textAlign: 'center' }}>{t("updateFailed")}{new Date(pf.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</Text> : null}
                {/* Répartition : où est l'argent, par actif ou par réseau, aux couleurs de chacun. */}
                {!hidden ? (
                  <Allocation
                    items={main}
                    labels={{ title: t('allocTitle'), byAsset: t('allocByAsset'), byChain: t('allocByChain'), other: t('allocOther') }}
                  />
                ) : null}
                {/* Le marché vit ici (plus d'onglet) : hausses / baisses du jour, puis l'écran complet. */}
                <MarketPanel />
              </>
            )}
            </>
          ) : tab === 'nft' ? (
            <View style={{ gap: space[3] }}>
            {nfts === null ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} width={(screenW - SCREEN_MARGIN * 2 - space[3]) / 2} height={(screenW - SCREEN_MARGIN * 2 - space[3]) / 2} />)}</View>
            ) : nfts.length === 0 && nftIssues?.nothingAnswered ? (
              <Card><EmptyState icon="warning" title={t('nftLoadFailedTitle')} body={t('nftLoadFailedBody')} actionLabel={t('retry')} onAction={retryNfts} /></Card>
            ) : nfts.length === 0 ? (
              <Card><EmptyState icon="nft" title={t("emptyNftTitle")} body={t("emptyNftBody")} actionLabel={t("actionReceive")} onAction={() => router.push('/receive')} /></Card>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                {nfts.slice(0, nftLimit).map((n) => {
                  const w = (screenW - SCREEN_MARGIN * 2 - space[3]) / 2;
                  return (
                    <KPressable key={`${n.chainId}:${n.contract}:${n.tokenId}`} onPress={() => setOpenNft(n)} style={{ width: w, gap: space[1] }} accessibilityLabel={n.name}>
                      <View style={{ width: w, height: w, borderRadius: radii.md, backgroundColor: colors.surface2, overflow: 'hidden' }}>
                        {n.image ? <Image source={{ uri: n.image }} style={{ width: w, height: w }} resizeMode="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="nft" size={28} tone="faint" /></View>}
                        <View style={{ position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: radii.full, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {chainIconUrl(n.chainId) ? <LogoImage uri={chainIconUrl(n.chainId)!} size={12} /> : null}
                        </View>
                      </View>
                      <Text variant="caption" numberOfLines={1}>{n.name}</Text>
                      <Text variant="micro" tone="tertiary" numberOfLines={1}>{n.collection}</Text>
                    </KPressable>
                  );
                })}
              </View>
            )}
            {nfts && nfts.length > nftLimit ? (
              <KPressable onPress={() => setNftLimit((n) => n + NFT_PAGE)} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
                <Text variant="caption" style={{ color: colors.primary }}>{fill(t('showMoreCount'), { count: String(nfts.length - nftLimit) })}</Text>
              </KPressable>
            ) : null}
            {/* Ce qui n'a pas répondu est NOMMÉ : une liste incomplète ne se fait pas passer pour complète. */}
            {nfts !== null && !nftIssues?.nothingAnswered && nftIssues?.failed.length ? (
              <Text variant="micro" tone="tertiary" style={{ textAlign: 'center' }}>{t('nftPartial').replace('{networks}', nftIssues.failed.map((c) => chainNameOf(c) ?? c).join(', '))}</Text>
            ) : null}
            {nfts !== null && nftIssues?.unavailable.length ? (
              <Text variant="micro" tone="tertiary" style={{ textAlign: 'center' }}>{t('nftUnavailable').replace('{networks}', nftIssues.unavailable.map((c) => chainNameOf(c) ?? c).join(', '))}</Text>
            ) : null}
            </View>
          ) : /*
            TROIS CAS DE LISTE VIDE, et ils ne disent pas la même chose. Un
            chargement en cours mérite un squelette ; un réseau qui n'a jamais
            répondu mérite « indisponible » ; et « aucune activité » ne se dit que
            lorsqu'au moins un réseau a réellement répondu — l'affirmer sans avoir
            pu demander serait un mensonge sur le portefeuille de l'utilisateur.
          */
          recent.length === 0 && recentLoading ? (
            <Card padded={false}>{[0, 1, 2].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center' }}><Skeleton width="70%" /></View>)}</Card>
          ) : recent.length === 0 && !recentFetched ? (
            <Card>
              <EmptyState icon="warning" title={t("activityUnavailableTitle")} body={t("activityUnavailableBody")} />
            </Card>
          ) : recent.length === 0 ? (
            <Card>
              <EmptyState icon="history" title={t("emptyActivityTitle")} body={t("emptyActivityBody")} />
            </Card>
          ) : (
            <>
              <Card padded={false}>
                {recent.map((tx) => ({ tx, h: humanizeTx(tx, humanCtx) })).filter((r) => !r.h.spam).slice(0, 5).map((r, i, arr) => (
                  <FadeInUp key={`${r.tx.chain}:${r.tx.hash}`} delay={cascadeDelay(i)}>
                    <ActivityRow
                      h={r.h}
                      time={new Date(r.tx.timestamp * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      network={chainNameOf(r.tx.chain)}
                      networkIcon={chainIconUrl(r.tx.chain)}
                      tokenLogo={logoOfTx(r.tx)}
                      tokenSeed={r.tx.contract}
                      pendingLabel={t('txPending')}
                      onPress={() => router.push({ pathname: '/tracking', params: { hash: r.tx.hash, chainId: r.tx.chain } })}
                    />
                    {i < arr.length - 1 ? <Divider inset={68} /> : null}
                  </FadeInUp>
                ))}
              </Card>
              <KPressable onPress={() => router.navigate('/activity')} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
                <Text variant="caption" tone="secondary">{t("fullHistory")}</Text>
              </KPressable>
            </>
          )}
          </Animated.View>
        </View>
          </View>
        </View>
      </Animated.ScrollView>
      {/* Fond opaque sous la barre d'état : le contenu ne passe plus « dessous » au scroll. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }, statusBgStyle]} />
      <NftDetailModal
        nft={openNft as NftItem | null}
        explorerUrl={openNft ? getAdapter(openNft.chainId).config.explorerUrl : undefined}
        onClose={() => setOpenNft(null)}
        onSend={openNft && getAdapter(openNft.chainId).config.family === 'ton' ? () => { setSendNft(openNft); setOpenNft(null); } : undefined}
      />
      {sendNft ? (
        <TonNftSendSheet
          chainId={sendNft.chainId}
          nftAddress={sendNft.tokenId}
          name={sendNft.name}
          onClose={() => setSendNft(null)}
          // Le NFT est parti : la liste est relue au prochain affichage de l'onglet.
          onSent={() => { setSendNft(null); if (acct) { nftsRead.current = { key: nftKey, at: Date.now() }; loadNftReport(acct).then(applyNftReport).catch(() => {}); } }}
        />
      ) : null}
    </View>
  );
}
