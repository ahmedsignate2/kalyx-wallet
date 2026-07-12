/**
 * Tableau de bord WEB (desktop) — « le téléphone est le coffre-fort, le web est
 * le tableau de bord ». Aucune seed / clé ici : on se connecte à l'app Nova via
 * WalletConnect (QR), on lit les adresses publiques, et on FORWARDE toute action
 * sensible à l'app qui signe. Layout desktop responsive (sidebar + contenu).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, TextInput, useWindowDimensions, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { NovaLogo } from '../NovaLogo';
import { Icon, type IconName } from '../icon';
import { fonts, radii, spacing, useTheme } from '../theme';
import { useWebConnect } from '../../lib/webConnect';
import {
  getAdapter,
  listChains,
  getErc20Tokens,
  getNfts,
  formatBalance,
  chainIconUrl,
  type Erc20Token,
  type NftItem,
  type Balance,
  type TxSummary,
  type ChainConfig,
} from '../../src';

function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Chaîne Nova correspondant au chainId EVM WalletConnect (défaut Ethereum). */
function novaChainFor(evmChainId: number): ChainConfig {
  const all = listChains();
  return all.find((c) => c.family === 'evm' && c.evmChainId === evmChainId) ?? all.find((c) => c.id === 'ethereum')!;
}

type Tab = 'portfolio' | 'tokens' | 'nfts' | 'history' | 'send';

export function WebDashboard() {
  const { colors } = useTheme();
  const status = useWebConnect((s) => s.status);
  const init = useWebConnect((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      {status === 'connected' ? <Dashboard /> : <ConnectView />}
    </View>
  );
}

/* ------------------------------------------------------------------ Connexion */

function ConnectView() {
  const { colors, typography } = useTheme();
  const status = useWebConnect((s) => s.status);
  const uri = useWebConnect((s) => s.uri);
  const error = useWebConnect((s) => s.error);
  const connect = useWebConnect((s) => s.connect);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
      <View style={{ alignItems: 'center', gap: spacing(2), maxWidth: 420 }}>
        <NovaLogo size={72} />
        <Text style={{ color: colors.text, fontSize: 28, fontFamily: fonts.extrabold, textAlign: 'center' }}>
          Connecter votre portefeuille Nova
        </Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          Le téléphone est le coffre-fort, ce site est votre tableau de bord. Aucune clé n'est stockée ici —
          vous approuvez la connexion depuis l'app Nova avec votre PIN ou votre biométrie.
        </Text>

        {uri ? (
          <View style={{ alignItems: 'center', gap: spacing(1.5), marginTop: spacing(1) }}>
            <View style={{ backgroundColor: '#fff', padding: spacing(2), borderRadius: radii.lg }}>
              <QRCode value={uri} size={220} />
            </View>
            <Text style={[typography.muted, { textAlign: 'center' }]}>
              Ouvrez Nova sur votre téléphone → onglet WalletConnect → scannez ce QR.
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
            })}
          >
            {status === 'connecting' ? <ActivityIndicator color="#fff" /> : <Icon name="walletconnect" size={20} color="#fff" />}
            <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 16 }}>
              {status === 'connecting' ? 'Connexion…' : 'Connecter Nova'}
            </Text>
          </Pressable>
        )}

        {error ? <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text> : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Dashboard */

const NAV: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'portfolio', label: 'Portefeuille', icon: 'wallet' },
  { key: 'tokens', label: 'Tokens', icon: 'market' },
  { key: 'nfts', label: 'NFT', icon: 'nft' },
  { key: 'history', label: 'Historique', icon: 'history' },
  { key: 'send', label: 'Envoyer', icon: 'send' },
];

