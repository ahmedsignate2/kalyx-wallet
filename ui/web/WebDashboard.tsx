/**
 * Tableau de bord WEB (desktop) — « le téléphone est le coffre-fort, le web est
 * le tableau de bord ». Aucune seed / clé ici : on se connecte à l'app Kalyx via
 * WalletConnect (QR), on lit les adresses publiques, et on FORWARDE toute action
 * sensible à l'app qui signe. Layout desktop responsive (sidebar + contenu).
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Image, TextInput, useWindowDimensions, Animated, Easing, Linking } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Rect, Defs, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { KalyxLogo } from '../KalyxLogo';
import { InteractiveChart } from '../InteractiveChart';
import { useTelegramBiometric } from './telegramBiometric';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAsync } from './useAsync';
import { AgentPanel, AgentSetup, PROVIDER_LABELS } from './AgentPanel';
import { MarketPanel } from './MarketPanel';
import { WEB_FONTS, useWebFonts, useWebPalette } from './webTheme';
import { useWebT, type WebKey } from './webI18n';
import { useWebPlatform, useTelegramSetup, TelegramAppContext, useTelegramApp, useTelegramBackButton, useTelegramClosingConfirmation, useIdle, useTabHidden, tgHaptic } from './platform';
import { toRaw, encodeErc20Transfer } from './evmEncode';
import { useTokenLogo } from './tokenLogos';
import { FadeInUp, CrossFade, useCountUp, Pop, KalyxSpinner, KalyxSuccessPulse } from './motion';
import { Text as KText, Button, Sheet, Surface, ListRow, Divider } from '../kit';
import { ReceiveScreen } from './ReceiveScreen';
import { SendFlow } from './SendFlow';
import { SwapScreen } from './SwapScreen';
import { Sidebar, TopBar, SectionTitle } from './DesktopChrome';
import { MobileHeader, NetworkPill, ActionRow, PeriodChips, SegmentTabs, MobileEmptyState, FloatingDock, DOCK_CLEARANCE } from './MobileChrome';
import { useAiStore } from '../../lib/aiStore';
import { PROVIDER_DEFAULTS } from '../../lib/aiConfig';
import { Icon, type IconName } from '../icon';
import { fonts, radii, spacing, useTheme } from '../theme';
import { useWebConnect, type WebConnectError } from '../../lib/webConnect';
import { toast } from '../../lib/toast';
import { useSettings, useT, useActivityT, fiatSymbol, FIATS } from '../../lib/settingsStore';
import { useContacts } from '../../lib/contactsStore';
import { useRecentRecipients } from '../../lib/recentRecipientsStore';
import { LANGUAGES } from '../../lib/i18n';
import {
  getAdapter,
  listChains,
  getErc20Tokens,
  getNfts,
  getMarketChartPoints,
  getTokenPrices,
  getPrices,
  formatTokenAmount,
  chainIconUrl,
  humanizeTx,
  type Erc20Token,
  type NftItem,
  type Balance,
  type TxSummary,
  type ChainConfig,
  type ChainFamily,
  type ChartPoint,
  type HumanTx,
} from '../../src';

function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Laiton/or de marque Kalyx — évoque la clé matérielle. Valeur validée après
 *  essai dans une maquette dédiée (proche mais distincte du doré de l'icône
 *  de notification, app.config.ts, qui reste utilisé tel quel côté app). */
const GOLD = '#C89B5C';

/** Formate un montant en devise à la française pour l'euro (« 1,83 € », le
 *  symbole APRÈS avec une espace insécable) — Intl.NumberFormat gère aussi
 *  correctement les autres devises (symbole avant pour $, £…). */
function formatFiatAmount(amount: number, fiat: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: fiat.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${fiat.toUpperCase()}`;
  }
}

/** Couleur déterministe (HSL) dérivée d'une chaîne — même adresse de contrat
 *  → toujours la même couleur, différente d'un token à l'autre (au lieu du
 *  même cercle gris vide pour tous les tokens sans logo). */
function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 45%)`;
}

/** Avatar de token sans logo officiel : 2 lettres sur fond coloré unique
 *  (dérivé de l'adresse du contrat) plutôt qu'un cercle gris vide anonyme. */
function TokenAvatar({ uri: primary, label, seed, size = 32, chainId }: { uri?: string; label: string; seed: string; size?: number; chainId?: string }) {
  const [failed, setFailed] = useState(false);
  // Repli sur la liste curée LI.FI du réseau quand la source principale n'a pas de logo.
  const uri = useTokenLogo(chainId ?? '', chainId ? seed : undefined, primary);
  if (!uri || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(seed), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.36, color: '#fff', fontFamily: fonts.bold }}>{(label || '?').slice(0, 2).toUpperCase()}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

/** Icône de réseau avec repli AUTO sur cercle lettré : chainIconUrl() renvoie
 *  volontairement `undefined` pour certains réseaux (doc : « → cercle lettré
 *  côté UI ») et l'icône distante peut aussi échouer au chargement (404,
 *  host bloqué) — un <Image> nu sans repli laissait une case vide. */
function ChainAvatar({ chain, size = 20 }: { chain: ChainConfig; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = chainIconUrl(chain.id);
  if (!uri || failed) {
    const letter = (chain.nativeSymbol || chain.name || '?').slice(0, 1).toUpperCase();
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.42, color: colors.text, fontFamily: fonts.bold }}>{letter}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.glass }} />;
}

/** Horodatage relatif court (ts en secondes). */
/** « il y a 3 min » dans la langue de l'utilisateur (Intl.RelativeTimeFormat). */
function ago(ts: number, lang = 'fr'): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (s < 60) return rtf.format(0, 'second');
    if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
    if (s < 86400 * 30) return rtf.format(-Math.floor(s / 86400), 'day');
  } catch {
    /* Intl indisponible : date courte */
  }
  return new Date(ts * 1000).toLocaleDateString(lang, { day: '2-digit', month: 'short' });
}

/** Config d'une chaîne Kalyx par son id (repli Ethereum). */
function chainById(id: string | null): ChainConfig {
  const all = listChains();
  return all.find((c) => c.id === id) ?? all.find((c) => c.id === 'ethereum')!;
}

export function WebDashboard() {
  const t = useT();
  const { colors } = useTheme();
  const status = useWebConnect((s) => s.status);
  const init = useWebConnect((s) => s.init);
  const loadAiState = useAiStore((s) => s.loadInitialState);
  const loadSettings = useSettings((s) => s.load);
  const loadContacts = useContacts((s) => s.load);
  const loadRecents = useRecentRecipients((s) => s.load);
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  const P = useWebPalette();
  const tw = useWebT();
  useWebFonts();
  const language = useSettings((s) => s.language);
  const platform = useWebPlatform();
  const tgApp = useTelegramSetup(P.bg);
  const disconnect = useWebConnect((s) => s.disconnect);
  // Web classique : session coupée après 30 min sans interaction (PC partagé,
  // onglet oublié). Dans Telegram, l'app gère elle-même le cycle de vie.
  const idle = useIdle(30 * 60_000, platform === 'web' && status === 'connected');
  useEffect(() => {
    if (!idle) return;
    disconnect().catch(() => {});
    toast.info(tw('sessionIdleClosed'));
  }, [idle, disconnect, tw]);

  useEffect(() => {
    // Sans `catch`, un relay injoignable au chargement produisait un rejet non
    // traité. L'échec est reporté à l'écran par `connect()`, qui le gère.
    init().catch(() => {});
    // app/_layout.tsx saute tout le bootstrap natif sur web (pas de coffre
    // local ici) — mais les préférences (devise, langue, thème), les contacts,
    // les destinataires récents et l'état IA (clé BYOK) sont persistés en kv et
    // doivent être rechargés, sinon tout est oublié à chaque rafraîchissement.
    loadSettings();
    loadContacts();
    loadRecents();
    loadAiState();
  }, [init, loadAiState, loadSettings, loadContacts, loadRecents]);

  // Titre + <html lang/dir> suivent la langue (détectée depuis le navigateur au
  // premier lancement, ou choisie en Réglages) : accessibilité, césure, arabe RTL.
  useEffect(() => {
    const doc = (globalThis as { document?: { title: string; documentElement?: { lang: string; dir: string } } }).document;
    if (!doc) return;
    doc.title = tw('docTitle');
    if (doc.documentElement) {
      doc.documentElement.lang = language;
      doc.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }
  }, [tw, language]);

  return (
    // Fond uni de la maquette (#0B0C0E) partout — le halo laiton derrière le
    // solde est le seul effet lumineux de l'écran.
    <TelegramAppContext.Provider value={tgApp}>
      <View style={{ flex: 1, backgroundColor: P.bg }}>
        {status === 'connected' ? <Dashboard /> : <ConnectView />}
        <SigningModal />
      </View>
    </TelegramAppContext.Provider>
  );
}

/** Popup plein écran « Signature requise — ouvrez Kalyx ». Piloté par `pending`
 *  du store : s'affiche dès qu'une action est envoyée au téléphone, se referme
 *  seul au succès (retour au tableau de bord), reste sur erreur pour explication. */
