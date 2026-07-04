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
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, Image } from 'react-native';
import { GlassCard, ErrorBox, GradientAvatar } from './premium';
import { Button } from './components';
import { Icon, type IconName } from './icon';
import { colors, radii, spacing, typography } from './theme';
import { useWalletConnect } from '../lib/walletconnect';
import { useWallet } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';
import {
  hexToText,
  parseSiwe,
  siweDomainMismatch,
  summarizeTypedData,
  formatBalance,
  listChains,
} from '../src';

function shorten(a: string) {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}
function hostOf(url: string) {
  return url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || url;
}

function Overlay({ children }: { children: React.ReactNode }) {
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

/** En-tête dApp : logo (ou avatar), nom, domaine. */
function DappHeader({ name, url, icon }: { name: string; url: string; icon?: string }) {
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
  const proposal = useWalletConnect((s) => s.proposal);
  const request = useWalletConnect((s) => s.request);
  const sessions = useWalletConnect((s) => s.sessions);
  const approveProposal = useWalletConnect((s) => s.approveProposal);
  const rejectProposal = useWalletConnect((s) => s.rejectProposal);
  const approveRequest = useWalletConnect((s) => s.approveRequest);
  const rejectRequest = useWalletConnect((s) => s.rejectRequest);
  const account = useWallet((s) => s.account);

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

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
    let tx: { to?: string; value: bigint; dataBytes: number } | null = null;

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
      };
      kind = 'tx';
    }

    const action =
      kind === 'siwe' ? 'Connexion (Sign-In)' :
      kind === 'message' ? 'Signature de message' :
      kind === 'typedData' ? `Signature ${typed?.primaryType ? `« ${typed.primaryType} »` : 'de données'}` :
      kind === 'tx' ? 'Transaction' : method;

    // Anti-phishing : le domaine déclaré dans le SIWE doit être le site connecté.
    const phishing = !!(siwe && peer?.url && siweDomainMismatch(siwe.domain, peer.url));

    return { method, kind, text, siwe, typed, tx, chain, peer, action, phishing };
  }, [request, sessions]);

  if (proposal) {
    const meta = proposal.params?.proposer?.metadata ?? {};
    return (
      <Overlay>
        <Text style={typography.title}>Connexion dApp</Text>
        <GlassCard>
          <DappHeader name={meta.name ?? 'dApp'} url={meta.url ?? ''} icon={meta.icons?.[0]} />
          <View style={{ marginTop: spacing(1.5), gap: spacing(0.5) }}>
            <Text style={typography.muted}>✓ Peut voir ton adresse publique et tes soldes</Text>
            <Text style={typography.muted}>✓ Peut te proposer des transactions à signer</Text>
            <Text style={typography.muted}>✗ Ne peut RIEN déplacer sans ta signature + PIN</Text>
          </View>
        </GlassCard>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Button label="Refuser" variant="ghost" onPress={() => rejectProposal()} /></View>
          <View style={{ flex: 1 }}><Button label="Connecter" onPress={() => approveProposal().catch(() => {})} /></View>
        </View>
      </Overlay>
    );
  }

  if (request && info) {
    const { kind, siwe, typed, tx, chain, peer, action, phishing } = info;
    const isTx = kind === 'tx';
    const title = kind === 'siwe' ? 'Demande de connexion' : isTx ? 'Transaction demandée' : 'Signature demandée';
    const submit = async () => {
      if (pin.length < 6) {
        setError('Entre ton PIN pour signer.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await approveRequest(pin);
        setPin('');
        setShowRaw(false);
      } catch (e) {
        setError(friendlyTxError(e));
      } finally {
        setBusy(false);
      }
    };
    const reject = () => {
      setPin('');
      setError(null);
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
          <ErrorBox message={`⚠️ Le message dit venir de « ${siwe?.domain} » mais tu es connecté à « ${hostOf(peer?.url ?? '')} ». Risque de phishing — refuse.`} />
        ) : null}

        <GlassCard>
          {peer?.url ? <InfoRow icon="dapps" label="Site" value={hostOf(peer.url)} /> : null}
          {account ? <InfoRow icon="wallet" label="Adresse" value={shorten(account.address)} divider={!!peer?.url} /> : null}
          {chain ? <InfoRow icon="networks" label="Réseau" value={chain.name} divider /> : null}
          <InfoRow icon="phrase" label="Action" value={action} divider />
        </GlassCard>

        <GlassCard>
          {kind === 'siwe' && siwe ? (
            <>
              <Text style={typography.bodyStrong}>Se connecter à {siwe.domain}</Text>
              {siwe.statement ? <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>{siwe.statement}</Text> : null}
              <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                Signature gratuite (aucun frais) : elle prouve seulement que tu possèdes cette adresse.
              </Text>
            </>
          ) : kind === 'message' ? (
            <>
              <Text style={typography.muted}>Message à signer</Text>
              <ScrollView style={{ maxHeight: 160, marginTop: spacing(0.5) }}>
                <Text style={[typography.bodyStrong, { fontSize: 14 }]} selectable>
                  {info.text ?? 'Message illisible (données binaires) — prudence.'}
                </Text>
              </ScrollView>
              <Text style={[typography.muted, { marginTop: spacing(1) }]}>Ne signe que si tu fais confiance au site.</Text>
            </>
          ) : kind === 'typedData' ? (
            <>
              <Text style={typography.bodyStrong}>{typed?.name ?? 'Données structurées'}</Text>
              {typed?.primaryType ? <Text style={typography.muted}>Type : {typed.primaryType}</Text> : null}
              {typed?.verifyingContract ? <Text style={typography.muted}>Contrat : {shorten(typed.verifyingContract)}</Text> : null}
              <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                {typed?.primaryType === 'Permit'
                  ? '⚠️ Un « Permit » autorise un contrat à dépenser tes tokens. Vérifie le site.'
                  : 'Vérifie le contenu avant de signer.'}
              </Text>
            </>
          ) : isTx && tx ? (
            <>
              {tx.to ? <InfoRow icon="send" label="Vers" value={shorten(tx.to)} /> : null}
              <InfoRow icon="currency" label="Montant" value={`${formatBalance(tx.value, chain?.nativeDecimals ?? 18)} ${chain?.nativeSymbol ?? ''}`} divider={!!tx.to} />
              {tx.dataBytes > 0 ? <InfoRow icon="developer" label="Données" value={`${tx.dataBytes} octets (appel de contrat)`} divider /> : null}
              <Text style={[typography.muted, { marginTop: spacing(1) }]}>⚠️ Vérifie bien : ceci peut déplacer des fonds.</Text>
            </>
          ) : (
            <Text style={typography.muted}>Requête : {info.method}</Text>
          )}

          <Pressable onPress={() => setShowRaw((v) => !v)} hitSlop={8}>
            <Text style={[typography.muted, { marginTop: spacing(1), color: colors.accent }]}>
              {showRaw ? 'Masquer les détails techniques' : 'Détails techniques'}
            </Text>
          </Pressable>
          {showRaw ? (
            <ScrollView style={{ maxHeight: 140, marginTop: spacing(0.5) }}>
              <Text style={[typography.muted, { fontFamily: 'monospace', fontSize: 11 }]} selectable>
                {rawJson}
              </Text>
            </ScrollView>
          ) : null}

          <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, marginTop: spacing(1), paddingTop: spacing(1) }}>
            <Text style={typography.muted}>PIN</Text>
            <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} editable={!busy} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
          </View>
        </GlassCard>

        {error ? <ErrorBox message={error} /> : null}
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Button label="Refuser" variant="ghost" onPress={reject} /></View>
          <View style={{ flex: 1 }}>
            <Button label={busy ? 'Signature…' : kind === 'siwe' ? 'Se connecter' : 'Signer'} loading={busy} onPress={submit} />
          </View>
        </View>
      </Overlay>
    );
  }

  return null;
}
