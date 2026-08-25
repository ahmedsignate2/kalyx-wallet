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
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Image } from 'react-native';
import { GlassCard, ErrorBox, GradientAvatar } from './premium';
import { Button } from './components';
import { ConfirmUnlock } from './ConfirmUnlock';
import { Icon, type IconName } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { TxPreview } from './TxPreview';
import { useWalletConnect } from '../lib/walletconnect';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { sound } from '../lib/sound';
import {
  hexToText,
  parseSiwe,
  siweDomainMismatch,
  summarizeTypedData,
  formatBalance,
  listChains,
  assessAddress,
  isPhishingSite,
  type RiskAssessment,
} from '../src';

function shorten(a: string) {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}
function hostOf(url: string) {
  return url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || url;
}

function Overlay({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
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
        {on ? <Icon name="check" size={14} color="#fff" /> : null}
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

/** Ligne icône + label + valeur du résumé de demande. */
function InfoRow({ icon, label, value, divider }: { icon: IconName; label: string; value: string; divider?: boolean }) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1.25),
        paddingVertical: spacing(1),
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.glassBorder,
      }}
    >
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text style={[typography.muted, { width: 74 }]}>{label}</Text>
      <Text style={[typography.bodyStrong, { flex: 1, fontSize: 14 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
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
  const [showRaw, setShowRaw] = useState(false);
  // Autorisations granulaires accordées au site (cases à la connexion).
  const [allowTx, setAllowTx] = useState(true);
  const [allowSign, setAllowSign] = useState(true);
  // Analyse de sécurité GoPlus (parité avec le navigateur dApps intégré).
  const [risk, setRisk] = useState<RiskAssessment | 'loading' | null>(null);
  const [phishSite, setPhishSite] = useState(false);

  // Décodage lisible de la requête (mémoïsé : parsing hex/SIWE/EIP-712).
  const info = useMemo(() => {
    if (!request) return null;
    const method: string = request.params?.request?.method ?? '';
    const p: any[] = request.params?.request?.params ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const chain = listChains().find((c) => c.family === 'evm' && `eip155:${c.evmChainId}` === request.params?.chainId);
    const peer = sessions.find((s) => s.topic === request.topic);

    let kind: 'siwe' | 'message' | 'typedData' | 'tx' | 'other' = 'other';
    let text: string | null = null;
    let siwe = null;
    let typed = null;
    let tx: { to?: string; value: bigint; dataBytes: number; data?: string } | null = null;

    if (method === 'personal_sign' || method === 'eth_sign') {
      const hex = method === 'personal_sign' ? p[0] : p[1];
      text = typeof hex === 'string' ? (hexToText(hex) ?? (hex.startsWith('0x') ? null : hex)) : null;
      siwe = text ? parseSiwe(text) : null;
      kind = siwe ? 'siwe' : 'message';
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
    }

    const action =
      kind === 'siwe' ? t('siweAction') :
      kind === 'message' ? t('sigMessage') :
      kind === 'typedData' ? (typed?.primaryType ? `« ${typed.primaryType} »` : t('sigTypedData')) :
      kind === 'tx' ? t('sigTx') : method;

    // Anti-phishing : le domaine déclaré dans le SIWE doit être le site connecté.
    const phishing = !!(siwe && peer?.url && siweDomainMismatch(siwe.domain, peer.url));

    return { method, kind, text, siwe, typed, tx, chain, peer, action, phishing };
  }, [request, sessions, t]);

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
      <Overlay>
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
    const { kind, siwe, typed, tx, chain, peer, action, phishing } = info;
    const isTx = kind === 'tx';
    const title = kind === 'siwe' ? t('connectionRequest') : isTx ? t('txRequested') : t('signatureRequested');
    const perform = async (unlock: Unlock) => {
      await approveRequest(unlock);
      sound.success();
      setShowRaw(false);
    };
    const reject = () => {
      setConfirming(false);
      setShowRaw(false);
      rejectRequest().catch(() => {});
    };
    const rawJson = JSON.stringify(request.params?.request?.params ?? {}, null, 2).slice(0, 1600);

    return (
      <Overlay>
        <Text style={typography.title}>{title}</Text>

        {peer ? (
          <GlassCard>
            <DappHeader name={peer.name} url={peer.url} icon={peer.icon} />
          </GlassCard>
        ) : null}

        {phishing ? (
          <ErrorBox message={t('siweMismatch').replace('{a}', siwe?.domain ?? '').replace('{b}', hostOf(peer?.url ?? ''))} />
        ) : null}

        <SecBanner risk={risk} phish={phishSite} />

        <GlassCard>
          {peer?.url ? <InfoRow icon="dapps" label={t('siteLabel')} value={hostOf(peer.url)} /> : null}
          {account ? <InfoRow icon="wallet" label={t('addressLabel')} value={shorten(account.address)} divider={!!peer?.url} /> : null}
          {chain ? <InfoRow icon="networks" label={t('network')} value={chain.name} divider /> : null}
          <InfoRow icon="phrase" label={t('actionLabel')} value={action} divider />
        </GlassCard>

        <GlassCard>
          {kind === 'siwe' && siwe ? (
            <>
              <Text style={typography.bodyStrong}>{t('signInTo').replace('{domain}', siwe.domain)}</Text>
              {siwe.statement ? <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>{siwe.statement}</Text> : null}
              <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                {t('freeSigProves')}
              </Text>
            </>
          ) : kind === 'message' ? (
            <>
              <Text style={typography.muted}>{t('messageToSign')}</Text>
              <ScrollView style={{ maxHeight: 160, marginTop: spacing(0.5) }}>
                <Text style={[typography.bodyStrong, { fontSize: 14 }]} selectable>
                  {info.text ?? t('binaryMessage')}
                </Text>
              </ScrollView>
              <Text style={[typography.muted, { marginTop: spacing(1) }]}>{t('signOnlyIfTrust')}</Text>
            </>
          ) : kind === 'typedData' ? (
            <>
              <Text style={typography.bodyStrong}>{typed?.name ?? t('structuredData')}</Text>
              {typed?.primaryType ? <Text style={typography.muted}>{t('typeWord')} : {typed.primaryType}</Text> : null}
              {typed?.verifyingContract ? <Text style={typography.muted}>{t('contractLabel')} : {shorten(typed.verifyingContract)}</Text> : null}
              {/* Champs lisibles extraits (spender, montant, échéance) — critiques pour un Permit. */}
              {typed?.details?.map((d) => {
                const danger = d.value.includes('⚠️');
                const val = d.value.length > 24 && d.value.startsWith('0x') ? shorten(d.value) : d.value;
                return (
                  <View key={d.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1), marginTop: 2 }}>
                    <Text style={typography.muted}>{d.label}</Text>
                    <Text style={[typography.bodyStrong, { color: danger ? colors.danger : colors.text, flexShrink: 1, textAlign: 'right' }]}>{val}</Text>
                  </View>
                );
              })}
              <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                {typed?.primaryType === 'Permit' || typed?.details?.length
                  ? t('permitWarning')
                  : t('verifyBeforeSign')}
              </Text>
            </>
          ) : isTx && tx ? (
            chain ? (
              <TxPreview tx={{ to: tx.to, value: tx.value, data: tx.data }} chain={chain} />
            ) : (
              <>
                {tx.to ? <InfoRow icon="send" label={t('toLabel')} value={shorten(tx.to)} /> : null}
                <InfoRow icon="currency" label={t('amount')} value={`${formatBalance(tx.value, 18)} ETH`} divider={!!tx.to} />
                <Text style={[typography.muted, { marginTop: spacing(1) }]}>{t('checkMovesFunds')}</Text>
              </>
            )
          ) : (
            <Text style={typography.muted}>{t('requestLabel')} {info.method}</Text>
          )}

          <Pressable onPress={() => setShowRaw((v) => !v)} hitSlop={8}>
            <Text style={[typography.muted, { marginTop: spacing(1), color: colors.accent }]}>
              {showRaw ? t('hideTechDetails') : t('techDetails')}
            </Text>
          </Pressable>
          {showRaw ? (
            <ScrollView style={{ maxHeight: 140, marginTop: spacing(0.5) }}>
              <Text style={[typography.muted, { fontFamily: 'monospace', fontSize: 11 }]} selectable>
                {rawJson}
              </Text>
            </ScrollView>
          ) : null}
        </GlassCard>

        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Button label={t('refuse')} variant="ghost" onPress={reject} /></View>
          <View style={{ flex: 1 }}>
            <Button label={kind === 'siwe' ? t('signIn') : t('sign')} onPress={() => setConfirming(true)} />
          </View>
        </View>

        <ConfirmUnlock
          visible={confirming}
          title={kind === 'siwe' ? t('confirmConnection') : isTx ? t('confirmTx') : t('confirmSignature')}
          subtitle={peer?.name ?? action}
          perform={perform}
          onDone={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
        />
      </Overlay>
    );
  }

  return null;
}
