import { NovaCard, NovaHero, NovaSwitch, SettingRow } from '../ui/nova';
import { ScreenHeader } from '../ui/kit';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen } from '../ui/premium';
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
      <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="extensions" title={t('extensions')} subtitle={t('extensionsIntro')} />
      <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <NovaCard delay={120}>
          {modules.map((m, i) => (
            <SettingRow key={m.title} divider={i > 0} icon={m.icon} tone={m.value ? 'gold' : undefined} title={m.title} hint={m.sub} right={<NovaSwitch value={m.value} onValueChange={m.onChange} />} />
          ))}
        </NovaCard>
      </ScrollView>
    </PremiumScreen>
    </>
  );
}
