import { ScreenHeader } from '../ui/kit';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWalletConnect } from '../lib/walletconnect';
import { useDappActivity, type SigKind } from '../lib/dappActivity';
import { toast } from '../lib/toast';
import { useT } from '../lib/settingsStore';

export default function WalletConnectScreen() {
  const { colors, typography } = useTheme();
  const t = useT();
  const SIG_LABEL: Record<SigKind, string> = { sign: t('sigMessage'), typedData: t('sigTypedData'), tx: t('sigTx') };
  const ago = (ts: number): string => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return t('justNow');
    if (s < 3600) return t('minsAgo').replace('{n}', String(Math.floor(s / 60)));
    if (s < 86400) return t('hoursAgo').replace('{n}', String(Math.floor(s / 3600)));
    return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  };
  const configured = useWalletConnect((s) => s.configured);
  const ready = useWalletConnect((s) => s.ready);
  const sessions = useWalletConnect((s) => s.sessions);
  const pair = useWalletConnect((s) => s.pair);
  const disconnect = useWalletConnect((s) => s.disconnect);
  const disconnectAll = useWalletConnect((s) => s.disconnectAll);

  const connections = useDappActivity((s) => s.connections);
  const signatures = useDappActivity((s) => s.signatures);
  const removeConnection = useDappActivity((s) => s.removeConnection);
  const loadActivity = useDappActivity((s) => s.load);
  useEffect(() => { loadActivity(); }, [loadActivity]);

  const [uri, setUri] = useState('');
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <Screen>
      <ScreenHeader />
        <Title>WalletConnect</Title>
        <Muted>{t('wcNotConfigured')}</Muted>
      </Screen>
    );
  }

  const onConnect = async () => {
    if (!uri.trim().startsWith('wc:')) {
      toast.error(t('invalidUri'), t('pasteWcLink'));
      return;
    }
    setBusy(true);
    try {
      await pair(uri);
      setUri('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/expired/i.test(msg)) {
        toast.error(t('linkExpired'), t('linkExpiredBody'));
      } else {
        toast.error(t('connectionFailed'), t('linkUnusable'));
      }
      setUri('');
    } finally {
      setBusy(false);
    }
  };

  const onPaste = async () => setUri(await Clipboard.getStringAsync());

  return (
    <Screen scroll>
      <Title>WalletConnect</Title>
      <Muted>{t('wcIntro')}</Muted>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{t('wcLink')}</Text>
          <Text onPress={onPaste} style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('paste')}</Text>
        </View>
        <TextInput value={uri} onChangeText={setUri} placeholder="wc:…" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={{ color: colors.text, fontSize: 14, paddingVertical: spacing(1) }} />
      </Card>
      <Button label={busy ? t('connecting') : t('connect')} loading={busy || !ready} onPress={onConnect} />


        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) }}>
          <Text style={typography.section}>{t('wcSessions')}</Text>
          {sessions.length > 1 ? (
            <Text onPress={() => disconnectAll()} style={{ color: colors.danger, fontFamily: fonts.semibold, fontSize: 13 }}>{t('disconnectAll')}</Text>
          ) : null}
        </View>
        {sessions.length === 0 ? (
          <Muted>{t('noWcSessions')}</Muted>
        ) : (
          sessions.map((s) => (
            <Card key={s.topic} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{s.name}</Text>
                <Muted>{s.url}</Muted>
              </View>
              <Text onPress={() => disconnect(s.topic)} style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('disconnect')}</Text>
            </Card>
          ))
        )}

        {/* dApps connectées via le navigateur intégré */}
        <Text style={[typography.section, { marginTop: spacing(2) }]}>{t('browserDapps')}</Text>
        {connections.length === 0 ? (
          <Muted>{t('noBrowserDapps')}</Muted>
        ) : (
          connections.map((c) => (
            <Card key={c.host} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body} numberOfLines={1}>{c.title || c.host}</Text>
                <Muted>{c.host} · {ago(c.at)}</Muted>
              </View>
              <Text onPress={() => removeConnection(c.host)} style={{ color: colors.danger, fontFamily: fonts.semibold }}>{t('forget')}</Text>
            </Card>
          ))
        )}

        {/* Journal des signatures/transactions (navigateur) */}
        {signatures.length > 0 ? (
          <>
            <Text style={[typography.section, { marginTop: spacing(2) }]}>{t('recentSignatures')}</Text>
            <Card style={{ gap: 0 }}>
              {signatures.slice(0, 20).map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardBorder }}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body} numberOfLines={1}>{SIG_LABEL[s.kind]}</Text>
                    <Muted>{s.host}</Muted>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{ago(s.at)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
    </Screen>
  );
}