function SigningModal() {
  const t = useT();
  const tw = useWebT();
  const { colors, typography } = useTheme();
  const pending = useWebConnect((s) => s.pending);
  const dismiss = useWebConnect((s) => s.dismissPending);
  if (!pending) return null;
  const { phase, label, detail } = pending;
  const accent = phase === 'ok' ? colors.up : phase === 'err' ? colors.danger : colors.accent;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, backgroundColor: 'rgba(4,6,12,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
      <View style={{ width: '100%', maxWidth: 380, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.lg, padding: spacing(3), alignItems: 'center', gap: spacing(1.25) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
          {phase === 'await' ? (
            <KalyxSpinner size={30} />
          ) : phase === 'ok' ? (
            <KalyxSuccessPulse size={56} ringColor={accent} />
          ) : (
            <Icon name="warning" size={28} color={accent} />
          )}
        </View>
        <Text style={{ color: colors.text, fontSize: 19, fontFamily: fonts.bold, textAlign: 'center' }}>
          {phase === 'ok' ? tw('signApproved') : phase === 'err' ? tw('signRejected') : tw('signRequired')}
        </Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          {phase === 'await'
            ? tw('signAwaitBody', { label })
            : detail ?? ''}
        </Text>
        {phase === 'await' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing(0.5) }}>
            <Icon name="bell" size={14} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
              {tw('signNotifHint')}
            </Text>
          </View>
        ) : null}
        {phase !== 'await' ? (
          <Pressable onPress={dismiss} style={({ pressed }) => ({ marginTop: spacing(1), alignSelf: 'stretch', alignItems: 'center', backgroundColor: phase === 'ok' ? colors.accent : 'transparent', borderWidth: 1, borderColor: phase === 'ok' ? colors.accent : colors.glassBorder, borderRadius: radii.pill, paddingVertical: spacing(1.2), opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: phase === 'ok' ? colors.onPrimary : colors.text, fontFamily: fonts.semibold }}>{t("aiClose")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Connexion */

/** Code d'échec de connexion → clé de traduction. Une table, pas un `switch`
 *  dispersé : un code ajouté au magasin sans sa phrase casse la compilation. */
const CONN_ERROR_KEYS: Record<WebConnectError, WebKey> = {
  IDLE_EXPIRED: 'connErrIdleExpired',
  MISSING_PROJECT_ID: 'connErrMissingProjectId',
  CONNECT_FAILED: 'connErrConnectFailed',
  NO_ACCOUNTS: 'connErrNoAccounts',
};

function ConnectView() {
  const t = useT();
  const tw = useWebT();
  const [installOpen, setInstallOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  // Téléphone/tablette : l'app Kalyx est probablement sur CET appareil.
  const isPhone = /android|iphone|ipad|ipod|mobile/i.test((globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? '');
  // 1) deep link kalyx://wc?uri=… : l'app s'ouvre, CET onglet reste ouvert et
  //    reçoit l'approbation WalletConnect. 2) Si rien ne s'est passé après 1,5 s
  //    (app absente), on ouvre la page relais kalyxwallet.com/wc dans un nouvel
  //    onglet — elle propose l'installation — sans perdre le tableau de bord.
  const openInKalyx = (wcUri: string) => {
    const g = globalThis as { location?: { href: string }; document?: { hidden?: boolean }; open?: (u: string, target?: string, f?: string) => unknown };
    const encoded = encodeURIComponent(wcUri);
    if (g.location) g.location.href = `kalyx://wc?uri=${encoded}`;
    setTimeout(() => {
      if (!g.document?.hidden) g.open?.(`https://kalyxwallet.com/wc?uri=${encoded}`, '_blank', 'noopener,noreferrer');
    }, 1500);
  };
  const { colors, typography } = useTheme();
  const status = useWebConnect((s) => s.status);
  const uri = useWebConnect((s) => s.uri);
  const error = useWebConnect((s) => s.error);
  const connect = useWebConnect((s) => s.connect);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
      <View style={{ alignItems: 'center', gap: spacing(2), maxWidth: 420 }}>
        <KalyxLogo size={72} />
        <Text style={{ color: colors.text, fontSize: 28, fontFamily: fonts.extrabold, textAlign: 'center' }}>
          {tw('connectTitle')}
        </Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          {tw('connectBody')}
        </Text>

        {!uri ? (
          <View style={{ gap: spacing(0.75), alignSelf: 'stretch', marginTop: spacing(0.5) }}>
            {[
              tw('guaranteeNoKeys'),
              tw('guaranteeSign'),
              tw('guaranteeReadOnly'),
            ].map((line) => (
              <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                <Icon name="check" size={16} color={colors.up} />
                <Text style={[typography.muted, { flex: 1 }]}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {uri ? (
          <View style={{ alignItems: 'center', gap: spacing(1.5), marginTop: spacing(1), width: '100%' }}>
            {/* Sur téléphone, on ne peut pas scanner son propre écran : le lien
                universel ouvre directement l'app Kalyx installée (ou propose de
                l'installer). Le QR reste disponible pour un autre appareil. */}
            {isPhone ? (
              <>
                <Pressable
                  onPress={() => openInKalyx(uri)}
                  style={({ pressed }) => ({ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1), backgroundColor: GOLD, borderRadius: radii.pill, paddingVertical: spacing(1.5), opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
                >
                  <Icon name="walletconnect" size={20} color="#171310" />
                  <Text style={{ color: '#171310', fontFamily: fonts.bold, fontSize: 16 }}>{tw('openInKalyx')}</Text>
                </Pressable>
                <Text style={[typography.muted, { textAlign: 'center', fontSize: 13 }]}>{tw('sameDeviceHint')}</Text>
                <Pressable onPress={() => setShowQr((v) => !v)} hitSlop={8}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>{showQr ? tw('hideQr') : tw('showQr')}</Text>
                </Pressable>
              </>
            ) : null}
            {!isPhone || showQr ? (
              <>
                <View style={{ backgroundColor: '#fff', padding: spacing(2), borderRadius: radii.lg }}>
                  <QRCode value={uri} size={220} />
                </View>
                <Text style={[typography.muted, { textAlign: 'center' }]}>
                  {isPhone ? tw('otherDeviceHint') : tw('scanHint')}
                </Text>
              </>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), width: '100%' }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.glassBorder }} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tw('or')}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.glassBorder }} />
            </View>
            <CopyUriButton uri={uri} />
            <Text style={[typography.muted, { textAlign: 'center', fontSize: 12 }]}>
              {tw('pasteHint')}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={connect}
            disabled={status === 'connecting'}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: spacing(1),
              backgroundColor: colors.accent, borderRadius: radii.pill,
              paddingVertical: spacing(1.5), paddingHorizontal: spacing(3),
              opacity: pressed || status === 'connecting' ? 0.7 : 1, marginTop: spacing(1),
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            {status === 'connecting' ? <KalyxSpinner size={20} /> : <Icon name="walletconnect" size={20} color={colors.onPrimary} />}
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
              {status === 'connecting' ? t('connecting') : tw('connectKalyx')}
            </Text>
          </Pressable>
        )}

        {/* Le magasin ne porte qu'un code : la phrase est choisie ici, dans la
            langue de l'utilisateur. Avant, le message du magasin — français, ou
            brut du SDK WalletConnect — arrivait tel quel à l'écran. */}
        {error ? <Text style={{ color: colors.danger, textAlign: 'center' }}>{tw(CONN_ERROR_KEYS[error])}</Text> : null}

        <Pressable onPress={() => setInstallOpen(true)} hitSlop={8} style={({ pressed }) => ({ marginTop: spacing(1.5), flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
          <Icon name="import" size={14} color={GOLD} />
          <Text style={{ color: GOLD, fontFamily: fonts.semibold, fontSize: 13, textDecorationLine: 'underline' }}>{tw('noAppYet')}</Text>
        </Pressable>
      </View>

      <InstallSheet visible={installOpen} onClose={() => setInstallOpen(false)} />
    </View>
  );
}

/** Lien unique et évolutif : détecte l'appareil et sert l'APK signé de la dernière
 *  release (ou le store adapté). Le même que le bouton « Partager » de l'app. */
const DOWNLOAD_URL = 'https://kalyxwallet.com/download';

/** « Pas encore l'app ? » — pourquoi le téléphone est indispensable, les trois
 *  étapes, et le bouton vers la dernière version. */
function InstallSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const tw = useWebT();
  const { colors, typography } = useTheme();
  const steps = [tw('installStep1'), tw('installStep2'), tw('installStep3')];
  const open = () => {
    const w = (globalThis as { open?: (u: string, target?: string, features?: string) => unknown }).open;
    w?.(DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: GOLD + '1F', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="security" size={22} color={GOLD} />
        </View>
        <KText variant="title2" style={{ flex: 1 }}>{tw('installTitle')}</KText>
      </View>
      <KText variant="bodySecondary" tone="secondary">{tw('installWhy')}</KText>
      <KText variant="caption" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{tw('installStepsTitle')}</KText>
      <Surface padded={false}>
        {steps.map((st, i) => (
          <React.Fragment key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1.5), padding: spacing(1.5) }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#171310', fontFamily: fonts.bold, fontSize: 13 }}>{i + 1}</Text>
              </View>
              <Text style={[typography.body, { flex: 1, color: colors.text }]}>{st}</Text>
            </View>
            {i < steps.length - 1 ? <Divider inset={16} /> : null}
          </React.Fragment>
        ))}
      </Surface>
      <Button label={tw('installCta')} icon="import" onPress={open} />
      <KText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{tw('installNote')}</KText>
    </Sheet>
  );
}

/** Copie le lien wc: — alternative au scan QR (même flux que « Coller » sur
 *  l'écran WalletConnect de l'app mobile). */
function CopyUriButton({ uri }: { uri: string }) {
  const { colors } = useTheme();
  const tw = useWebT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(uri);
    setCopied(true);
    toast.success(tw('linkCopied'));
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Pressable
      onPress={copy}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing(1),
        borderRadius: radii.pill, borderWidth: 1, borderColor: copied ? colors.up : colors.glassBorder,
        paddingVertical: spacing(1), paddingHorizontal: spacing(2.5), opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? colors.up : colors.textMuted} />
      <Text style={{ color: copied ? colors.up : colors.text, fontFamily: fonts.semibold, fontSize: 14 }}>
        {copied ? tw('linkCopied') : tw('copyConnectLink')}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Dashboard */

/** Valeur d'une chaîne connectée (natif + tokens) pour le net worth cross-chain. */
interface ChainWorth {
  chain: ChainConfig;
  address: string;
  price: number; // prix spot de l'actif natif (fiat)
  native: number; // valeur fiat de l'actif natif
  tokens: number; // valeur fiat des tokens ERC-20 (EVM)
  value: number; // native + tokens
  change24h: number; // variation 24h de l'actif natif (%)
}
interface NetWorth {
  total: number;
  change24h: number; // variation 24h pondérée par la valeur native
  slices: ChainWorth[];
}

/** Agrège la valeur de TOUTES les chaînes connectées (une source unique pour le
 *  total, le donut de répartition et la watchlist). Prix natifs en un seul appel. */
function useNetWorth(): { data: NetWorth | null; loading: boolean } {
  const accounts = useWebConnect((s) => s.accounts);
  const fiat = useSettings((s) => s.fiat);
  const rev = useWebConnect((s) => s.rev);
  const key = accounts.map((a) => `${a.chainId}:${a.address}`).join(',');
  return useAsync<NetWorth>(async () => {
    if (!accounts.length) return { total: 0, change24h: 0, slices: [] };
    const entries = accounts.map((a) => ({ acc: a, chain: chainById(a.chainId) }));
    const ids = [...new Set(entries.map((e) => e.chain.coingeckoId).filter(Boolean))] as string[];
    /*
     * LES PRIX N'ATTENDENT PLUS, ET RIEN NE LES ATTEND.
     *
     * Ils étaient récupérés avec `await` AVANT la moindre lecture de solde : un
     * CoinGecko lent ou limité en débit retardait tout l'écran, alors qu'un prix
     * ne sert qu'à convertir un solde déjà connu. Même défaut, même correction que
     * dans le magasin de portefeuille de l'app mobile.
     */
    const pricesP = getPrices(ids, fiat).catch(
      () => ({}) as Record<string, { price: number; change24h: number }>,
    );
    const slices = await Promise.all(
      entries.map(async ({ acc, chain }): Promise<ChainWorth> => {
        let native = 0;
        let change24h = 0;
        let tokens = 0;
        let price = 0;
        try {
          // Le solde part tout de suite ; les prix arrivent en parallèle.
          const [bal, prices] = await Promise.all([getAdapter(chain.id).getBalance(acc.address), pricesP]);
          const p = chain.coingeckoId ? prices[chain.coingeckoId] : undefined;
          price = p?.price ?? 0;
          native = (Number(bal.raw) / 10 ** bal.decimals) * price;
          change24h = p?.change24h ?? 0;
        } catch {
          /* réseau indisponible : chaîne à 0 */
        }
        if (chain.family === 'evm' && chain.coingeckoPlatform) {
          try {
            const tks = await getErc20Tokens(chain, acc.address);
            if (tks.length) {
              const tp = await getTokenPrices(chain.coingeckoPlatform, tks.map((t) => t.contract), fiat);
              tokens = tks.reduce((s, t) => s + (Number(t.raw) / 10 ** t.decimals) * (tp[t.contract.toLowerCase()] ?? 0), 0);
            }
          } catch {
            /* pas de clé / indispo : tokens à 0 */
          }
        }
        return { chain, address: acc.address, price, native, tokens, value: native + tokens, change24h };
      }),
    );
    const total = slices.reduce((s, x) => s + x.value, 0);
    const nativeSum = slices.reduce((s, x) => s + x.native, 0);
    const change24h = nativeSum > 0 ? slices.reduce((s, x) => s + x.change24h * x.native, 0) / nativeSum : 0;
    return { total, change24h, slices };
  }, [key, fiat, rev]);
}

type MobileTab = 'home' | 'market' | 'agent' | 'settings';
type ActionSheetKind = 'send' | 'receive' | 'swap';


/** Feuille plein écran (Envoyer/Recevoir/Swap) — remplace tout l'écran sur
 *  mobile plutôt que d'empiler ces panneaux dans le flux, avec un retour. */
function ActionSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgDeep, zIndex: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), padding: spacing(2), borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}>
        <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glass }}>
          <Icon name="back" size={16} color={colors.text} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontFamily: fonts.bold }}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing(2), gap: spacing(2) }}>{children}</ScrollView>
    </View>
  );
}

