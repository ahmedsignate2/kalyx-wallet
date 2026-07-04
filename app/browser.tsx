/**
 * Navigateur dApps intégré : WebView + window.ethereum injecté (EIP-1193).
 *
 * SÉCURITÉ (mêmes règles que WalletConnect) :
 * - la page web ne voit JAMAIS de clé ni de seed — elle poste des requêtes,
 *   Nova répond après approbation native ;
 * - connexion par ORIGINE (https uniquement), jamais automatique ;
 * - toute signature/transaction = fenêtre native avec décodage lisible
 *   (SIWE, EIP-712, tx) + PIN obligatoire ;
 * - requêtes de signature d'une origine non connectée → rejet automatique.
 *
 * react-native-webview est un module natif : chargé en require() dynamique,
 * l'écran affiche un message clair tant que le dev build n'a pas été rebuildé.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View, Image, Vibration, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GlassCard, ErrorBox, PressableScale } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { toast } from '../lib/toast';
import { loadRecents, pushRecent, type RecentDapp } from '../lib/recentDapps';
import {
  buildInjectedProvider,
  parseDappMessage,
  respondJs,
  emitJs,
  rpcProxy,
  READONLY_METHODS,
  type DappRequest,
} from '../lib/dappProvider';
import {
  getAdapter,
  listChains,
  formatBalance,
  hexToText,
  parseSiwe,
  siweDomainMismatch,
  summarizeTypedData,
  type RawTxRequest,
} from '../src';

// WebView = module natif : require dynamique pour ne pas crasher avant rebuild.
let WebViewComp: React.ComponentType<Record<string, unknown>> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewComp = require('react-native-webview').WebView;
} catch {
  WebViewComp = null;
}

/** dApps suggérées (page d'accueil). `domain` sert au logo (favicon HD). */
interface Dapp {
  name: string;
  url: string;
  domain: string;
  emoji: string;
  color: string;
}
const SUGGESTED: Dapp[] = [
  { name: 'Uniswap', url: 'https://app.uniswap.org', domain: 'uniswap.org', emoji: '🦄', color: '#FF007A' },
  { name: 'OpenSea', url: 'https://opensea.io', domain: 'opensea.io', emoji: '🌊', color: '#2081E2' },
  { name: 'Aave', url: 'https://app.aave.com', domain: 'aave.com', emoji: '👻', color: '#B6509E' },
  { name: 'PancakeSwap', url: 'https://pancakeswap.finance', domain: 'pancakeswap.finance', emoji: '🥞', color: '#1FC7D4' },
  { name: 'Lido', url: 'https://stake.lido.fi', domain: 'lido.fi', emoji: '🌀', color: '#00A3FF' },
  { name: 'ENS', url: 'https://app.ens.domains', domain: 'ens.domains', emoji: '🏷️', color: '#5298FF' },
];

