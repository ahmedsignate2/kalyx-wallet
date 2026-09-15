/**
 * Fenêtres globales WalletConnect : proposition de session + requête à signer.
 * Monté à la racine pour capter les événements quel que soit l'écran.
 *
 * La requête est décodée pour l'humain (moteur src/domain/wc) :
 * - personal_sign hex → texte lisible ; si SIWE (EIP-4361) → carte « Connexion »
 *   avec le domaine, et ALERTE si le domaine du message ≠ site connecté (phishing) ;
 * - eth_signTypedData → nom du protocole + type signé (Permit, Order…) ;
 * - eth_sendTransaction → destinataire, montant natif, réseau.
 * Les données brutes restent accessibles via « Détails techniques ».
 */
import { base58 } from '@scure/base';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Image, StyleSheet } from 'react-native';
import { GlassCard, ErrorBox, GradientAvatar } from './premium';
import { Button } from './components';
import { ConfirmUnlock } from './ConfirmUnlock';
import { Icon, type IconName } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { useTokenStore } from '../lib/tokenStore';
import { useWalletConnect } from '../lib/walletconnect';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { sound } from '../lib/sound';
import {
  hexToText,
  parseSiwe,
  siweDomainMismatch,
  summarizeTypedData,
  listChains,
  assessAddress,
  isPhishingSite,
  decodeTx,
  simulateTx,
  explainRequest,
  describeSolanaTransaction,
  getTokenMetadata,
  type RiskAssessment,
  type Simulation,
} from '../src';
import { SignSheet } from './SignSheet';
import { Interface } from 'ethers';

function hostOf(url: string) {
  return url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || url;
}

function Overlay({ children, onCancel }: { children: React.ReactNode, onCancel?: () => void }) {
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={onCancel} />
        <View style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing(2.5), paddingBottom: spacing(4), gap: spacing(1.5) }}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Ligne d'autorisation : case à cocher + libellé. `fixed` = accordé d'office. */
function PermRow({ on, onToggle, label, fixed }: { on: boolean; onToggle?: () => void; label: string; fixed?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={fixed ? undefined : onToggle}
      disabled={fixed}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingVertical: spacing(0.5) }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.accent : colors.glassBorder, backgroundColor: on ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: fixed ? 0.7 : 1 }}>
        {on ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
      </View>
      <Text style={{ color: colors.text, flex: 1, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Bannières de sécurité : phishing du site (GoPlus) + risque de l'adresse cible. */
function SecBanner({ risk, phish }: { risk: RiskAssessment | 'loading' | null; phish: boolean }) {
  const { colors, typography } = useTheme();
  const t = useT();
  return (
    <>
      {phish ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.danger + '1E', borderWidth: 1, borderColor: colors.danger + '66', borderRadius: radii.md, padding: spacing(1.5) }}>
          <Icon name="warning" size={18} color={colors.danger} />
          <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{t('phishingWarning')}</Text>
        </View>
      ) : null}
      {risk === 'loading' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="security" size={15} color={colors.textMuted} />
          <Text style={typography.muted}>{t('securityScanning')}</Text>
        </View>
      ) : risk && risk.level === 'danger' ? (
        <View style={{ backgroundColor: colors.danger + '1E', borderWidth: 1, borderColor: colors.danger + '66', borderRadius: radii.md, padding: spacing(1.5), gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={18} color={colors.danger} />
            <Text style={{ color: colors.danger, fontFamily: fonts.bold, flex: 1 }}>{t('riskDetected')}</Text>
          </View>
          {risk.reasons.map((r) => <Text key={r} style={{ color: colors.text, fontSize: 13 }}>• {r}</Text>)}
        </View>
      ) : risk && risk.level === 'ok' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={15} color={colors.up} />
          <Text style={{ color: colors.up, fontSize: 13, fontFamily: fonts.semibold }}>{t('noKnownRisk')}</Text>
        </View>
      ) : null}
    </>
  );
}