/** Héberge un parcours plein écran : tel quel sur mobile ; sur desktop, colonne
 *  centrée (largeur téléphone) sur un voile, clic à côté pour fermer. */
function FlowHost({ narrow, onDismiss, children }: { narrow: boolean; onDismiss: () => void; children: React.ReactNode }) {
  if (narrow) return <>{children}</>;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
      <Pressable onPress={onDismiss} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      <View style={{ width: '100%', maxWidth: 480, flex: 1, maxHeight: 860, borderRadius: radii.xl, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function Dashboard() {
  const t = useT();
  const tw = useWebT();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const accounts = useWebConnect((s) => s.accounts);
  const selected = useWebConnect((s) => s.selected);
  const refresh = useWebConnect((s) => s.refresh);
  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 700);
  };
  const chain = useMemo(() => chainById(selected), [selected]);
  const address = useMemo(() => accounts.find((a) => a.chainId === selected)?.address ?? '', [accounts, selected]);
  const worth = useNetWorth();
  // Téléphone : dock + un onglet à la fois ; ordinateur : barre latérale +
  // colonne de contenu. Envoyer / Recevoir / Swap : mêmes parcours plein écran.
  const narrow = width < 760;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MobileTab>('home');
  const [sheet, setSheet] = useState<ActionSheetKind | null>(null);
  const [networkSheet, setNetworkSheet] = useState(false);
  // Telegram : le bouton Retour natif ferme la feuille ouverte (sinon il
  // fermerait la mini-app entière).
  const tgApp = useTelegramApp();
  const closeOverlay = useCallback(() => { setSheet(null); setNetworkSheet(false); }, []);
  useTelegramBackButton(tgApp, !!sheet || networkSheet, closeOverlay);
  // Fermer la mini-app pendant un envoi ou un swap laisse l'utilisateur sans
  // savoir si la transaction est partie : Telegram demande alors confirmation.
  // Uniquement pendant ces parcours — sinon l'alerte apparaîtrait à chaque sortie.
  useTelegramClosingConfirmation(tgApp, sheet === 'send' || sheet === 'swap');
  const openSheet = (k: ActionSheetKind) => { tgHaptic(tgApp, 'light'); setSheet(k); };

  const heroData = useHeroData({ worth, chain, address });
  const peerName = useWebConnect((s) => s.peerName);
  const lastActivity = useWebConnect((s) => s.lastActivity);
  const disconnect = useWebConnect((s) => s.disconnect);
  const language = useSettings((s) => s.language);
  const P = useWebPalette();
  const tabLabels: Record<MobileTab, string> = { home: t("navHome"), market: t("navMarket"), agent: tw('agentTab'), settings: t("settings") };
  const actionRow = (
    <ActionRow
      onReceive={() => openSheet('receive')}
      onSend={() => openSheet('send')}
      onSwap={() => openSheet('swap')}
      labels={{ receive: t("receive"), send: t("send"), swap: t("swapAction") }}
    />
  );
  // Accueil : un seul flux continu (solde avec halo → période + tendance →
  // 3 actions → onglets Tokens / NFT / Activité), identique mobile et desktop.
  const homeFlow = (
    <>
      <MobileHero data={heroData} chain={chain} address={address} large={!narrow} />
      <MobileTrend data={heroData} chain={chain} />
      {actionRow}
      <MobileAssets data={heroData} chain={chain} address={address} onReceive={() => openSheet('receive')} />
    </>
  );
  const settingsFlow = (
    <>
      <SecurityPanel />
      <SettingsPanel />
    </>
  );

  /* ------------------------------------------------------------ Mobile */
  const mobileHeader = (
    <>
      <MobileHeader onRefresh={onPullRefresh} refreshing={refreshing} subtitle={tw('securedWallet')} />
      <NetworkPill avatar={<ChainAvatar chain={chain} size={14} />} name={chain.name} onPress={() => setNetworkSheet(true)} />
    </>
  );
  // L'onglet Agent a besoin d'un vrai conteneur flex NON scrollable (le chat
  // gère son propre scroll interne) — dans un ScrollView, flex:1/dvh ne
  // représentent rien de fiable et poussaient la saisie sous le dock.
  const mobileContent = tab === 'agent' ? (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 22, paddingBottom: DOCK_CLEARANCE + insets.bottom, gap: 20 }}>
      {mobileHeader}
      <View style={{ flex: 1 }}>
        <AgentPanel chain={chain} address={address} worth={worth} />
      </View>
    </View>
  ) : (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ minHeight: '100%', alignItems: 'center' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.text} colors={[colors.text]} />}
    >
      <View style={{ width: '100%', maxWidth: 430, paddingHorizontal: 20, paddingTop: 22, paddingBottom: DOCK_CLEARANCE, gap: 26 }}>
        {mobileHeader}
        <CrossFade id={tab} style={{ gap: tab === 'home' ? 26 : spacing(2) }}>
          {tab === 'home' ? homeFlow : tab === 'market' ? <MarketPanel /> : settingsFlow}
        </CrossFade>
      </View>
    </ScrollView>
  );

  /* ----------------------------------------------------------- Desktop */
  // Barre latérale (rail d'icônes sous 1100 px) + colonne de contenu. Sur
  // l'accueil, un rail Marché à droite dès 1320 px. Même système visuel que
  // le mobile : pas de cartes empilées, hero sans carte, onglets soulignés.
  const rail = width < 1100;
  const showMarketRail = width >= 1320 && tab === 'home';
  const desktopContent = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flex: 1, paddingHorizontal: 36, paddingTop: 24, gap: 24 }}>
        <TopBar title={tabLabels[tab]} trust={tw('trustLine')} onRefresh={onPullRefresh} refreshing={refreshing} />
        {tab === 'agent' ? (
          <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: 880, paddingBottom: 24 }}>
            <AgentPanel chain={chain} address={address} worth={worth} />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <CrossFade id={tab} style={{ flexDirection: 'row', gap: 40, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0, maxWidth: tab === 'home' ? 760 : tab === 'settings' ? 680 : 960, gap: tab === 'home' ? 28 : 24 }}>
                {tab === 'home' ? homeFlow : tab === 'market' ? <MarketPanel /> : settingsFlow}
              </View>
              {showMarketRail ? (
                <View style={{ width: 380, gap: 14 }}>
                  <SectionTitle>{t("navMarket")}</SectionTitle>
                  <MarketPanel />
                </View>
              ) : null}
            </CrossFade>
          </ScrollView>
        )}
      </View>
    </View>
  );
  const desktopShell = (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: P.bg }}>
      <Sidebar
        rail={rail}
        tab={tab}
        onChange={setTab}
        labels={tabLabels}
        subtitle={tw('securedWallet')}
        network={{ avatar: <ChainAvatar chain={chain} size={16} />, name: chain.name }}
        onNetwork={() => setNetworkSheet(true)}
        status={{ title: peerName ?? tw('kalyxWallet'), detail: `${tw('lastActivity')} · ${ago(Math.floor(lastActivity / 1000), language)}`, disconnectLabel: tw('disconnectDevice') }}
        onDisconnect={() => { disconnect().catch(() => {}); }}
      />
      {desktopContent}
    </View>
  );

  const scrollContent = narrow ? mobileContent : desktopShell;

  return (
    <View style={{ flex: 1 }}>
      {scrollContent}
      {narrow ? (
        <FloatingDock
          tab={tab}
          onChange={setTab}
          onSwapPress={() => openSheet('swap')}
          labels={{ home: t("navHome"), market: t("navMarket"), agent: tw('agentTab'), settings: t("settings") }}
        />
      ) : null}
      {sheet ? (
        <FlowHost narrow={narrow} onDismiss={() => setSheet(null)}>
          {sheet === 'receive' ? <ReceiveScreen chain={chain} onClose={() => setSheet(null)} /> : null}
          {sheet === 'send' ? <SendFlow chain={chain} onClose={() => setSheet(null)} onReceive={() => setSheet('receive')} /> : null}
          {sheet === 'swap' ? <SwapScreen chain={chain} onClose={() => setSheet(null)} /> : null}
        </FlowHost>
      ) : null}
      {networkSheet ? (
        <FlowHost narrow={narrow} onDismiss={() => setNetworkSheet(false)}>
          <ActionSheet title={t("networks")} onClose={() => setNetworkSheet(false)}>
            <NetworkSelector vertical onSelected={() => setNetworkSheet(false)} />
          </ActionSheet>
        </FlowHost>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------------- Panels */

/** Style « verre » (fond très légèrement teinté + bordure fine) plutôt qu'un
 *  aplat gris à bordure épaisse — donne de la profondeur par calques au lieu
 *  d'empiler des boîtes dures. `colors.text` sert de base : quasi-blanc en
 *  thème sombre → un voile blanc à 3 % ; quasi-noir en clair → un voile noir
 *  à 3 % — s'adapte aux deux thèmes sans dupliquer la logique. */
function Card({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.lg, padding: spacing(2) }}>
      {children}
    </View>
  );
}



/** État vide soigné (icône + titre + sous-titre), centré — jamais de détail
 *  technique (clé API manquante, etc.) exposé à l'utilisateur. Remplit aussi
 *  l'espace d'un onglet court au lieu d'un petit encart en haut d'un grand vide. */
function EmptyState({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: spacing(1), paddingVertical: spacing(6), minHeight: 220 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color={colors.textMuted} />
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 15 }}>{title}</Text>
      <Text style={[typography.muted, { textAlign: 'center', maxWidth: 260 }]}>{subtitle}</Text>
    </View>
  );
}