/** Logo d'un site (favicon HD via DuckDuckGo ; repli emoji/lettre au besoin). */
function faviconUrl(host: string): string {
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

/** Couleur de marque du réseau (pastille dans la popup de connexion). */
const NETWORK_COLOR: Record<string, string> = {
  ethereum: '#627EEA',
  polygon: '#8247E5',
  bnb: '#F0B90B',
  base: '#0052FF',
  arbitrum: '#28A0F0',
  optimism: '#FF0420',
  avalanche: '#E84142',
  sepolia: '#7C5CFF',
  bitcoin: '#F7931A',
};

/** Demande en attente d'approbation utilisateur. */
type Pending =
  | { kind: 'connect'; id: number; origin: string }
  | { kind: 'sign'; id: number; origin: string; text: string | null; siwe: ReturnType<typeof parseSiwe>; hex: string }
  | { kind: 'typedData'; id: number; origin: string; summary: ReturnType<typeof summarizeTypedData>; data: unknown }
  | { kind: 'tx'; id: number; origin: string; to?: string; value: bigint; dataBytes: number; raw: RawTxRequest };

function originOf(url: string): string {
  const m = url.match(/^https:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase() : '';
}

export default function Browser() {
  const { colors, typography } = useTheme();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const chain = getAdapter(activeChain).config;
  const chainIdHex = '0x' + (chain.evmChainId ?? 1).toString(16);

  const webref = useRef<{ injectJavaScript: (js: string) => void } | null>(null);
  const [input, setInput] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  // Origines connectées (durée de vie : session du navigateur).
  const connected = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Derniers sites visités (persistés).
  const [recents, setRecents] = useState<RecentDapp[]>([]);
  const recentsRef = useRef<RecentDapp[]>([]);
  const lastHost = useRef<string>('');
  const applyRecents = (list: RecentDapp[]) => {
    recentsRef.current = list;
    setRecents(list);
  };
  useEffect(() => {
    loadRecents().then(applyRecents);
  }, []);

  const injected = useMemo(() => buildInjectedProvider(chainIdHex), [chainIdHex]);
  const origin = url ? originOf(url) : '';

  // Vibration à l'apparition d'une demande (connexion / signature / tx).
  useEffect(() => {
    if (pending) Vibration.vibrate(pending.kind === 'tx' ? [0, 30, 60, 30] : 12);
  }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link interne : /browser?url=https://… (CTA Staking/DeFi, etc.)
  const { url: urlParam } = useLocalSearchParams<{ url?: string }>();
  useEffect(() => {
    if (urlParam && /^https:\/\//i.test(String(urlParam))) {
      setUrl(String(urlParam));
      setInput(String(urlParam));
    }
  }, [urlParam]);

  const go = (raw: string, title?: string) => {
    const t = raw.trim();
    if (!t) return;
    // https uniquement (pas de http clair pour un wallet).
    const u = /^https:\/\//i.test(t) ? t : /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}` : null;
    if (!u) return;
    setUrl(u);
    setInput(u);
    const host = originOf(u);
    lastHost.current = host;
    pushRecent({ url: u, host, title: title || host }, recentsRef.current).then(applyRecents);
  };

  const respond = useCallback((id: number, result: unknown, err?: { code: number; message: string }) => {
    webref.current?.injectJavaScript(respondJs(id, result, err));
  }, []);

  const reject = useCallback(
    (id: number, code = 4001, message = 'Refusé par l’utilisateur') => respond(id, null, { code, message }),
    [respond],
  );

  /** Traite une requête EIP-1193 venant de la page. */
  const onDappRequest = useCallback(
    async (req: DappRequest, reqOrigin: string) => {
      const { id, method, params } = req;
      const addr = account?.address;
      const isConnected = connected.current.has(reqOrigin);

      try {
        if (method === 'eth_chainId') return respond(id, chainIdHex);
        if (method === 'net_version') return respond(id, String(chain.evmChainId ?? 1));
        if (method === 'eth_accounts') return respond(id, isConnected && addr ? [addr] : []);
        if (method === 'wallet_getPermissions')
          return respond(id, isConnected ? [{ parentCapability: 'eth_accounts' }] : []);

        if (method === 'eth_requestAccounts' || method === 'wallet_requestPermissions') {
          if (isConnected && addr) {
            return respond(id, method === 'eth_requestAccounts' ? [addr] : [{ parentCapability: 'eth_accounts' }]);
          }
          setPending({ kind: 'connect', id, origin: reqOrigin });
          return;
        }

        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          const want = Number((params[0] as { chainId?: string })?.chainId ?? '0x0');
          const target = listChains().find((c) => c.family === 'evm' && c.evmChainId === want);
          if (!target) return respond(id, null, { code: 4902, message: 'Réseau non supporté par Nova' });
          setActiveChain(target.id);
          respond(id, null);
          webref.current?.injectJavaScript(emitJs('chainChanged', '0x' + want.toString(16)));
          return;
        }

        // Signatures : origine connectée obligatoire.
        const isSigning =
          method === 'personal_sign' || method === 'eth_sign' || method.startsWith('eth_signTypedData') || method === 'eth_sendTransaction';
        if (isSigning) {
          if (!isConnected || !addr) return respond(id, null, { code: 4100, message: 'Non connecté' });
          if (method === 'personal_sign' || method === 'eth_sign') {
            const hex = String(method === 'personal_sign' ? params[0] : params[1] ?? '');
            const text = hexToText(hex) ?? (hex.startsWith('0x') ? null : hex);
            setPending({ kind: 'sign', id, origin: reqOrigin, hex, text, siwe: text ? parseSiwe(text) : null });
            return;
          }
          if (method.startsWith('eth_signTypedData')) {
            const rawData = params[1];
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            setPending({ kind: 'typedData', id, origin: reqOrigin, data, summary: summarizeTypedData(data) });
            return;
          }
          // eth_sendTransaction
          const tx = (params[0] ?? {}) as { to?: string; value?: string; data?: string; gas?: string };
          if (!tx.to) return respond(id, null, { code: 4200, message: 'Déploiement de contrat non supporté' });
          const raw: RawTxRequest = {
            to: tx.to,
            data: tx.data ?? '0x',
            value: tx.value ? BigInt(tx.value) : 0n,
            chainId: chain.evmChainId!,
            gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
          };
          setPending({
            kind: 'tx',
            id,
            origin: reqOrigin,
            to: tx.to,
            value: raw.value ?? 0n,
            dataBytes: typeof tx.data === 'string' ? Math.max(0, (tx.data.length - 2) / 2) : 0,
            raw,
          });
          return;
        }

        // Lecture seule : relayée au RPC du réseau actif (liste blanche).
        if (READONLY_METHODS.has(method)) {
          const result = await rpcProxy(chain.rpcUrls, method, params);
          return respond(id, result);
        }

        respond(id, null, { code: -32601, message: `Méthode non supportée : ${method}` });
      } catch (e) {
        respond(id, null, { code: -32603, message: e instanceof Error ? e.message.slice(0, 160) : 'Erreur interne' });
      }
    },
    [account?.address, chain, chainIdHex, respond, setActiveChain],
  );

  /** Approbation de la demande en attente (PIN si signature). */
  const approve = async () => {
    if (!pending || !account) return;
    setError(null);
    if (pending.kind === 'connect') {
      connected.current.add(pending.origin);
      respond(pending.id, [account.address]);
      webref.current?.injectJavaScript(emitJs('accountsChanged', [account.address]));
      webref.current?.injectJavaScript(emitJs('connect', { chainId: chainIdHex }));
      Vibration.vibrate(14);
      toast.success('Connexion réussie', pending.origin);
      setPending(null);
      return;
    }
    if (pin.length < 6) {
      setError('Entre ton PIN pour signer.');
      return;
    }
    setBusy(true);
    try {
      const w = useWallet.getState();
      let result: string;
      if (pending.kind === 'sign') result = await w.signMessage({ pin }, pending.hex);
      else if (pending.kind === 'typedData')
        result = await w.signTypedData({ pin }, pending.data as Parameters<typeof w.signTypedData>[1]);
      else result = await w.sendRawTxOn({ pin }, activeChain, pending.raw);
      respond(pending.id, result);
      Vibration.vibrate(14);
      toast.success(pending.kind === 'tx' ? 'Transaction envoyée' : 'Signature envoyée', pending.origin);
      setPending(null);
      setPin('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signature impossible.');
    } finally {
      setBusy(false);
    }
  };

  const deny = () => {
    if (pending) reject(pending.id);
    setPending(null);
    setPin('');
    setError(null);
  };

  // ------------------------------------------------------------------ UI

  if (!WebViewComp) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgDeep, padding: spacing(2.5), justifyContent: 'center' }}>
        <Stack.Screen options={{ headerShown: true, title: 'Navigateur' }} />
        <GlassCard>
          <Text style={typography.bodyStrong}>Navigateur indisponible</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            Le module natif react-native-webview n’est pas dans ce build. Refais un dev build
            (eas build --profile development) puis relance l’app.
          </Text>
        </GlassCard>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Barre d'adresse */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(1.5), paddingTop: spacing(6), paddingBottom: spacing(1) }}>
        <Pressable
          onPress={() => {
            if (canGoBack) webref.current && (webref.current as unknown as { goBack: () => void }).goBack();
            else setUrl(null);
          }}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.glass,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          {/* chevron pointant à gauche (retour) */}
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <Icon name="chevron" size={20} color={colors.text} />
          </View>
        </Pressable>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing(0.75),
            backgroundColor: colors.glass,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            borderRadius: radii.pill,
            paddingHorizontal: spacing(1.5),
          }}
        >
          <Icon name="security" size={14} color={origin && connected.current.has(origin) ? colors.up : colors.textMuted} />
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => go(input)}
            placeholder="dApp ou URL (https)…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: spacing(1) }}
          />
          {url ? (
            <Pressable onPress={() => webref.current && (webref.current as unknown as { reload: () => void }).reload()} hitSlop={8}>
              <Icon name="refresh" size={16} tone="muted" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {url ? (
        <WebViewComp
          ref={webref}
          source={{ uri: url }}
          originWhitelist={['https://*']}
          injectedJavaScriptBeforeContentLoaded={injected}
          onMessage={(e: { nativeEvent: { data: string; url?: string } }) => {
            const req = parseDappMessage(e.nativeEvent.data);
            if (req) onDappRequest(req, originOf(e.nativeEvent.url ?? url));
          }}
          onNavigationStateChange={(nav: { url: string; title?: string; canGoBack: boolean }) => {
            setInput(nav.url);
            setPageTitle(nav.title ?? '');
            setCanGoBack(nav.canGoBack);
            // Met à jour le titre réel du récent (une écriture par changement).
            const host = originOf(nav.url);
            const top = recentsRef.current[0];
            if (host && nav.title && !(top && top.host === host && top.title === nav.title)) {
              lastHost.current = host;
              pushRecent({ url: nav.url, host, title: nav.title }, recentsRef.current).then(applyRecents);
            }
          }}
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          style={{ flex: 1, backgroundColor: colors.bgDeep }}
        />
      ) : (
        /* Page d'accueil : populaires + récents */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing(2.5), gap: spacing(2.5), paddingBottom: spacing(6) }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 4 }}>
            <Text style={typography.title}>Navigateur dApps</Text>
            <Text style={typography.muted}>Chaque action sensible demandera ton PIN.</Text>
          </View>

          <View style={{ gap: spacing(1.25) }}>
            <Text style={typography.section}>Sites populaires</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
              {SUGGESTED.map((d) => (
                <DappTile key={d.url} dapp={d} onPress={() => go(d.url, d.name)} />
              ))}
            </View>
          </View>

          {recents.length > 0 ? (
            <View style={{ gap: spacing(1) }}>
              <Text style={typography.section}>Récents</Text>
              <GlassCard>
                {recents.map((r, i) => (
                  <Pressable
                    key={r.host}
                    onPress={() => go(r.url, r.title)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}
                  >
                    <Favicon host={r.host} size={30} color={colors.glassStrong} label={r.host.slice(0, 1).toUpperCase()} />
                    <View style={{ flex: 1 }}>
                      <Text style={typography.bodyStrong} numberOfLines={1}>{r.title}</Text>
                      <Text style={typography.muted} numberOfLines={1}>{r.host}</Text>
                    </View>
                    <Icon name="chevron" size={16} tone="faint" />
                  </Pressable>
                ))}
              </GlassCard>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Fenêtre d'approbation (connexion / signature / transaction) */}
      {pending ? (
        <Modal transparent animationType="slide" onRequestClose={deny}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing(2.5), paddingBottom: spacing(4), gap: spacing(1.5) }}>
              <Text style={typography.title}>
                {pending.kind === 'connect'
                  ? 'Connexion au site'
                  : pending.kind === 'tx'
                    ? 'Transaction demandée'
                    : 'Signature demandée'}
              </Text>

              {/* En-tête site : logo + titre + pastille réseau colorée */}
              <GlassCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                  <Favicon host={pending.origin} size={44} color={colors.glassStrong} label={pending.origin.slice(0, 1).toUpperCase()} />
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>{pageTitle || pending.origin}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: NETWORK_COLOR[chain.id] ?? colors.accent }} />
                      <Text style={typography.muted}>{pending.origin} · {chain.name}</Text>
                    </View>
                  </View>
                </View>
              </GlassCard>

              {pending.kind === 'connect' ? (
                <GlassCard>
                  <Text style={typography.muted}>✓ Peut voir ton adresse publique et tes soldes</Text>
                  <Text style={typography.muted}>✓ Peut te proposer des transactions à signer</Text>
                  <Text style={typography.muted}>✗ Ne peut RIEN déplacer sans ta signature + PIN</Text>
                </GlassCard>
              ) : pending.kind === 'sign' ? (
                <GlassCard>
                  {pending.siwe ? (
                    <>
                      <Text style={typography.bodyStrong}>Se connecter à {pending.siwe.domain}</Text>
                      {siweDomainMismatch(pending.siwe.domain, `https://${pending.origin}`) ? (
                        <ErrorBox message={`⚠️ Le message dit venir de « ${pending.siwe.domain} » mais tu es sur « ${pending.origin} ». Risque de phishing — refuse.`} />
                      ) : (
                        <>
                          <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>
                            Prouve seulement que tu possèdes cette adresse.
                          </Text>
                          <FreeSignature />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={typography.muted}>Message à signer</Text>
                      <Text style={[typography.bodyStrong, { fontSize: 14, marginTop: spacing(0.5) }]} numberOfLines={8} selectable>
                        {pending.text ?? 'Message illisible (données binaires) — prudence.'}
                      </Text>
                    </>
                  )}
                  <FreeSignature />
                </GlassCard>
              ) : pending.kind === 'typedData' ? (
                <GlassCard>
                  <Text style={typography.bodyStrong}>{pending.summary?.name ?? 'Données structurées'}</Text>
                  {pending.summary?.primaryType ? <Text style={typography.muted}>Type : {pending.summary.primaryType}</Text> : null}
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                    {pending.summary?.primaryType === 'Permit'
                      ? '⚠️ Un « Permit » autorise un contrat à dépenser tes tokens. Vérifie le site.'
                      : 'Vérifie le contenu avant de signer.'}
                  </Text>
                  <FreeSignature />
                </GlassCard>
              ) : (
                <GlassCard>
                  {pending.to ? (
                    <Text style={typography.muted}>
                      Vers : <Text style={{ color: colors.text, fontFamily: fonts.medium }}>{pending.to.slice(0, 10)}…{pending.to.slice(-8)}</Text>
                    </Text>
                  ) : null}
                  <Text style={typography.muted}>
                    Montant : <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{formatBalance(pending.value, chain.nativeDecimals)} {chain.nativeSymbol}</Text>
                  </Text>
                  {pending.dataBytes > 0 ? <Text style={typography.muted}>Données : {pending.dataBytes} octets (appel de contrat)</Text> : null}
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>⚠️ Vérifie bien : ceci peut déplacer des fonds.</Text>
                </GlassCard>
              )}

              {pending.kind !== 'connect' ? (
                <GlassCard>
                  <Text style={typography.muted}>PIN</Text>
                  <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} editable={!busy} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
                </GlassCard>
              ) : null}

              {error ? <ErrorBox message={error} /> : null}
              <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
                <View style={{ flex: 1 }}>
                  <Button label="Refuser" variant="ghost" onPress={deny} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={busy ? 'Signature…' : pending.kind === 'connect' ? 'Connecter' : 'Signer'}
                    loading={busy}
                    onPress={approve}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** Logo d'un site : favicon HD, repli sur une pastille (emoji/lettre) si échec. */
function Favicon({ host, size, color, label, emoji }: { host: string; size: number; color: string; label?: string; emoji?: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const r = size / 2;
  if (failed || !host) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.5, color: colors.text }}>{emoji ?? label ?? '◈'}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: faviconUrl(host) }}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: r, backgroundColor: '#fff' }}
    />
  );
}

/** Tuile d'un site populaire : logo + nom. */
function DappTile({ dapp, onPress }: { dapp: Dapp; onPress: () => void }) {
  const { typography } = useTheme();
  return (
    <PressableScale onPress={onPress} style={{ width: '30%' }}>
      <GlassCard style={{ alignItems: 'center', paddingVertical: spacing(2), paddingHorizontal: spacing(0.5), gap: 8 }}>
        <Favicon host={dapp.domain} size={44} color={dapp.color} emoji={dapp.emoji} />
        <Text style={[typography.bodyStrong, { fontSize: 12.5 }]} numberOfLines={1}>{dapp.name}</Text>
      </GlassCard>
    </PressableScale>
  );
}

/** Bandeau vert rassurant : signature = gratuite (aucun frais de réseau). */
function FreeSignature() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing(1) }}>
      <Text style={{ fontSize: 13 }}>🔒</Text>
      <Text style={{ color: colors.up, fontSize: 13, fontFamily: fonts.semibold }}>Cette signature est gratuite (aucun frais).</Text>
    </View>
  );
}
