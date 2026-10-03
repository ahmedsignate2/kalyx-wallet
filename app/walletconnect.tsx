import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import { ActionDisc, NovaHero, Pulse, Rise, SectionLabel } from '../ui/nova';
import { DappLogo } from '../ui/browser/DappTile';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWalletConnect } from '../lib/walletconnect';
import { useTonConnect } from '../lib/tonconnect/store';
import { looksLikeTonConnect } from '../src/domain/tonconnect/connectLink';
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

  const tonSessions = useTonConnect((s) => s.sessions);
  const openTonLink = useTonConnect((s) => s.openLink);
  const disconnectTon = useTonConnect((s) => s.disconnect);

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
    // Un lien TON Connect collé ici part vers son propre flux (ui/TonConnectHost).
    if (looksLikeTonConnect(uri)) {
      setBusy(true);
      const err = await openTonLink(uri).finally(() => setBusy(false));
      if (err) toast.error(t('connectionFailed'), t(err as never));
      else setUri('');
      return;
    }
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
      <ScreenHeader />
      <NovaHero icon="walletconnect" title="WalletConnect" subtitle={t('wcIntro')} />

      {/* Les deux façons de se connecter, en disques : scanner d'abord, coller ensuite. */}
      <View style={{ flexDirection: 'row', gap: spacing(1), marginVertical: spacing(1) }}>
        <ActionDisc index={0} tone="primary" icon="scan" label={t('scanQr')} onPress={() => router.push('/scan')} />
        <ActionDisc index={1} icon="copy" label={t('paste')} onPress={onPaste} />
        <View style={{ flex: 2 }} />
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{t('wcLink')}</Text>
        </View>
        <TextInput value={uri} onChangeText={setUri} placeholder="wc:…" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false} style={{ color: colors.text, fontSize: 14, paddingVertical: spacing(1) }} />
      </Card>
      <Button label={busy ? t('connecting') : t('connect')} loading={busy || !ready} onPress={onConnect} />


        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) }}>
          <SectionLabel>{t('wcSessions')}</SectionLabel>
          {sessions.length > 1 ? (
            <Text onPress={() => disconnectAll()} style={{ color: colors.danger, fontFamily: fonts.semibold, fontSize: 13 }}>{t('disconnectAll')}</Text>
          ) : null}
        </View>
        {sessions.length === 0 ? (
          <Muted>{t('noWcSessions')}</Muted>
        ) : (
          sessions.map((s) => (
            <Rise key={s.topic}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), borderRadius: 22 }}>
              <SessionLogo url={s.url} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.body} numberOfLines={1}>{s.name}</Text>
                <Muted>{s.url.replace(/^https?:\/\//, '')}</Muted>
              </View>
              <DangerPill label={t('disconnect')} onPress={() => disconnect(s.topic)} />
            </Card>
            </Rise>
          ))
        )}

        {/* Apps TON connectées par TON Connect */}
        <View style={{ marginTop: spacing(2) }}><SectionLabel>{t('tcConnectedApps')}</SectionLabel></View>
        {tonSessions.length === 0 ? (
          <Muted>{t('tcNoApps')}</Muted>
        ) : (
          tonSessions.map((s) => (
            <Rise key={s.clientId}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), borderRadius: 22 }}>
              <SessionLogo url={s.manifest.url} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.body} numberOfLines={1}>{s.manifest.name}</Text>
                <Muted>{s.manifest.url.replace(/^https:\/\//, '')}</Muted>
              </View>
              <DangerPill label={t('tcDisconnect')} onPress={() => void disconnectTon(s.clientId)} />
            </Card>
            </Rise>
          ))
        )}

        {/* dApps connectées via le navigateur intégré */}
        <View style={{ marginTop: spacing(2) }}><SectionLabel>{t('browserDapps')}</SectionLabel></View>
        {connections.length === 0 ? (
          <Muted>{t('noBrowserDapps')}</Muted>
        ) : (
          connections.map((c) => (
            <Rise key={c.host}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), borderRadius: 22 }}>
              <SessionLogo url={`https://${c.host}`} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.body} numberOfLines={1}>{c.title || c.host}</Text>
                <Muted>{c.host} · {ago(c.at)}</Muted>
              </View>
              <DangerPill label={t('forget')} onPress={() => removeConnection(c.host)} />
            </Card>
            </Rise>
          ))
        )}

        {/* Journal des signatures/transactions (navigateur) */}
        {signatures.length > 0 ? (
          <>
            <View style={{ marginTop: spacing(2) }}><SectionLabel>{t('recentSignatures')}</SectionLabel></View>
            <Card style={{ gap: 0 }}>
              {signatures.slice(0, 20).map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body} numberOfLines={1}>{SIG_LABEL[s.kind]}</Text>
                    <Muted>{s.host}</Muted>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{ago(s.at)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
    </Screen>
  );
}


/** Logo du site + point vert qui pulse : la session est vivante. */
function SessionLogo({ url }: { url: string }) {
  const { colors } = useTheme();
  let host = '';
  try { host = new URL(url).host; } catch { host = url.replace(/^https?:\/\//, '').split('/')[0]; }
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <DappLogo host={host} size={30} />
      <View style={{ position: 'absolute', right: -1, bottom: -1, padding: 2, borderRadius: 8, backgroundColor: colors.surface1 }}>
        <Pulse size={8} color={colors.up} />
      </View>
    </View>
  );
}

/** Action destructrice, en pilule rouge discrète (et non un simple texte). */
function DangerPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <KPressable onPress={onPress} haptic="light" accessibilityLabel={label} style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: 'rgba(255,77,94,0.10)' }}>
      <Text style={{ color: colors.danger, fontFamily: fonts.semibold, fontSize: 13 }}>{label}</Text>
    </KPressable>
  );
}
