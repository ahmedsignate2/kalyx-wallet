import { NovaHero, SettingRow } from '../ui/nova';
import { ScreenHeader, Card, Screen, Switch, Button, Text } from '../ui/kit';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useWalletConnect, isKalyxExtensionSession } from '../lib/walletconnect';
import { presenceOf } from '../lib/wcPresence';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { type IconName } from '../ui/icon';
import { spacing } from '../ui/theme';
import { useSettings, useT } from '../lib/settingsStore';
import { useShallow } from 'zustand/react/shallow';

/**
 * Modules & fonctions : active/désactive des capacités optionnelles de Kalyx.
 * Chaque bascule agit vraiment sur l'app (pas de placeholder).
 */
export default function Extensions() {
  const t = useT();
  const { securityScan, uiMode, setFlag, setUiMode } = useSettings(useShallow((s) => ({ securityScan: s.securityScan, uiMode: s.uiMode, setFlag: s.setFlag, setUiMode: s.setUiMode })));

  // Extension Kalyx en mode compagnon : combien sont reliées à ce téléphone (sessions WalletConnect).
  const linked = useWalletConnect((s) => s.sessions.filter(isKalyxExtensionSession).length);
  // Le signe de vie le plus récent des extensions reliées : « reliée » ne veut pas dire « là ».
  const lastSeen = useWalletConnect((s) => Math.max(0, ...s.sessions.filter(isKalyxExtensionSession).map((x) => s.presence[x.topic] ?? 0)));
  const checkPresence = useWalletConnect((s) => s.checkPresence);
  useEffect(() => { if (linked) void checkPresence(); }, [linked, checkPresence]);
  const state = presenceOf(lastSeen || undefined);
  const days = lastSeen ? Math.max(1, Math.floor((Date.now() - lastSeen) / 86_400_000)) : 0;
  const linkedHint = linked
    ? `${t('extCardLinked').replace('{count}', String(linked))}\n${state === 'online' ? t('wcPresOnline') : state === 'silent' ? t('wcPresSilent').replace('{n}', String(days)) : state === 'unknown' ? t('wcPresUnknown') : t('wcPresSeen').replace('{ago}', new Date(lastSeen).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }))}`
    : t('extCardNotLinked');

  const modules: { icon: IconName; title: string; sub: string; value: boolean; onChange: (v: boolean) => void }[] = [
    {
      icon: 'security',
      title: t('secScanTitle'),
      sub: t('secScanSub'),
      value: securityScan,
      onChange: (v) => setFlag('securityScan', v),
    },
    {
      icon: 'developer',
      title: t('expertMode'),
      sub: t('expertModeSub'),
      value: uiMode === 'expert',
      onChange: (v) => setUiMode(v ? 'expert' : 'beginner'),
    },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
      <ScreenHeader />
      <NovaHero icon="extensions" title={t('extensions')} subtitle={t('extensionsIntro')} />
      <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        {/* Extension navigateur : la relier (mode compagnon), et ce que ça change. */}
        <Card rise delay={60}>
          <View testID="ext-companion" style={{ gap: spacing(1) }}>
            <SettingRow icon="extensions" tone={linked ? 'gold' : undefined} title={t('extCardTitle')} hint={linkedHint} />
            <Text variant="caption" tone="secondary">{`1. ${t('extStep1')}\n2. ${t('extStep2')}\n3. ${t('extStep3')}`}</Text>
            <Button label={t('extScan')} icon="scan" onPress={() => router.push('/scan')} />
            {linked ? <Button label={t('extSessions')} variant="secondary" onPress={() => router.push('/walletconnect')} /> : null}
          </View>
        </Card>
        <Card rise delay={120}>
          {modules.map((m, i) => (
            <SettingRow key={m.title} divider={i > 0} icon={m.icon} tone={m.value ? 'gold' : undefined} title={m.title} hint={m.sub} right={<Switch value={m.value} onValueChange={m.onChange} />} />
          ))}
        </Card>
      </ScrollView>
    </Screen>
    </>
  );
}