/** En-tête dApp : logo (ou avatar), nom, domaine. */
function DappHeader({ name, url, icon }: { name: string; url: string; icon?: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
      {icon ? (
        <Image source={{ uri: icon }} style={{ width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.glass }} />
      ) : (
        <GradientAvatar label={(name || '?').slice(0, 1).toUpperCase()} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={typography.bodyStrong}>{name || 'dApp'}</Text>
        {url ? <Text style={typography.muted}>{hostOf(url)}</Text> : null}
      </View>
    </View>
  );
}

/** Texte d'un message à signer : base58 (Solana), hex 0x (EVM) ou texte brut. Jamais ne lève. */
function decodeMessageText(raw: string, base58First: boolean): string {
  if (!raw) return '';
  try {
    if (base58First) {
      const bytes = base58.decode(raw);
      const txt = new TextDecoder().decode(bytes);
      if (/^[\x20-\x7E\u00A0-\uFFFF\s]*$/.test(txt)) return txt;
    }
  } catch { /* pas du base58 */ }
  if (raw.startsWith('0x')) return hexToText(raw) ?? raw;
  return raw;
}

export function WalletConnectHost() {
  const { colors, typography } = useTheme();
  const t = useT();
  const proposal = useWalletConnect((s) => s.proposal);
  const request = useWalletConnect((s) => s.request);
  const sessions = useWalletConnect((s) => s.sessions);
  const approveProposal = useWalletConnect((s) => s.approveProposal);
  const rejectProposal = useWalletConnect((s) => s.rejectProposal);
  const approveRequest = useWalletConnect((s) => s.approveRequest);
  const rejectRequest = useWalletConnect((s) => s.rejectRequest);
  const account = useWallet((s) => s.account);

  const [confirming, setConfirming] = useState(false);
  const reduceRef = useRef<string | null>(null);
  // Autorisations granulaires accordées au site (cases à la connexion).
  const [allowTx, setAllowTx] = useState(true);
  const [allowSign, setAllowSign] = useState(true);
  // Analyse de sécurité GoPlus (parité avec le navigateur dApps intégré).
  const [risk, setRisk] = useState<RiskAssessment | 'loading' | null>(null);
  const [phishSite, setPhishSite] = useState(false);
  // Simulation de la transaction (Alchemy, repli statique) + métadonnées du token ciblé.
  const [sim, setSim] = useState<Simulation | 'loading' | null>(null);
  // Token d'un Permit/Permit2 : symbole + décimales (registre local, puis métadonnées ERC-20).
  const [permitToken, setPermitToken] = useState<{ symbol: string; decimals: number } | null>(null);

  // Décodage lisible de la requête (mémoïsé : parsing hex/SIWE/EIP-712).
  const info = useMemo(() => {
    if (!request) return null;
    const method: string = request.params?.request?.method ?? '';
    const p: any[] = request.params?.request?.params ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const chain = listChains().find((c) => c.family === 'evm' && `eip155:${c.evmChainId}` === request.params?.chainId);
    const peer = sessions.find((s) => s.topic === request.topic);

    let kind: 'siwe' | 'message' | 'typedData' | 'tx' | 'solanaTx' | 'btcAccounts' | 'btcTransfer' | 'btcPsbt' | 'other' = 'other';
    let btc: { to?: string; sats?: bigint; inputs?: number; broadcast?: boolean } | null = null;
    let messageText: string | null = null;
    // Les dApps envoient les paramètres soit en tableau ([{…}]), soit en objet ({…}).
    const p0: any = Array.isArray(p) ? p[0] : p; // eslint-disable-line @typescript-eslint/no-explicit-any
    let solana: ReturnType<typeof describeSolanaTransaction> = null;
    let text: string | null = null;
    let siwe = null;
    let typed = null;
    let tx: { to?: string; value: bigint; dataBytes: number; data?: string } | null = null;

    if (method === 'personal_sign' || method === 'eth_sign') {
      const hex = method === 'personal_sign' ? p[0] : p[1];
      text = typeof hex === 'string' ? (hexToText(hex) ?? (hex.startsWith('0x') ? null : hex)) : null;
      siwe = text ? parseSiwe(text) : null;
      kind = siwe ? 'siwe' : 'message';
      messageText = text;
    } else if (method === 'solana_signMessage' || method === 'bitcoin_signMessage' || method === 'signMessage') {
      // Solana : message en base58 (spec) ; Bitcoin : texte UTF-8.
      const raw = p0?.message ?? p0?.msg ?? (typeof p0 === 'string' ? p0 : '');
      messageText = decodeMessageText(String(raw ?? ''), method === 'solana_signMessage');
      kind = 'message';
    } else if (method === 'getAccountAddresses' || method === 'bitcoin_getAccountAddresses' || method === 'bitcoin_getAccounts' || method === 'getAccounts') {
      kind = 'btcAccounts';
    } else if (method === 'sendTransfer' || method === 'bitcoin_sendTransfer' || method === 'bitcoin_sendTransaction') {
      const to = p0?.recipientAddress ?? p0?.recipient ?? p0?.to;
      let sats: bigint | undefined;
      try { sats = p0?.amount != null ? BigInt(String(p0.amount)) : undefined; } catch { sats = undefined; }
      btc = { to: typeof to === 'string' ? to : undefined, sats };
      kind = 'btcTransfer';
    } else if (method === 'signPsbt' || method === 'bitcoin_signPsbt') {
      const inputs = Array.isArray(p0?.signInputs) ? p0.signInputs.length : Array.isArray(p0?.inputsToSign) ? p0.inputsToSign.length : undefined;
      btc = { inputs, broadcast: p0?.broadcast === true };
      kind = 'btcPsbt';
    } else if (method.startsWith('eth_signTypedData')) {
      typed = summarizeTypedData(p[1]);
      kind = 'typedData';
    } else if (method === 'eth_sendTransaction') {
      const t = p[0] ?? {};
      tx = {
        to: typeof t.to === 'string' ? t.to : undefined,
        value: t.value ? BigInt(t.value) : 0n,
        dataBytes: typeof t.data === 'string' ? Math.max(0, (t.data.length - 2) / 2) : 0,
        data: typeof t.data === 'string' ? t.data : undefined,
      };
      kind = 'tx';
    } else if (method === 'solana_signTransaction' || method === 'solana_signAllTransactions') {
      // Jupiter & co envoient des transactions v0 (Address Lookup Tables) : décodées et décrites.
      const raw = method === 'solana_signAllTransactions' ? p0?.transactions?.[0] ?? (Array.isArray(p0) ? p0[0] : undefined) : p0?.transaction ?? (typeof p0 === 'string' ? p0 : undefined);
      const w = useWallet.getState();
      const solAddr = (w.accounts.find((a) => a.index === w.activeAccountIndex) ?? w.accounts[0])?.solAddress;
      solana = typeof raw === 'string' ? describeSolanaTransaction(raw, solAddr) : null;
      kind = 'solanaTx';
    }

    const action =
      kind === 'siwe' ? t('siweAction') :
      kind === 'message' ? t('sigMessage') :
      kind === 'typedData' ? (typed?.primaryType ? `« ${typed.primaryType} »` : t('sigTypedData')) :
      kind === 'tx' ? t('sigTx') :
      kind === 'solanaTx' ? (solana?.action === 'swap' ? 'Swap' : t('sigTx')) :
      kind === 'btcTransfer' || kind === 'btcPsbt' ? t('sigTx') :
      kind === 'btcAccounts' ? t('receive') : method;

    // Anti-phishing : le domaine déclaré dans le SIWE doit être le site connecté.
    const phishing = !!(siwe && peer?.url && siweDomainMismatch(siwe.domain, peer.url));

    const decoded = tx ? decodeTx({ to: tx.to, value: tx.value, data: tx.data }) : null;
    const vc = request.verifyContext?.verified ?? {};
    const verify = { validation: vc.validation as 'VALID' | 'INVALID' | 'UNKNOWN' | undefined, isScam: !!vc.isScam };
    return { method, kind, text, siwe, typed, tx, chain, peer, action, phishing, decoded, verify, solana, btc, messageText };
  }, [request, sessions, t]);

  // Simulation (transactions uniquement).
  useEffect(() => {
    setSim(null);
    if (!info || info.kind !== 'tx' || !info.tx || !info.chain || !account) return;
    let alive = true;
    setSim('loading');
    (async () => {
      const d = info.decoded;
      const meta = d && (d.kind === 'transfer' || d.kind === 'approve') ? await getTokenMetadata(info.chain!, d.token).catch(() => null) : null;
      const s = await simulateTx(info.chain!, { from: account.address, to: info.tx!.to, value: info.tx!.value, data: info.tx!.data }, meta ? { symbol: meta.symbol, decimals: meta.decimals } : undefined);
      if (alive) setSim(s);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Token d'un Permit / Permit2 : symbole et décimales, pour ne jamais afficher « tes Permit2 ».
  useEffect(() => {
    setPermitToken(null);
    const addr = info?.typed?.token;
    if (!info || info.kind !== 'typedData' || !addr) return;
    const chain = listChains().find((c) => c.family === 'evm' && c.evmChainId === info.typed?.chainId) ?? info.chain;
    if (!chain) return;
    const local = (useTokenStore.getState().tokensByChain[chain.id] ?? []).find((tk) => tk.address.toLowerCase() === addr.toLowerCase());
    if (local) { setPermitToken({ symbol: local.symbol, decimals: local.decimals }); return; }
    let alive = true;
    getTokenMetadata(chain, addr).then((m) => { if (alive && m) setPermitToken({ symbol: m.symbol, decimals: m.decimals }); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Analyse de sécurité GoPlus (désactivable via Extensions → Analyse de sécurité).
  useEffect(() => {
    setRisk(null);
    setPhishSite(false);
    if (!useSettings.getState().securityScan) return;
    if (proposal) {
      const url = proposal.params?.proposer?.metadata?.url;
      if (url) isPhishingSite(url).then(setPhishSite).catch(() => {});
      return;
    }
    if (!info) return;
    const cid = info.chain?.evmChainId ?? 1;
    if (info.kind === 'tx' && info.tx?.to) {
      setRisk('loading');
      assessAddress(cid, info.tx.to).then(setRisk).catch(() => setRisk(null));
    } else if (info.kind === 'typedData' && info.typed?.verifyingContract) {
      setRisk('loading');
      assessAddress(cid, info.typed.verifyingContract).then(setRisk).catch(() => setRisk(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, proposal]);

  if (proposal) {
    const meta = proposal.params?.proposer?.metadata ?? {};
    return (
      <Overlay onCancel={() => { setConfirming(false); rejectProposal().catch(()=>{}); }}>
        <Text style={typography.title}>{t('dappConnection')}</Text>
        <GlassCard>
          <DappHeader name={meta.name ?? 'dApp'} url={meta.url ?? ''} icon={meta.icons?.[0]} />
          <View style={{ marginTop: spacing(1.5), gap: spacing(0.25) }}>
            <Text style={[typography.muted, { marginBottom: spacing(0.5) }]}>{t('permHeader')}</Text>
            <PermRow on fixed label={t('permSeeLabel')} />
            <PermRow on={allowTx} onToggle={() => setAllowTx((v) => !v)} label={t('permTxLabel')} />
            <PermRow on={allowSign} onToggle={() => setAllowSign((v) => !v)} label={t('permSignLabel')} />
            <Text style={[typography.muted, { marginTop: spacing(0.75) }]}>{t('cannotMove')}</Text>
          </View>
        </GlassCard>

        <SecBanner risk={null} phish={phishSite} />
        <Text style={typography.muted}>{t('connectNeedsConfirm')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}>
            <Button label={t('refuse')} variant="ghost" onPress={() => { setConfirming(false); rejectProposal().catch(() => {}); }} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t('connect')} onPress={() => setConfirming(true)} />
          </View>
        </View>

        <ConfirmUnlock
          visible={confirming}
          title={t('confirmConnection')}
          subtitle={meta.name ?? 'dApp'}
          perform={(unlock) => approveProposal(unlock, { tx: allowTx, sign: allowSign })}
          onDone={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
        />
      </Overlay>
    );
  }

  if (request && info) {
    const { kind, siwe, typed, tx, chain, peer, phishing, decoded, verify } = info;
    const simulating = sim === 'loading';
    const simulation = sim && sim !== 'loading' ? sim : null;
    const explanation = explainRequest({
      kind,
      method: info.method,
      domain: peer?.url ? hostOf(peer.url) : undefined,
      siwe,
      siweMismatch: phishing,
      typed,
      tokenSymbol: permitToken?.symbol ?? null,
      tokenDecimals: permitToken?.decimals ?? null,
      solana: info.solana,
      btc: info.btc,
      messageText: info.messageText,
      decoded,
      simulation,
      verify,
      addressRisk: risk && risk !== 'loading' ? risk : null,
      phishingSite: phishSite,
      nativeSymbol: chain?.nativeSymbol,
    });
    const rawJson = JSON.stringify(request.params?.request?.params ?? {}, null, 2).slice(0, 1600);

    // « Réduire au montant exact » : approve illimité → montant issu de la simulation
    // (ce que le routeur va prélever) ; sans simulation, on ne devine pas.
    const reducible = decoded?.kind === 'approve' && decoded.unlimited;
    const reducedAmount = simulation?.changes.find((c) => c.direction === 'out' && c.contract && decoded?.kind === 'approve' && c.contract.toLowerCase() === decoded.token.toLowerCase())?.rawAmount;
    const [overrideData, setOverride] = [reduceRef.current, (v: string | null) => (reduceRef.current = v)];
    const onReduce = () => {
      if (!reducible || !reducedAmount || decoded?.kind !== 'approve') return;
      const data = new Interface(['function approve(address,uint256)']).encodeFunctionData('approve', [decoded.spender, BigInt(reducedAmount)]);
      setOverride(data);
      setConfirming(true);
    };

    const perform = async (unlock: Unlock) => {
      await approveRequest(unlock, overrideData ?? undefined);
      setOverride(null);
      sound.success();
    };
    const reject = () => {
      setConfirming(false);
      setOverride(null);
      rejectRequest().catch(() => {});
    };

    return (
      <>
        <SignSheet
          visible={!confirming}
          peer={peer ? { name: peer.name, url: peer.url, icon: peer.icon } : null}
          verify={verify}
          explanation={explanation}
          simulating={simulating}
          network={chain?.name}
          address={account?.address}
          raw={rawJson}
          onReject={reject}
          onSign={() => setConfirming(true)}
          onReduceApproval={reducible && reducedAmount ? onReduce : undefined}
          signLabel={kind === 'siwe' ? t("wcSignConnect") : kind === 'tx' ? t("wcSignConfirm") : t("wcSign")}
        />
        <ConfirmUnlock
          visible={confirming}
          title={explanation.title}
          subtitle={explanation.headline}
          perform={perform}
          onDone={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
          aiContext={tx ? { to: tx.to ?? '', value: tx.value.toString(), method: info.method, url: peer?.url } : undefined}
        />
      </>
    );
  }

  return null;
}