/** Barre grise pulsée (placeholder de chargement). */
/** Effet « shimmer » (bande de lumière qui balaie) plutôt qu'un simple pouls
 *  d'opacité — plus fluide, façon skeleton des apps fintech modernes. */
function Skeleton({ w = '100%', h, r = 8, style }: { w?: number | string; h: number; r?: number; style?: object }) {
  const t = useT();
  const { colors } = useTheme();
  const gradId = `shimmer-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const band = Math.max(width * 0.5, 40);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-band, width] });
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[{ width: w as number, height: h, borderRadius: r, backgroundColor: colors.glassStrong, overflow: 'hidden' }, style]}>
      {width > 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: band, transform: [{ translateX }] }}>
          <Svg width={band} height={h}>
            <Defs>
              <SvgGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.text} stopOpacity={0} />
                <Stop offset="0.5" stopColor={colors.text} stopOpacity={0.14} />
                <Stop offset="1" stopColor={colors.text} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            <Rect width={band} height={h} fill={`url(#${gradId})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Lignes de chargement (icône ronde + 2 barres + valeur), pour tokens/historique. */
function SkeletonRows({ count = 4, flat }: { count?: number; flat?: boolean }) {
  const t = useT();
  const { colors } = useTheme();
  const Wrap = flat ? View : Card;
  return (
    <Wrap>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
          <Skeleton w={32} h={32} r={16} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton w={90} h={12} />
            <Skeleton w={140} h={10} />
          </View>
          <Skeleton w={60} h={12} />
        </View>
      ))}
    </Wrap>
  );
}



const PERIOD_KEYS: { k: string; l: 'periodDay' | 'periodWeek' | 'periodMonth' | 'periodYear' | 'periodAll' }[] = [
  { k: '1', l: 'periodDay' },
  { k: '7', l: 'periodWeek' },
  { k: '30', l: 'periodMonth' },
  { k: '365', l: 'periodYear' },
  { k: 'max', l: 'periodAll' },
];
function usePeriods(): { k: string; l: string }[] {
  const tw = useWebT();
  return PERIOD_KEYS.map((p) => ({ k: p.k, l: tw(p.l) }));
}


/** Bloc « héros » : valeur totale cross-chain + variation du jour + widgets +
 *  graphique de tendance du réseau sélectionné (24 h / 7 j / 1 mois). */
/** Données + calculs du bloc « héros », partagés par les 3 présentations
 *  (carte solde, ligne de widgets, carte tendance) — un seul jeu d'appels
 *  réseau, peu importe l'ordre dans lequel on les affiche à l'écran. */
function useHeroData({ worth, chain, address }: { worth: { data: NetWorth | null }; chain: ChainConfig; address: string }) {
  const fiat = useSettings((s) => s.fiat);
  const rev = useWebConnect((s) => s.rev);
  const sym = fiatSymbol(fiat);
  // '1' (24h) par défaut, pas '7' : la carte "Valeur totale" affiche toujours
  // la variation du JOUR — si "Tendance" démarrait sur 7 jours, les deux
  // pourcentages semblaient se contredire (ex. +4,6 % vs -2,4 %) alors que ce
  // sont juste deux périodes différentes. Même période par défaut partout.
  const [days, setDays] = useState('1');
  const { data: bal } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address, rev]);
  // Points horodatés (pas juste les prix) : le graphique est scrubable au
  // doigt/à la souris (InteractiveChart, déjà utilisé et testé côté app
  // mobile sur l'écran token) et affiche prix + heure exacts sous le curseur.
  const { data: points, loading } = useAsync<ChartPoint[]>(
    () => (chain.coingeckoId ? getMarketChartPoints(chain.coingeckoId, fiat, days) : Promise.resolve([])),
    [chain.coingeckoId, fiat, days, rev],
  );
  // Prix brut de l'actif natif (pas la valeur du portefeuille) : avec un petit
  // solde, « valeur = prix × solde » restait plate à ~0 quel que soit le
  // marché — le prix, lui, bouge réellement et correspond à ce qu'annonce le
  // titre « Tendance <réseau> ».
  const values = (points ?? []).map((p) => p.v);
  const first = values.length ? values[0] : 0;
  const cur = values.length ? values[values.length - 1] : 0;
  const pct = first > 0 ? ((cur - first) / first) * 100 : 0;
  const up = pct >= 0;
  const total = worth.data?.total ?? null;
  const today = worth.data?.change24h ?? 0;
  const todayUp = today >= 0;
  const slice = worth.data?.slices.find((s) => s.chain.id === chain.id);
  const nativeChange = slice?.change24h ?? 0;
  const price = slice?.price ?? (values.length ? values[values.length - 1] : 0);
  return { sym, days, setDays, bal, points, loading, values, pct, up, total, today, todayUp, nativeChange, price };
}
type HeroData = ReturnType<typeof useHeroData>;



/** Carte « Tendance » (graphique + sélecteur de période). */
/** Date du point scrubbé — heure pour la période 24 h, date sinon (même
 *  convention que l'écran token de l'app mobile). */
function formatScrubDate(ts: number, days: string): string {
  const d = new Date(ts);
  if (days === '1') return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days === '365' || days === 'max') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}



/* ------------------------------------------------- Accueil mobile (maquette) */

/** « 1,84 » + « € » séparés pour afficher le symbole plus petit et grisé. */
function formatFiatParts(amount: number, fiat: string): { number: string; symbol: string } {
  try {
    const parts = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: fiat.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(amount);
    const symbol = parts.filter((p) => p.type === 'currency').map((p) => p.value).join('');
    const number = parts.filter((p) => p.type !== 'currency' && p.type !== 'literal').map((p) => p.value).join('');
    return { number: number || amount.toFixed(2), symbol: symbol || fiatSymbol(fiat) };
  } catch {
    return { number: amount.toFixed(2), symbol: fiatSymbol(fiat) };
  }
}

/** Solde sans carte : halo laiton diffus derrière le montant, libellé, montant
 *  44 px (Space Grotesk) + symbole 22 px grisé, variation absolue + % du jour,
 *  pilule d'adresse mono, ligne de confiance. Œil masquer/révéler à droite
 *  du libellé (biométrie Telegram quand disponible — affichage seulement). */
