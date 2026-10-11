/**
 * Sites connectés (navigateur intégré) — ouvert depuis le menu ⋮ du navigateur.
 *
 * Liste les sites connectés et/ou MÉMORISÉS (reconnexion sans PIN). « Oublier »
 * est une vraie déconnexion : `removeConnection` retire l'hôte des connexions et
 * de la mémoire de reconnexion, puis `revoked` prévient le navigateur resté
 * monté, qui l'efface de ses connexions actives (onglets normal et privé) et
 * envoie `accountsChanged([])` + `disconnect` si la page est ouverte.
 *
 * Les sessions WalletConnect ont leur propre écran (Menu → WalletConnect).
 */
import { useEffect, useMemo } from 'react';
import { Alert, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card, EmptyState, ListRow, Screen, ScreenHeader, Text, Button, Pressable as KPressable } from '../ui/kit';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, radii } from '../ui/tokens';
import { DappLogo } from '../ui/browser/DappTile';
import { useT, useSettings } from '../lib/settingsStore';
import { useDappActivity, knownSites, type KnownSite } from '../lib/dappActivity';
import { fill } from '../lib/i18n';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { catalogEntry } from '../src/domain/web/dappCatalog';

export default function ConnectedSites() {
  const t = useT();
  const { colors } = useTheme();
  const language = useSettings((s) => s.language);
  const connections = useDappActivity((s) => s.connections);
  const remembered = useDappActivity((s) => s.remembered);
  const signatures = useDappActivity((s) => s.signatures);
  const removeConnection = useDappActivity((s) => s.removeConnection);
  const removeConnections = useDappActivity((s) => s.removeConnections);

  useEffect(() => {
    const st = useDappActivity.getState();
    // Navigateur jamais ouvert depuis le démarrage : le journal n'est pas encore lu.
    if (st.connections.length === 0 && st.remembered.length === 0) void st.load();
  }, []);

  const sites = useMemo(() => knownSites(connections, remembered, signatures), [connections, remembered, signatures]);
  const fmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [language]);
  const when = (at?: number) => (at ? (fmt ? fmt.format(new Date(at)) : new Date(at).toLocaleString()) : '');

  const forget = (s: KnownSite) => {
    Alert.alert(t('connectedSitesForgetTitle'), fill(t('connectedSitesForgetBody'), { host: s.host }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('forget'),
        style: 'destructive',
        onPress: () => {
          haptic.light();
          removeConnection(s.host);
          toast.success(t('disconnected'), s.host);
        },
      },
    ]);
  };
  const forgetAll = () => {
    Alert.alert(t('connectedSitesForgetAllTitle'), t('connectedSitesForgetAllBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('forget'),
        style: 'destructive',
        onPress: () => {
          haptic.light();
          removeConnections(sites.map((s) => s.host));
          toast.success(t('disconnected'));
        },
      },
    ]);
  };

  const subtitle = (s: KnownSite) => {
    const parts: string[] = [];
    if (s.at) parts.push(fill(t('connectedSitesLastConnected'), { date: when(s.at) }));
    if (s.remembered) parts.push(t('connectedSitesRemembered'));
    return parts.join(' · ') || s.host;
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('connectedSitesTitle')} fallback="/browser" />
      <Text variant="bodySecondary" tone="secondary">{t('connectedSitesIntro')}</Text>

      {sites.length === 0 ? (
        <Card>
          <EmptyState icon="dapps" title={t('connectedSitesEmpty')} />
        </Card>
      ) : (
        <>
          <Card style={{ paddingVertical: space[1], paddingHorizontal: 0, overflow: 'hidden' }}>
            {sites.map((s, i) => {
              const entry = catalogEntry(s.host);
              return (
                <ListRow
                  key={s.host}
                  divider={i > 0}
                  wrap
                  left={<DappLogo host={s.host} size={34} />}
                  title={entry ? `${entry.name} · ${s.host}` : s.host}
                  subtitle={subtitle(s)}
                  right={
                    <KPressable onPress={() => forget(s)} haptic="light" accessibilityRole="button" accessibilityLabel={`${t('forget')} ${s.host}`} style={{ paddingHorizontal: 12, height: 34, borderRadius: radii.full, justifyContent: 'center', borderWidth: 1, borderColor: colors.danger }}>
                      <Text variant="caption" style={{ color: colors.danger }}>{t('forget')}</Text>
                    </KPressable>
                  }
                />
              );
            })}
          </Card>
          <Button label={t('connectedSitesForgetAll')} variant="destructive" size="md" onPress={forgetAll} />
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2], marginTop: space[2] }}>
        <Icon name="info" size={14} tone="muted" />
        <Text variant="caption" tone="secondary" style={{ flex: 1 }}>{t('connectedSitesNote')}</Text>
      </View>
    </Screen>
  );
}
