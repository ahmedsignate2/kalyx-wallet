import { NovaHero, Pulse, Rise } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable, Card, Screen } from '../ui/kit';
import { Text, ScrollView, View } from 'react-native';
import { spacing, useTheme, fontSize } from '../ui/theme';
import { useSettings, useT } from '../lib/settingsStore';
import { LANGUAGES } from '../lib/i18n';
import { goBack } from '../lib/nav';

export default function Language() {
  const { colors, typography } = useTheme();
  const t = useT();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);

  return (
    <Screen layout="form">
      <ScreenHeader />
      <NovaHero icon="language" title={t('language')} />
      <ScrollView contentContainerStyle={{ gap: spacing(1), paddingVertical: spacing(1) }}>
        {LANGUAGES.map((l, i) => {
          const active = l.code === language;
          return (
            <Rise key={l.code} delay={Math.min(i, 10) * 30}>
            <KPressable
              onPress={() => {
                setLanguage(l.code);
                goBack();
              }}
            >
              <Card padding="xl" gap="md"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderColor: active ? 'rgba(221,181,101,0.45)' : colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                  <Text style={{ fontSize: fontSize.xxl }}>{l.flag}</Text>
                  <Text style={typography.body}>{l.name}</Text>
                </View>
                {active ? <Pulse size={8} /> : null}
              </Card>
            </KPressable>
            </Rise>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