function MobileHero({ data, chain, address, large }: { data: HeroData; chain: ChainConfig; address: string; large?: boolean }) {
  const P = useWebPalette();
  const t = useT();
  const tw = useWebT();
  const fiat = useSettings((s) => s.fiat);
  const { total, today, todayUp } = data;
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const tg = useTelegramBiometric();
  // Confidentialité : le solde se masque seul après 2 min sans interaction ou
  // quand l'onglet passe en arrière-plan (écran partagé, PC laissé ouvert) ;
  // un tap sur l'œil le révèle à nouveau.
  const idle = useIdle(120_000, true);
  const tabHidden = useTabHidden();
  useEffect(() => { if (idle || tabHidden) setHidden(true); }, [idle, tabHidden]);
  const isHidden = tg.available ? !tg.unlocked : hidden;
  const onToggleHidden = () => {
    if (tg.available) {
      if (tg.unlocked) tg.lock();
      else tg.unlock(tw('showBalancePrompt'));
    } else {
      setHidden((v) => !v);
    }
  };
  const copyAddress = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    toast.success(t('addressCopied'));
    setTimeout(() => setCopied(false), 1500);
  };
  // Le montant « compte » vers sa nouvelle valeur au lieu de sauter.
  const shownTotal = useCountUp(total);
  const parts = shownTotal != null ? formatFiatParts(shownTotal, fiat) : null;
  // change24h est un % : on en déduit la variation absolue du jour.
  const absChange = total != null ? total - total / (1 + today / 100) : 0;
  const changeColor = todayUp ? P.up : P.down;
  return (
    <View style={{ position: 'relative', paddingTop: 6 }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: 220, height: 220, left: '50%', top: -50, marginLeft: -110 }}>
        <Svg width={220} height={220} viewBox="0 0 220 220" pointerEvents="none">
          <Defs>
            <RadialGradient id="mobileHeroGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={P.accent} stopOpacity={0.16} />
              <Stop offset="0.55" stopColor={P.accent} stopOpacity={0.07} />
              <Stop offset="1" stopColor={P.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="220" height="220" fill="url(#mobileHeroGlow)" />
        </Svg>
      </View>
      <View style={{ gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 13, color: P.muted }}>{t('totalValue')}</Text>
          <Pressable onPress={onToggleHidden} hitSlop={8}>
            <Icon name={isHidden ? 'eyeOff' : tg.available ? (tg.biometricType === 'face' ? 'security' : 'lock') : 'eye'} size={14} color={P.faint} />
          </Pressable>
        </View>
        {parts == null ? (
          <Skeleton w={180} h={48} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '700', fontSize: large ? 56 : 44, lineHeight: large ? 62 : 50, color: P.text, letterSpacing: large ? -0.8 : -0.44, fontVariant: ['tabular-nums'] }}>
              {isHidden ? '••••' : parts.number}
            </Text>
            <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: large ? 26 : 22, color: P.muted }}>{parts.symbol}</Text>
          </View>
        )}
        {parts != null && !isHidden ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={todayUp ? 'send' : 'receive'} size={12} color={changeColor} weight="bold" />
            <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '500', fontSize: 13, color: changeColor }}>
              {`${todayUp ? '+' : '-'}${formatFiatAmount(Math.abs(absChange), fiat)} · ${todayUp ? '+' : '-'}${Math.abs(today).toFixed(2)} % ${t('today')}`}
            </Text>
          </View>
        ) : null}
        <View style={{ gap: 10, marginTop: 10 }}>
          {address ? (
            <View style={{ flexDirection: 'row' }}>
              <Pressable onPress={copyAddress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, opacity: pressed ? 0.7 : 1 })}>
                <Text style={{ fontFamily: WEB_FONTS.mono, fontSize: 12, color: P.muted }}>{short(address)}</Text>
                <Pop trigger={copied}><Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? P.up : P.muted} /></Pop>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="security" size={14} color={P.accent} />
            <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 12, color: P.muted }}>{tw('trustLine')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Tendance sans carte : chips de période, graphique scrubable, puis ligne
 *  « Prix de l'ETH · 2 245,01 € · -2,45 % · 24 h » séparée par un trait. */
function MobileTrend({ data, chain }: { data: HeroData; chain: ChainConfig }) {
  const P = useWebPalette();
  const tw = useWebT();
  const PERIODS = usePeriods();
  const fiat = useSettings((s) => s.fiat);
  const { days, setDays, values, points, up, pct, loading, price, nativeChange } = data;
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [w, setW] = useState(0);
  if (!chain.coingeckoId) return null;
  const lineColor = up ? P.up : P.down;
  const changeColor = nativeChange >= 0 ? P.up : P.down;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PeriodChips options={PERIODS} value={days} onChange={setDays} />
        {scrub ? (
          <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 12, color: P.text }} numberOfLines={1}>
            {`${formatFiatAmount(scrub.v, fiat)} · ${formatScrubDate(scrub.t, days)}`}
          </Text>
        ) : values.length ? (
          <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 12, color: lineColor }}>{`${up ? '+' : ''}${pct.toFixed(2)} %`}</Text>
        ) : null}
      </View>
      {loading && !values.length ? (
        <Skeleton h={130} r={12} />
      ) : (points?.length ?? 0) > 1 ? (
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {w > 0 ? <InteractiveChart points={points!} color={lineColor} width={w} height={130} onScrub={setScrub} /> : null}
        </View>
      ) : (
        <View style={{ height: 130, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 13, color: P.muted }}>{tw('noPriceData')}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: P.divider }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: P.surfaceHi, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <ChainAvatar chain={chain} size={14} />
          </View>
          <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 13, color: P.text2 }}>{tw('priceOf', { symbol: chain.nativeSymbol })}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 14, color: P.text, fontVariant: ['tabular-nums'] }}>{price ? formatFiatAmount(price, fiat) : '—'}</Text>
          <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 12, color: changeColor }}>{`${nativeChange >= 0 ? '+' : ''}${nativeChange.toFixed(2)} % · 24 h`}</Text>
        </View>
      </View>
    </View>
  );
}

type AssetTab = 'tokens' | 'nft' | 'activity';

/** Onglets soulignés Tokens / NFT / Activité + contenu à plat (pas de carte). */
function MobileAssets({ data, chain, address, onReceive }: { data: HeroData; chain: ChainConfig; address: string; onReceive: () => void }) {
  const t = useT();
  const tw = useWebT();
  const [tab, setTab] = useState<AssetTab>('tokens');
  const isEvm = chain.family === 'evm';
  const tabs: { k: AssetTab; l: string }[] = [
    { k: 'tokens', l: t("tabTokens") },
    { k: 'nft', l: t("tabNft") },
    { k: 'activity', l: t("activity") },
  ];
  return (
    <View style={{ gap: 14 }}>
      <SegmentTabs tabs={tabs} value={tab} onChange={setTab} />
      <CrossFade id={tab}>
        {tab === 'tokens' ? (
          <MobileTokenList data={data} chain={chain} address={address} onReceive={onReceive} />
        ) : tab === 'nft' ? (
          isEvm ? <NftsPanel chain={chain} address={address} flat /> : <MobileEmptyState icon="nft" title={tw('noNft')} subtitle={tw('nftEvmOnly')} />
        ) : (
          <HistoryPanel chain={chain} address={address} flat />
        )}
      </CrossFade>
    </View>
  );
}

