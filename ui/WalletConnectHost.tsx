/**
 * Fenêtres globales WalletConnect : proposition de session + requête à signer.
 * Monté à la racine pour capter les événements quel que soit l'écran.
 */
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { GlassCard, ErrorBox } from './premium';
import { Button } from './components';
import { colors, radii, spacing, typography } from './theme';
import { useWalletConnect } from '../lib/walletconnect';
import { friendlyTxError } from '../lib/txError';

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

export function WalletConnectHost() {
  const proposal = useWalletConnect((s) => s.proposal);
  const request = useWalletConnect((s) => s.request);
  const approveProposal = useWalletConnect((s) => s.approveProposal);
  const rejectProposal = useWalletConnect((s) => s.rejectProposal);
  const approveRequest = useWalletConnect((s) => s.approveRequest);
  const rejectRequest = useWalletConnect((s) => s.rejectRequest);

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (proposal) {
    const meta = proposal.params?.proposer?.metadata ?? {};
    return (
      <Overlay>
        <Text style={typography.title}>Connexion dApp</Text>
        <GlassCard>
          <Text style={typography.bodyStrong}>{meta.name ?? 'dApp'}</Text>
          <Text style={typography.muted}>{meta.url ?? ''}</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            Cette application demande à voir ton adresse et à te proposer des transactions à signer.
          </Text>
        </GlassCard>
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Button label="Refuser" variant="ghost" onPress={() => rejectProposal()} /></View>
          <View style={{ flex: 1 }}><Button label="Connecter" onPress={() => approveProposal().catch(() => {})} /></View>
        </View>
      </Overlay>
    );
  }

  if (request) {
    const method: string = request.params?.request?.method ?? '';
    const isTx = method === 'eth_sendTransaction';
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
      } catch (e) {
        setError(friendlyTxError(e));
      } finally {
        setBusy(false);
      }
    };
    const reject = () => {
      setPin('');
      setError(null);
      rejectRequest().catch(() => {});
    };
    return (
      <Overlay>
        <Text style={typography.title}>{isTx ? 'Transaction demandée' : 'Signature demandée'}</Text>
        <GlassCard>
          <Text style={typography.bodyStrong}>{method}</Text>
          <ScrollView style={{ maxHeight: 180, marginTop: spacing(1) }}>
            <Text style={[typography.muted, { fontFamily: 'monospace', fontSize: 11 }]} selectable>
              {JSON.stringify(request.params?.request?.params ?? {}, null, 2).slice(0, 1200)}
            </Text>
          </ScrollView>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            {isTx ? 'Vérifie bien : ceci peut déplacer des fonds.' : 'Ne signe que si tu fais confiance au site.'}
          </Text>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, marginTop: spacing(1), paddingTop: spacing(1) }}>
            <Text style={typography.muted}>PIN</Text>
            <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} editable={!busy} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
          </View>
        </GlassCard>
        {error ? <ErrorBox message={error} /> : null}
        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}><Button label="Refuser" variant="ghost" onPress={reject} /></View>
          <View style={{ flex: 1 }}><Button label={busy ? 'Signature…' : 'Approuver'} loading={busy} onPress={submit} /></View>
        </View>
      </Overlay>
    );
  }

  return null;
}
