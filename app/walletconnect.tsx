import { ScreenHeader, Pressable as KPressable, Button, Card, Screen, Text as KText } from '../ui/kit';
import { ActionDisc, NovaHero, Pulse, Rise, SectionLabel } from '../ui/nova';
import { DappLogo } from '../ui/browser/DappTile';
import { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { fonts, spacing, useTheme, fontSize, radii } from '../ui/theme';
import { useWalletConnect, isKalyxExtensionSession, type WcSession } from '../lib/walletconnect';
import { presenceOf, type Presence } from '../lib/wcPresence';
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
  const presence = useWalletConnect((s) => s.presence);
  const checking = useWalletConnect((s) => s.checking);
  const checkPresence = useWalletConnect((s) => s.checkPresence);
  // À l'ouverture : chaque connexion est sondée (une réponse = elle est vraiment là).
  useEffect(() => { if (ready) void checkPresence(); }, [ready, sessions.length, checkPresence]);
  // Les « il y a 3 min » avancent tant que l'écran est ouvert.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(id); }, []);

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
      <Screen layout="form">
      <ScreenHeader />
        <KText variant="heading">WalletConnect</KText>
        <KText variant="label">{t('wcNotConfigured')}</KText>
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
    <Screen layout="form" scroll>
      <ScreenHeader />
      <NovaHero icon="walletconnect" title="WalletConnect" subtitle={t('wcIntro')} />

      {/* Les deux façons de se connecter, en disques : scanner d'abord, coller ensuite. */}
      <View style={{ flexDirection: 'row', gap: spacing(1), marginVertical: spacing(1) }}>
        <ActionDisc index={0} tone="primary" icon="scan" label={t('scanQr')} onPress={() => router.push('/scan')} />
        <ActionDisc index={1} icon="copy" label={t('paste')} onPress={onPaste} />
        <View style={{ flex: 2 }} />
      </View>

      <Card padding="xl" gap="md">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{t('wcLink')}</Text>
        </View>
        <TextInput value={uri} onChangeText={setUri} placeholder="wc:…" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false} style={{ color: colors.text, fontSize: fontSize.md, paddingVertical: spacing(1) }} />
      </Card>
      <Button label={busy ? t('connecting') : t('connect')} loading={busy || !ready} onPress={onConnect} />


        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) }}>
          <SectionLabel>{t('wcSessions')}</SectionLabel>
          <View style={{ flexDirection: 'row', gap: spacing(2) }}>
            {sessions.length > 0 ? (
              <Text onPress={() => void checkPresence()} accessibilityRole="button" style={{ color: colors.textSecondary, fontFamily: fonts.semibold, fontSize: fontSize.sm }}>{t('wcCheck')}</Text>
            ) : null}
            {sessions.length > 1 ? (
              <Text onPress={() => disconnectAll()} accessibilityRole="button" style={{ color: colors.danger, fontFamily: fonts.semibold, fontSize: fontSize.sm }}>{t('disconnectAll')}</Text>
            ) : null}
          </View>
        </View>
        {sessions.length === 0 ? (
          <KText variant="label">{t('noWcSessions')}</KText>
        ) : (
          <>
            {sessions.map((s) => (
              <Rise key={s.topic}>
                <WcSessionCard s={s} lastSeen={presence[s.topic]} checking={checking.includes(s.topic)} ago={ago} onDisconnect={() => void disconnect(s.topic)} />
              </Rise>
            ))}
            <KText variant="label">{t('wcPresHow')}</KText>
          </>
        )}

        {/* Apps TON connectées par TON Connect */}
        <View style={{ marginTop: spacing(2) }}><SectionLabel>{t('tcConnectedApps')}</SectionLabel></View>
        {tonSessions.length === 0 ? (
          <KText variant="label">{t('tcNoApps')}</KText>
        ) : (
          tonSessions.map((s) => (
            <Rise key={s.clientId}>
            <Card padding="xl" gap="md" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <SessionLogo url={s.manifest.url} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.body} numberOfLines={1}>{s.manifest.name}</Text>
                <KText variant="label">{s.manifest.url.replace(/^https:\/\//, '')}</KText>
              </View>
              <DangerPill label={t('tcDisconnect')} onPress={() => void disconnectTon(s.clientId)} />
            </Card>
            </Rise>
          ))
        )}

        {/* dApps connectées via le navigateur intégré */}
        <View style={{ marginTop: spacing(2) }}><SectionLabel>{t('browserDapps')}</SectionLabel></View>
        {connections.length === 0 ? (
          <KText variant="label">{t('noBrowserDapps')}</KText>
        ) : (
          connections.map((c) => (
            <Rise key={c.host}>
            <Card padding="xl" gap="md" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <SessionLogo url={`https://${c.host}`} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={typography.body} numberOfLines={1}>{c.title || c.host}</Text>
                <KText variant="label">{c.host} · {ago(c.at)}</KText>
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
            <Card padding="xl" gap="md" style={{ gap: 0 }}>
              {signatures.slice(0, 20).map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing(1), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body} numberOfLines={1}>{SIG_LABEL[s.kind]}</Text>
                    <KText variant="label">{s.host}</KText>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>{ago(s.at)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
    </Screen>
  );
}


/**
 * Une connexion WalletConnect, avec son état RÉEL : le point vert ne s'allume
 * que si l'autre côté a répondu il y a peu ; sinon, la date de son dernier
 * signe de vie, et pour l'extension Kalyx silencieuse, ce que ça veut dire.
 */
function WcSessionCard({ s, lastSeen, checking, ago, onDisconnect }: { s: WcSession; lastSeen?: number; checking: boolean; ago: (ts: number) => string; onDisconnect: () => void }) {
  const { colors, typography } = useTheme();
  const t = useT();
  const ext = isKalyxExtensionSession(s);
  const state = presenceOf(lastSeen);
  const days = lastSeen ? Math.floor((Date.now() - lastSeen) / 86_400_000) : 0;
  const status = checking && state !== 'online'
    ? t('wcPresChecking')
    : state === 'online'
      ? t('wcPresOnline')
      : state === 'recent'
        ? t('wcPresSeen').replace('{ago}', ago(lastSeen!))
        : state === 'silent'
          ? t('wcPresSilent').replace('{n}', String(Math.max(1, days)))
          : t('wcPresUnknown');
  const left = s.expiry ? s.expiry - Date.now() : 0;
  const expires = left <= 0 ? '' : left < 86_400_000 ? t('wcExpiresHours').replace('{n}', String(Math.max(1, Math.ceil(left / 3_600_000)))) : t('wcExpiresDays').replace('{n}', String(Math.ceil(left / 86_400_000)));
  const host = s.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const tone = state === 'online' ? colors.up : state === 'recent' ? colors.warning : colors.textSecondary;
  return (
    <Card padding="xl" gap="md" style={{ gap: spacing(1.25) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
        <SessionLogo url={s.url} presence={state} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={typography.body} numberOfLines={1}>{ext ? t('wcExtBadge') : s.name}</Text>
          <Text numberOfLines={1} style={{ color: tone, fontFamily: fonts.semibold, fontSize: fontSize.sm }}>{status}</Text>
          <KText variant="label" numberOfLines={1}>{[host, expires].filter(Boolean).join(' · ')}</KText>
        </View>
        <DangerPill label={t('disconnect')} onPress={onDisconnect} />
      </View>
      {ext && (state === 'silent' || state === 'unknown') && !checking ? <KText variant="label">{t('wcExtSilentHint')}</KText> : null}
    </Card>
  );
}

/** Logo du site + point d'état : vert qui pulse (répond), ambre (vu récemment), gris (silencieux). Sans `presence` : connexion du navigateur ou TON, toujours locale. */
function SessionLogo({ url, presence }: { url: string; presence?: Presence }) {
  const { colors } = useTheme();
  let host = '';
  try { host = new URL(url).host; } catch { host = url.replace(/^https?:\/\//, '').split('/')[0]; }
  return (
    <View style={{ width: 44, height: 44, borderRadius: radii.full, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <DappLogo host={host} size={30} />
      <View style={{ position: 'absolute', right: -1, bottom: -1, padding: 2, borderRadius: radii.sm, backgroundColor: colors.surface1 }}>
        {!presence || presence === 'online' ? (
          <Pulse size={8} color={colors.up} />
        ) : (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: presence === 'recent' ? colors.warning : colors.textTertiary ?? colors.textSecondary }} />
        )}
      </View>
    </View>
  );
}

/** Action destructrice, en pilule rouge discrète (et non un simple texte). */
function DangerPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <KPressable onPress={onPress} haptic="light" accessibilityLabel={label} style={{ paddingHorizontal: 12, height: 34, borderRadius: radii.full, justifyContent: 'center', backgroundColor: 'rgba(255,77,94,0.10)' }}>
      <Text style={{ color: colors.danger, fontFamily: fonts.semibold, fontSize: fontSize.sm }}>{label}</Text>
    </KPressable>
  );
}