/** Ligne d'actif à plat (avatar 36, symbole + nom, montant + valeur fiat). */
function MobileAssetRow({ avatar, title, subtitle, amount, value, divider, onPress }: { avatar: React.ReactNode; title: string; subtitle: string; amount: string; value?: string; divider: boolean; onPress?: () => void }) {
  const P = useWebPalette();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: divider ? 1 : 0, borderTopColor: P.divider, opacity: pressed ? 0.7 : 1 })}>
      {avatar}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: WEB_FONTS.body, fontWeight: '600', fontSize: 14, color: P.text }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 12, color: P.muted }} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={{ fontFamily: WEB_FONTS.display, fontWeight: '600', fontSize: 14, color: P.text, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{amount}</Text>
        {value ? <Text style={{ fontFamily: WEB_FONTS.body, fontSize: 12, color: P.muted }} numberOfLines={1}>{value}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Actif natif en première ligne (données déjà chargées par useHeroData —
 *  aucun appel réseau en plus), puis les tokens ERC-20 vérifiés. */
function MobileTokenList({ data, chain, address, onReceive }: { data: HeroData; chain: ChainConfig; address: string; onReceive: () => void }) {
  const tw = useWebT();
  const fiat = useSettings((s) => s.fiat);
  const rev = useWebConnect((s) => s.rev);
  const isEvm = chain.family === 'evm';
  const { bal, price } = data;
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: erc, loading } = useAsync<{ tokens: Erc20Token[]; prices: Record<string, number> }>(async () => {
    if (!isEvm) return { tokens: [], prices: {} };
    const tokens = await getErc20Tokens(chain, address);
    const prices = chain.coingeckoPlatform && tokens.length ? await getTokenPrices(chain.coingeckoPlatform, tokens.map((tk) => tk.contract), fiat) : {};
    return { tokens, prices };
  }, [chain.id, address, fiat, rev, isEvm]);

  const nativeAmount = bal ? Number(bal.raw) / 10 ** bal.decimals : 0;
  const hasNative = bal != null && bal.raw !== 0n;
  const prices = erc?.prices ?? {};
  const rows = (erc?.tokens ?? [])
    .map((tk) => ({ tk, value: (Number(tk.raw) / 10 ** tk.decimals) * (prices[tk.contract.toLowerCase()] ?? 0) }))
    .filter(({ tk, value }) => tk.logo || value > 0)
    .sort((a, b) => b.value - a.value);

  if (bal == null && loading) return <SkeletonRows flat count={3} />;
  if (!hasNative && rows.length === 0) {
    return (
      <MobileEmptyState
        icon="wallet"
        title={tw('noTokensYet')}
        subtitle={tw('noTokensBody', { chain: chain.name })}
        action={{ label: tw('receiveFunds'), onPress: onReceive }}
      />
    );
  }
  const sym = fiatSymbol(fiat);
  return (
    <View>
      {hasNative ? (
        <MobileAssetRow
          avatar={<ChainAvatar chain={chain} size={36} />}
          title={chain.nativeSymbol}
          subtitle={chain.name}
          amount={`${formatTokenAmount(bal!.raw, bal!.decimals)} ${chain.nativeSymbol}`}
          value={price ? formatFiatAmount(nativeAmount * price, fiat) : undefined}
          divider={false}
        />
      ) : null}
      {rows.map(({ tk, value }, i) => (
        <View key={tk.contract}>
          <TokenRow
            token={tk}
            value={value}
            sym={sym}
            chain={chain}
            divider={hasNative || i > 0}
            expanded={expanded === tk.contract}
            onToggle={() => setExpanded((cur) => (cur === tk.contract ? null : tk.contract))}
          />
        </View>
      ))}
      {loading ? <View style={{ paddingTop: 12 }}><Skeleton h={12} w={140} /></View> : null}
    </View>
  );
}


/** Sélecteur de réseau : liste verticale (desktop) ou puces horizontales (étroit),
 *  avec recherche au-delà de ~6 réseaux. */
/**
 * Familles présentées en onglets, dans cet ordre — le même que dans l'app.
 *
 * La session WalletConnect ouvre TOUS les réseaux EVM plus Solana et Bitcoin :
 * une soixantaine d'entrées dans une seule liste plate, où l'on ne cherche plus,
 * on fait défiler. Regrouper par famille rend la liste parcourable sans taper.
 *
 * Contrairement à l'app, pas d'onglet TON ici : ce sélecteur ne montre que ce que
 * le téléphone a effectivement autorisé à signer, et TON n'est dans aucun espace
 * de noms WalletConnect. Un onglet vide laisserait croire le contraire ; l'arrivée
 * de TON s'annonce sur le site, pas dans la liste de ce qui est signable.
 */
const WEB_FAMILY_ORDER: ChainFamily[] = ['evm', 'bitcoin', 'solana'];
const WEB_FAMILY_LABELS: Record<string, string> = { evm: 'EVM', bitcoin: 'Bitcoin', solana: 'Solana' };

function NetworkSelector({ vertical, onSelected }: { vertical: boolean; onSelected?: () => void }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const accounts = useWebConnect((s) => s.accounts);
  const selected = useWebConnect((s) => s.selected);
  const setChain = useWebConnect((s) => s.setChain);
  const [q, setQ] = useState('');
  const chains = useMemo(() => accounts.map((a) => chainById(a.chainId)), [accounts]);
  // Onglets réduits aux familles réellement présentes dans la session : si le
  // portefeuille n'a pas d'adresse Bitcoin, bip122 n'y est pas, donc pas d'onglet.
  const families = useMemo(() => WEB_FAMILY_ORDER.filter((f) => chains.some((c) => c.family === f)), [chains]);
  // La famille du réseau actif : on ouvre la liste sur l'onglet où il se trouve.
  const activeFamily = chains.find((c) => c.id === selected)?.family;
  const [family, setFamily] = useState<ChainFamily>(activeFamily ?? 'evm');
  const shownFamily = families.includes(family) ? family : (families[0] ?? 'evm');
  const needle = q.trim().toLowerCase();
  // Une recherche porte sur TOUT, pas sur l'onglet courant : sinon on ne trouve
  // pas « solana » depuis l'onglet EVM et rien ne dit pourquoi.
  const filtered = needle
    ? chains.filter((c) => c.name.toLowerCase().includes(needle))
    : chains.filter((c) => c.family === shownFamily);
  const item = (c: ChainConfig) => {
    const on = c.id === selected;
    return (
      <Pressable
        key={c.id}
        onPress={() => { setChain(c.id); onSelected?.(); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1.25), paddingVertical: spacing(1), borderRadius: radii.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}
      >
        <ChainAvatar chain={c} size={20} />
        <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: fonts.semibold, fontSize: 13, flex: vertical ? 1 : 0 }} numberOfLines={1}>{c.name}</Text>
        {on && vertical ? <Icon name="check" size={14} color={colors.accent} /> : null}
      </Pressable>
    );
  };
  return (
    <View style={{ gap: spacing(1) }}>
      {chains.length > 6 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.pill, paddingHorizontal: spacing(1.25) }}>
          <Icon name="search" size={15} color={colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder={t("searchNetwork")} placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, backgroundColor: 'transparent', fontSize: 13, paddingVertical: spacing(0.85) }} />
        </View>
      ) : null}
      {/* Onglets masqués pendant une recherche : celle-ci porte sur tout, les
          laisser suggérerait qu'elle se limite à la famille affichée. */}
      {!needle && families.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {families.map((f) => {
            const on = f === shownFamily;
            return (
              <Pressable key={f} onPress={() => setFamily(f)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: on ? colors.text + '14' : 'transparent', borderWidth: 1, borderColor: on ? colors.text + '22' : colors.text + '10' }}>
                <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 12 }}>{WEB_FAMILY_LABELS[f]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {filtered.length === 0 ? (
        <Text style={[typography.muted, { paddingVertical: spacing(1.5) }]}>{t('noNetworkMatch').replace('{q}', needle ? q : WEB_FAMILY_LABELS[shownFamily])}</Text>
      ) : vertical ? (
        <View style={{ gap: spacing(0.5) }}>{filtered.map(item)}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(0.75) }}>{filtered.map(item)}</ScrollView>
      )}
    </View>
  );
}