function Dashboard() {
  const { colors, typography } = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 860;
  const session = useWebConnect((s) => s.session)!;
  const disconnect = useWebConnect((s) => s.disconnect);
  const [tab, setTab] = useState<Tab>('portfolio');
  const chain = useMemo(() => novaChainFor(session.chainId), [session.chainId]);

  return (
    <ScrollView contentContainerStyle={{ minHeight: '100%', alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 1200, padding: spacing(desktop ? 3 : 2), gap: spacing(2) }}>
        {/* En-tête */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) }}>
            <NovaLogo size={36} />
            <Text style={{ color: colors.text, fontSize: 22, fontFamily: fonts.extrabold }}>Nova · Tableau de bord</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.pill, paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.85) }}>
              <Image source={{ uri: chainIconUrl(chain.id) }} style={{ width: 18, height: 18, borderRadius: 9 }} />
              <Text style={{ color: colors.text, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>{short(session.address)}</Text>
            </View>
            <Pressable onPress={disconnect} style={({ pressed }) => ({ paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.85), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.glassBorder, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.semibold }}>Déconnecter</Text>
            </Pressable>
          </View>
        </View>

        {/* Corps : sidebar (desktop) ou onglets (étroit) + contenu */}
        <View style={{ flexDirection: desktop ? 'row' : 'column', gap: spacing(2), alignItems: 'flex-start' }}>
          <View style={{ flexDirection: desktop ? 'column' : 'row', gap: spacing(0.5), width: desktop ? 220 : '100%', flexWrap: 'wrap' }}>
            {NAV.map((n) => {
              const active = tab === n.key;
              return (
                <Pressable
                  key={n.key}
                  onPress={() => setTab(n.key)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1.25), paddingHorizontal: spacing(1.5), borderRadius: radii.md, backgroundColor: active ? colors.glass : 'transparent', borderWidth: 1, borderColor: active ? colors.glassBorder : 'transparent' }}
                >
                  <Icon name={n.icon} size={18} color={active ? colors.accent : colors.textMuted} />
                  <Text style={{ color: active ? colors.text : colors.textMuted, fontFamily: fonts.semibold }}>{n.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flex: 1, width: '100%', minWidth: 0, gap: spacing(1.5) }}>
            {tab === 'portfolio' ? <PortfolioPanel chain={chain} address={session.address} /> : null}
            {tab === 'tokens' ? <TokensPanel chain={chain} address={session.address} /> : null}
            {tab === 'nfts' ? <NftsPanel chain={chain} address={session.address} /> : null}
            {tab === 'history' ? <HistoryPanel chain={chain} address={session.address} /> : null}
            {tab === 'send' ? <SendPanel chain={chain} /> : null}
          </View>
        </View>

        <Text style={[typography.muted, { textAlign: 'center', fontSize: 12, marginTop: spacing(1) }]}>
          🔒 Ce site ne peut jamais signer seul. Chaque envoi ou signature est validé dans l'app Nova.
        </Text>
      </View>
    </ScrollView>
  );
}

/* --------------------------------------------------------------------- Panels */

function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.lg, padding: spacing(2) }}>
      {children}
    </View>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

function PortfolioPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const { colors, typography } = useTheme();
  const { data: bal, loading } = useAsync<Balance>(() => getAdapter(chain.id).getBalance(address), [chain.id, address]);
  return (
    <Card>
      <Text style={typography.muted}>Solde {chain.name}</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing(1) }} />
      ) : (
        <Text style={{ color: colors.text, fontSize: 34, fontFamily: fonts.extrabold, marginTop: spacing(0.5) }}>
          {bal ? formatBalance(bal.raw, bal.decimals) : '0'} {chain.nativeSymbol}
        </Text>
      )}
      <Text style={[typography.muted, { marginTop: spacing(1) }]} selectable>{address}</Text>
    </Card>
  );
}

function TokensPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const { colors, typography } = useTheme();
  const { data, loading } = useAsync<Erc20Token[]>(() => getErc20Tokens(chain, address), [chain.id, address]);
  if (loading) return <Card><ActivityIndicator color={colors.accent} /></Card>;
  if (!data || data.length === 0) return <Card><Text style={typography.muted}>Aucun token détecté (clé Alchemy requise pour l'EVM).</Text></Card>;
  return (
    <Card>
      {data.map((t, i) => (
        <View key={t.contract} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
          {t.logo ? <Image source={{ uri: t.logo }} style={{ width: 32, height: 32, borderRadius: 16 }} /> : <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.glassStrong }} />}
          <View style={{ flex: 1 }}>
            <Text style={typography.bodyStrong}>{t.symbol}</Text>
            <Text style={typography.muted} numberOfLines={1}>{t.name}</Text>
          </View>
          <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{formatBalance(t.raw, t.decimals, 4)}</Text>
        </View>
      ))}
    </Card>
  );
}

function NftsPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const { colors, typography } = useTheme();
  const { data, loading } = useAsync<NftItem[]>(() => getNfts(chain, address), [chain.id, address]);
  if (loading) return <Card><ActivityIndicator color={colors.accent} /></Card>;
  if (!data || data.length === 0) return <Card><Text style={typography.muted}>Aucun NFT sur ce réseau.</Text></Card>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
      {data.map((n) => (
        <View key={`${n.contract}-${n.tokenId}`} style={{ width: 160, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.md, overflow: 'hidden' }}>
          <Image source={{ uri: n.image }} style={{ width: '100%', height: 160, backgroundColor: colors.glassStrong }} resizeMode="cover" />
          <View style={{ padding: spacing(1) }}>
            <Text style={typography.bodyStrong} numberOfLines={1}>{n.name}</Text>
            <Text style={typography.muted} numberOfLines={1}>{n.collection}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function HistoryPanel({ chain, address }: { chain: ChainConfig; address: string }) {
  const { colors, typography } = useTheme();
  const { data, loading } = useAsync<TxSummary[]>(() => getAdapter(chain.id).getHistory(address), [chain.id, address]);
  if (loading) return <Card><ActivityIndicator color={colors.accent} /></Card>;
  if (!data || data.length === 0) return <Card><Text style={typography.muted}>Aucune transaction (clé Etherscan requise pour l'EVM).</Text></Card>;
  return (
    <Card>
      {data.slice(0, 30).map((tx, i) => (
        <View key={tx.hash} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
          <View style={{ flex: 1 }}>
            <Text style={typography.bodyStrong}>{tx.direction === 'in' ? 'Reçu' : 'Envoyé'}</Text>
            <Text style={typography.muted} numberOfLines={1}>{short(tx.hash)}</Text>
          </View>
          <Text style={{ color: tx.direction === 'in' ? colors.up : colors.text, fontFamily: fonts.semibold }}>
            {formatBalance(tx.value, chain.nativeDecimals, 4)} {chain.nativeSymbol}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function SendPanel({ chain }: { chain: ChainConfig }) {
  const { colors, typography } = useTheme();
  const request = useWebConnect((s) => s.request);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSend = async () => {
    setErr(null); setMsg(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(to.trim())) { setErr('Adresse EVM invalide (0x…).'); return; }
    const n = parseFloat(amount);
    if (!(n > 0)) { setErr('Montant invalide.'); return; }
    setBusy(true);
    setMsg('Validez la transaction dans l\'app Nova (PIN ou biométrie)…');
    try {
      const wei = BigInt(Math.round(n * 1e18));
      const hash = await request('eth_sendTransaction', [{ to: to.trim(), value: '0x' + wei.toString(16) }]);
      setMsg(`Transaction envoyée : ${short(hash)}`);
      setTo(''); setAmount('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refusé ou échoué.');
      setMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={typography.bodyStrong}>Envoyer {chain.nativeSymbol}</Text>
      <Text style={[typography.muted, { marginBottom: spacing(1) }]}>La transaction est signée dans l'app Nova — ce site ne signe jamais.</Text>
      <Text style={typography.muted}>Destinataire</Text>
      <TextInput value={to} onChangeText={setTo} placeholder="0x…" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25), marginTop: 4, marginBottom: spacing(1) }} />
      <Text style={typography.muted}>Montant ({chain.nativeSymbol})</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="0.0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={{ color: colors.text, fontSize: 15, backgroundColor: colors.bgElevated, borderRadius: radii.md, padding: spacing(1.25), marginTop: 4 }} />
      <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => ({ marginTop: spacing(1.5), alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.4), opacity: pressed || busy ? 0.7 : 1 })}>
        <Text style={{ color: '#fff', fontFamily: fonts.bold }}>{busy ? 'En attente de l\'app…' : 'Envoyer'}</Text>
      </Pressable>
      {msg ? <Text style={{ color: colors.accent, marginTop: spacing(1) }}>{msg}</Text> : null}
      {err ? <Text style={{ color: colors.danger, marginTop: spacing(1) }}>{err}</Text> : null}
    </Card>
  );
}