/** Panneau Sécurité : met en avant le modèle « le téléphone est le coffre-fort ». */
function SecurityPanel() {
  const t = useT();
  const tw = useWebT();
  const language = useSettings((s) => s.language);
  const { colors, typography } = useTheme();
  const peerName = useWebConnect((s) => s.peerName);
  const connectedAt = useWebConnect((s) => s.connectedAt);
  const lastActivity = useWebConnect((s) => s.lastActivity);
  const accounts = useWebConnect((s) => s.accounts);
  const disconnect = useWebConnect((s) => s.disconnect);
  const guarantees: { label: string; value: string }[] = [
    { label: tw('privateKeys'), value: tw('neverOnDevice') },
    { label: tw('signatures'), value: tw('onYourPhone') },
    { label: tw('thisSite'), value: tw('readOnly') },
  ];
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.up + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="security" size={19} color={colors.up} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.bodyStrong} numberOfLines={1}>{peerName ?? tw('kalyxWallet')}</Text>
          <Text style={typography.muted} numberOfLines={1}>{`${tw('vaultConnected')}${connectedAt ? ` · ${ago(Math.floor(connectedAt / 1000), language)}` : ''}`}</Text>
        </View>
      </View>

      <View style={{ gap: spacing(0.85), marginTop: spacing(1.5) }}>
        {guarantees.map((g) => (
          <View key={g.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
            <Icon name="check" size={15} color={colors.up} />
            <Text style={[typography.muted, { flex: 1 }]}>{g.label}</Text>
            <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>{g.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 1, backgroundColor: colors.glassBorder, marginVertical: spacing(1.5) }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={typography.muted}>{tw('lastActivity')}</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>{ago(Math.floor(lastActivity / 1000), language)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(0.5) }}>
        <Text style={typography.muted}>{tw('sharedNetworks')}</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>{accounts.length}</Text>
      </View>

      <Pressable onPress={disconnect} style={({ pressed }) => ({ marginTop: spacing(1.5), alignItems: 'center', borderRadius: radii.pill, paddingVertical: spacing(1.1), borderWidth: 1, borderColor: colors.danger + '66', opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: colors.danger, fontFamily: fonts.semibold }}>{tw('disconnectDevice')}</Text>
      </Pressable>
    </Card>
  );
}

/** Réglages du tableau de bord : langue et devise d'affichage. Même store
 *  (lib/settingsStore.ts) que l'app mobile — un changement ici ne modifie que
 *  ce navigateur (persistance locale), jamais le téléphone. */
function SettingsPanel() {
  const t = useT();
  const tw = useWebT();
  const { colors, typography } = useTheme();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  const fiat = useSettings((s) => s.fiat);
  const setFiat = useSettings((s) => s.setFiat);
  const themePref = useSettings((s) => s.themePref);
  const setThemePref = useSettings((s) => s.setThemePref);
  const aiEnabled = useAiStore((s) => s.isEnabled);
  const aiProvider = useAiStore((s) => s.provider);
  const aiModel = useAiStore((s) => s.customModel);
  const disableAi = useAiStore((s) => s.disableAi);
  const platform = useWebPlatform();
  const [open, setOpen] = useState<'lang' | 'fiat' | 'theme' | 'ai' | null>(null);
  const [aiEdit, setAiEdit] = useState(false);
  useEffect(() => { setAiEdit(false); }, [aiEnabled]);
  const curLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];
  const curFiat = FIATS.find((f) => f.code === fiat) ?? FIATS[0];
  const themeLabel = themePref === 'dark' ? tw('themeDark') : themePref === 'light' ? tw('themeLight') : tw('themeSystem');
  const aiValue = aiEnabled ? tw('aiConfigured', { provider: PROVIDER_LABELS[aiProvider], model: aiModel || PROVIDER_DEFAULTS[aiProvider]?.model || '' }) : tw('aiNotConfigured');

  const row = (opts: { icon: IconName; label: string; value: string; section: 'lang' | 'fiat' | 'theme' | 'ai' }) => (
    <Pressable
      onPress={() => { setOpen(open === opts.section ? null : opts.section); setAiEdit(false); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(0.75) }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={opts.icon} size={18} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={typography.muted}>{opts.label}</Text>
        <Text style={typography.bodyStrong} numberOfLines={1}>{opts.value}</Text>
      </View>
      <View style={{ transform: [{ rotate: open === opts.section ? '180deg' : '0deg' }] }}>
        <Icon name="caretDown" size={14} color={colors.textMuted} />
      </View>
    </Pressable>
  );
  const option = (on: boolean, onPress: () => void, left: React.ReactNode, label: string, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.85), borderRadius: radii.md, backgroundColor: on ? colors.glass : 'transparent', borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}
    >
      {left}
      <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: fonts.medium, fontSize: 13, flex: 1 }}>{label}</Text>
      {on ? <Icon name="check" size={14} color={colors.accent} /> : null}
    </Pressable>
  );
  const divider = <View style={{ height: 1, backgroundColor: colors.glassBorder }} />;

  return (
    <Card>
      {row({ icon: 'language', label: tw('language'), value: `${curLang.flag} ${curLang.name}`, section: 'lang' })}
      {open === 'lang' ? (
        <View style={{ gap: spacing(0.5), marginTop: spacing(0.5), marginBottom: spacing(1) }}>
          {LANGUAGES.map((l) => option(l.code === language, () => { setLanguage(l.code); setOpen(null); }, <Text style={{ fontSize: 16 }}>{l.flag}</Text>, l.name, l.code))}
        </View>
      ) : null}
      {divider}

      {row({ icon: 'currency', label: tw('currency'), value: `${curFiat.symbol} ${curFiat.name}`, section: 'fiat' })}
      {open === 'fiat' ? (
        <View style={{ gap: spacing(0.5), marginTop: spacing(0.5), marginBottom: spacing(1) }}>
          {FIATS.map((f) => option(f.code === fiat, () => { setFiat(f.code); setOpen(null); }, <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 14, width: 34 }}>{f.symbol}</Text>, f.name, f.code))}
        </View>
      ) : null}
      {divider}

      {row({ icon: 'appearance', label: tw('appearance'), value: themeLabel, section: 'theme' })}
      {open === 'theme' ? (
        <View style={{ gap: spacing(0.5), marginTop: spacing(0.5), marginBottom: spacing(1) }}>
          {([['system', tw('themeSystem')], ['dark', tw('themeDark')], ['light', tw('themeLight')]] as const).map(([k, label]) =>
            option(themePref === k, () => { setThemePref(k); setOpen(null); }, <Icon name={k === 'light' ? 'eye' : k === 'dark' ? 'eyeOff' : 'desktop'} size={16} color={colors.textMuted} />, label, k))}
        </View>
      ) : null}
      {divider}

      {row({ icon: 'sparkles', label: tw('aiAgent'), value: aiValue, section: 'ai' })}
      {open === 'ai' ? (
        <View style={{ gap: spacing(1), marginTop: spacing(0.5), marginBottom: spacing(1) }}>
          {!aiEnabled || aiEdit ? (
            <AgentSetup />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing(1) }}>
              <Pressable onPress={() => setAiEdit(true)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', borderRadius: radii.pill, paddingVertical: spacing(1.1), borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{tw('aiChangeKey')}</Text>
              </Pressable>
              <Pressable onPress={() => { disableAi(); toast.info(tw('aiDisabled')); }} style={({ pressed }) => ({ flex: 1, alignItems: 'center', borderRadius: radii.pill, paddingVertical: spacing(1.1), borderWidth: 1, borderColor: colors.danger + '66', opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ color: colors.danger, fontFamily: fonts.semibold, fontSize: 13 }}>{tw('aiDisable')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
      {divider}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(0.75) }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={platform === 'telegram' ? 'telegramLogo' : 'security'} size={18} color={colors.textMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.muted}>{platform === 'telegram' ? tw('telegramMode') : tw('webMode')}</Text>
          <Text style={[typography.bodyStrong, { fontSize: 13 }]}>{platform === 'telegram' ? tw('telegramModeOn') : tw('webModeBody')}</Text>
        </View>
      </View>
      {divider}

      {/* Textes légaux : mêmes pages que le site vitrine, dans la langue active. */}
      <Text style={{ color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: spacing(1.25), paddingBottom: spacing(0.5) }}>{tw('legalSection')}</Text>
      {([['terms', tw('termsOfUse'), 'phrase'], ['privacy', tw('privacyPolicy'), 'security'], ['mentions', tw('legalNotice'), 'about']] as const).map(([slug, label, icon]) => (
        <Pressable
          key={slug}
          onPress={() => { const w = (globalThis as { open?: (u: string, target?: string, features?: string) => unknown }).open; w?.(`https://kalyxwallet.com/${language}/${slug}/`, '_blank', 'noopener,noreferrer'); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(0.85), opacity: pressed ? 0.6 : 1 })}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={17} color={colors.textMuted} />
          </View>
          <Text style={[typography.bodyStrong, { flex: 1, fontSize: 14 }]}>{label}</Text>
          <Icon name="forward" size={14} color={colors.textFaint} />
        </Pressable>
      ))}
    </Card>
  );
}






/** Ligne d'un token ERC-20 : dépliable pour révéler le contrat et un envoi
 *  dédié (encode `transfer(address,uint256)`, signé côté téléphone). */
function TokenRow({
  token, value, sym, chain, divider, expanded, onToggle,
}: {
  token: Erc20Token; value: number; sym: string; chain: ChainConfig; divider: boolean; expanded: boolean; onToggle: () => void;
}) {
  const t = useT();
  const tw = useWebT();
  const { colors, typography } = useTheme();
  const request = useWebConnect((s) => s.request);
  const contacts = useContacts((s) => s.contacts);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const balStr = formatTokenAmount(token.raw, token.decimals);
  const matchedContact = contacts.find((c) => c.address.toLowerCase() === to.trim().toLowerCase());

  const onSend = async () => {
    setErr(null); setMsg(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(to.trim())) { setErr(tw('invalidEvmAddress')); return; }
    const raw = amount.replace(',', '.').trim();
    if (!/^\d*\.?\d+$/.test(raw) || !(parseFloat(raw) > 0)) { setErr(t("errInvalidAmount")); return; }
    setBusy(true);
    setMsg(tw('approveInApp'));
    try {
      const raw2 = toRaw(raw, token.decimals);
      const data = encodeErc20Transfer(to.trim(), raw2);
      const hash = await request('eth_sendTransaction', [{ to: token.contract, value: '0x0', data }]);
      setMsg(tw('txSent', { hash: short(hash) }));
      setTo(''); setAmount('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : tw('rejectedOrFailed'));
      setMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ borderTopWidth: divider ? 1 : 0, borderTopColor: colors.glassBorder }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25) }}>
        <TokenAvatar uri={token.logo} label={token.symbol} seed={token.contract} size={32} chainId={chain.id} />
        <View style={{ flex: 1 }}>
          <Text style={typography.bodyStrong}>{token.symbol}</Text>
          <Text style={typography.muted} numberOfLines={1}>{token.name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{balStr}</Text>
          {value > 0 ? <Text style={typography.muted}>{sym}{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text> : null}
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ paddingBottom: spacing(1.5), gap: spacing(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1) }}>
            <Text style={[typography.muted, { flex: 1 }]} numberOfLines={1}>{short(token.contract)}</Text>
            <Pressable onPress={() => { Clipboard.setStringAsync(token.contract); toast.success(tw('contractCopied')); }} hitSlop={6} style={{ marginRight: spacing(1) }}>
              <Icon name="copy" size={14} color={colors.textMuted} />
            </Pressable>
            {chain.explorerUrl ? (
              <Pressable onPress={() => Linking.openURL(`${chain.explorerUrl}/token/${token.contract}`)} hitSlop={6}>
                <Icon name="forward" size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>{t("aiSend")}{token.symbol}</Text>
            {contacts.length ? (
              <Pressable onPress={() => setShowContacts((v) => !v)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="contacts" size={13} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{t("addressBook")}</Text>
              </Pressable>
            ) : null}
          </View>
          {showContacts && contacts.length ? (
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radii.md, borderWidth: 1, borderColor: colors.glassBorder, overflow: 'hidden' }}>
              <ScrollView style={{ maxHeight: 160 }}>
                {contacts.map((c) => (
                  <Pressable key={c.id} onPress={() => { setTo(c.address); setShowContacts(false); }} style={({ pressed }) => ({ paddingHorizontal: spacing(1.25), paddingVertical: spacing(1), backgroundColor: pressed ? colors.glass : 'transparent' })}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>{c.name}</Text>
                    <Text style={typography.muted} numberOfLines={1}>{short(c.address)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <TextInput value={to} onChangeText={setTo} placeholder="0x…" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ color: colors.text, fontSize: 14, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1) }} />
          {matchedContact ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing(0.5) }}>
              <Icon name="check" size={12} color={colors.up} />
              <Text style={{ color: colors.up, fontSize: 12, fontFamily: fonts.medium }}>{matchedContact.name}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={typography.muted}>{tw('amountOf', { symbol: token.symbol })}</Text>
            <Pressable onPress={() => setAmount(balStr)} hitSlop={6}>
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 }}>{tw('balanceMax', { balance: balStr })}</Text>
            </Pressable>
          </View>
          <TextInput value={amount} onChangeText={setAmount} placeholder="0.0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={{ color: colors.text, fontSize: 14, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1) }} />
          <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.2), opacity: pressed || busy ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold }}>{busy ? tw('waitingApp') : t("aiSend")}</Text>
          </Pressable>
          {msg ? <Text style={{ color: colors.accent }}>{msg}</Text> : null}
          {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function NftsPanel({ chain, address, flat }: { chain: ChainConfig; address: string; flat?: boolean }) {
  const t = useT();
  const tw = useWebT();
  const { colors, typography } = useTheme();
  const rev = useWebConnect((s) => s.rev);
  const { data, loading } = useAsync<NftItem[]>(() => getNfts(chain, address), [chain.id, address, rev]);
  if (loading) return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="47%" h={196} r={radii.md} />)}
    </View>
  );
  if (!data || data.length === 0) {
    const empty = { title: tw('noNft'), subtitle: tw('noNftBody', { chain: chain.name }) };
    return flat ? <MobileEmptyState icon="nft" {...empty} /> : <EmptyState icon="nft" {...empty} />;
  }
  const isRawAddress = (s: string) => /^0x[a-fA-F0-9]{20,}$/.test(s || '');
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
      {data.map((n) => (
        <Pressable
          key={`${n.contract}-${n.tokenId}`}
          onPress={() => chain.explorerUrl && Linking.openURL(`${chain.explorerUrl}/token/${n.contract}?a=${n.tokenId}`)}
          // Largeur en % (pas fixe) : garantit une vraie grille à 2 colonnes
          // même sur un écran étroit — un width fixe de 160 px ne laissait
          // tenir qu'UNE carte par ligne sur mobile (bannières pleine largeur).
          style={({ pressed }) => ({ width: '47%', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.md, overflow: 'hidden', opacity: pressed ? 0.75 : 1 })}
        >
          <Image source={{ uri: n.image }} style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.glassStrong }} resizeMode="cover" />
          <View style={{ padding: spacing(1) }}>
            <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }} numberOfLines={1}>{n.name}</Text>
            {n.collection && !isRawAddress(n.collection) ? <Text style={typography.muted} numberOfLines={1}>{n.collection}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function toneColor(tone: HumanTx['tone'], colors: ReturnType<typeof useTheme>['colors']): string {
  return tone === 'up' ? colors.up : tone === 'down' ? colors.text : tone === 'danger' ? colors.danger : colors.textMuted;
}

type TxFilter = 'all' | 'in' | 'out' | 'swap' | 'other';

/** Libellé de jour : Aujourd'hui / Hier / date locale. */
function dayLabel(ts: number, today: string, yesterday: string): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return today;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return yesterday;
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

function txKind(tx: TxSummary, h: HumanTx): TxFilter {
  if (h.icon === 'exchange' || tx.type === 'swap' || String(tx.type ?? '').toUpperCase() === 'SWAP') return 'swap';
  if (tx.direction === 'in') return 'in';
  if (tx.direction === 'out' && (h.icon === 'send' || h.icon === 'receive')) return 'out';
  return 'other';
}

/** Historique humanisé (humanizeTx, partagé avec l'app) : groupé par jour,
 *  filtres Reçus / Envoyés / Swaps, détail en feuille (hash, adresses, explorateur),
 *  pagination « Voir plus ». Les transferts entrants à 0 (spam) sont masqués. */
function HistoryPanel({ chain, address, flat }: { chain: ChainConfig; address: string; flat?: boolean }) {
  const t = useT();
  const tw = useWebT();
  /*
   * Le dictionnaire de l'app, pas celui du web : les phrases d'activité vivent
   * dans `lib/i18n` et `useActivityT` lit le même réglage de langue. Les
   * dupliquer dans `webI18n` aurait créé deux vérités à maintenir pour un texte
   * identique.
   */
  const activityT = useActivityT();
  const { colors, typography } = useTheme();
  const rev = useWebConnect((s) => s.rev);
  const { data, loading } = useAsync<TxSummary[]>(() => getAdapter(chain.id).getHistory(address), [chain.id, address, rev]);
  const [filter, setFilter] = useState<TxFilter>('all');
  const [limit, setLimit] = useState(15);
  const [detail, setDetail] = useState<{ tx: TxSummary; h: HumanTx } | null>(null);
  if (loading) return <SkeletonRows count={5} flat={flat} />;
  const rows = (data ?? [])
    .map((tx) => ({ tx, h: humanizeTx(tx, { t: activityT, nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals }) }))
    .filter(({ h }) => !h.spam);
  if (!rows.length) {
    const empty = { title: tw('noActivity'), subtitle: tw('noActivityBody') };
    return flat ? <MobileEmptyState icon="history" {...empty} /> : <EmptyState icon="history" {...empty} />;
  }
  const filtered = filter === 'all' ? rows : rows.filter(({ tx, h }) => txKind(tx, h) === filter);
  const shown = filtered.slice(0, limit);
  const groups: { label: string; items: typeof shown }[] = [];
  for (const r of shown) {
    const label = dayLabel(r.tx.timestamp, tw('todayLabel'), tw('yesterday'));
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(r); else groups.push({ label, items: [r] });
  }
  const filters: { k: TxFilter; l: string }[] = [
    { k: 'all', l: tw('filterAll') }, { k: 'in', l: tw('filterReceived') }, { k: 'out', l: tw('filterSent') }, { k: 'swap', l: tw('filterSwaps') },
  ];
  const iconBg = (tone: HumanTx['tone']) => (tone === 'up' ? colors.up : tone === 'danger' ? colors.danger : colors.text) + '14';
  const Wrap = flat ? View : Card;
  const status = (tx: TxSummary) => (tx.status === 'failed' ? tw('txFailed') : tx.status === 'pending' ? tw('txPending') : tw('txSuccess'));
  const explorerTx = detail && chain.explorerUrl ? `${chain.explorerUrl}/tx/${detail.tx.hash}` : null;
  const copy = async (v: string, msg: string) => { await Clipboard.setStringAsync(v); toast.success(msg); };

  return (
    <View style={{ gap: spacing(1.25) }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {filters.map((f) => {
          const on = f.k === filter;
          return (
            <Pressable key={f.k} onPress={() => { setFilter(f.k); setLimit(15); }} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: on ? colors.text + '14' : 'transparent', borderWidth: 1, borderColor: on ? colors.text + '22' : colors.text + '10' }}>
              <Text style={{ color: on ? colors.text : colors.textMuted, fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 12 }}>{f.l}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {filtered.length === 0 ? <Text style={[typography.muted, { paddingVertical: spacing(2), textAlign: 'center' }]}>{tw('noMatch')}</Text> : null}
      <Wrap>
        {groups.map((g, gi) => (
          <View key={g.label}>
            <Text style={{ color: colors.textFaint, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: gi > 0 ? spacing(1.5) : 0, paddingBottom: spacing(0.5) }}>{g.label}</Text>
            {g.items.map(({ tx, h }, i) => (
              <View key={tx.hash}>
                <Pressable
                  onPress={() => setDetail({ tx, h })}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder, opacity: pressed ? 0.6 : 1 })}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: iconBg(h.tone), alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={h.failed ? 'errorCircle' : h.icon} size={17} color={h.failed ? colors.danger : toneColor(h.tone, colors)} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>{h.title}</Text>
                    <Text style={typography.muted} numberOfLines={1}>{h.subtitle ?? short(tx.hash)} · {new Date(tx.timestamp * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {h.amount ? <Text style={{ color: toneColor(h.tone, colors), fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{h.amount}</Text> : null}
                    {h.fiat ? <Text style={[typography.muted, { fontSize: 12 }]} numberOfLines={1}>{h.fiat}</Text> : null}
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </Wrap>
      {filtered.length > limit ? (
        <Pressable onPress={() => setLimit((l) => l + 15)} style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: spacing(1), paddingHorizontal: spacing(2), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.text + '14', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{tw('showMore')}</Text>
        </Pressable>
      ) : null}

      <Sheet visible={!!detail} onClose={() => setDetail(null)}>
        {detail ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iconBg(detail.h.tone), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={detail.h.failed ? 'errorCircle' : detail.h.icon} size={20} color={detail.h.failed ? colors.danger : toneColor(detail.h.tone, colors)} />
              </View>
              <View style={{ flex: 1 }}>
                <KText variant="title2">{detail.h.title}</KText>
                {detail.h.amount ? <KText variant="body" tabular style={{ color: toneColor(detail.h.tone, colors) }}>{detail.h.amount}{detail.h.fiat ? `  ·  ${detail.h.fiat}` : ''}</KText> : null}
              </View>
            </View>
            <Surface padded={false}>
              <ListRow title={tw('txStatus')} right={<KText variant="body" tone={detail.tx.status === 'failed' ? 'danger' : detail.tx.status === 'pending' ? 'warning' : 'up'}>{status(detail.tx)}</KText>} />
              <Divider inset={16} />
              <ListRow title={tw('txDate')} right={<KText variant="body">{new Date(detail.tx.timestamp * 1000).toLocaleString()}</KText>} />
              <Divider inset={16} />
              <ListRow title={t('labelNetwork')} right={<KText variant="body">{chain.name}</KText>} />
              <Divider inset={16} />
              <ListRow title={tw('txFrom')} subtitle={short(detail.tx.from)} onPress={() => copy(detail.tx.from, t('addressCopied'))} right={<Icon name="copy" size={14} color={colors.textMuted} />} />
              <Divider inset={16} />
              <ListRow title={tw('txTo')} subtitle={short(detail.tx.to)} onPress={() => copy(detail.tx.to, t('addressCopied'))} right={<Icon name="copy" size={14} color={colors.textMuted} />} />
              <Divider inset={16} />
              <ListRow title={tw('txHash')} subtitle={short(detail.tx.hash)} onPress={() => copy(detail.tx.hash, tw('hashCopied'))} right={<Icon name="copy" size={14} color={colors.textMuted} />} />
            </Surface>
            {explorerTx ? <Button label={tw('openExplorer')} variant="secondary" size="md" onPress={() => { const w = (globalThis as { open?: (u: string, target?: string, features?: string) => unknown }).open; w?.(explorerTx, '_blank', 'noopener,noreferrer'); }} /> : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
