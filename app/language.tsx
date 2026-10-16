import { NovaHero } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable, Card, Screen } from '../ui/kit';
import { Text, ScrollView, View } from 'react-native';
import { spacing, useTheme, fontSize } from '../ui/theme';
import { Icon } from '../ui/icon';
import { useSettings, useT } from '../lib/settingsStore';
import { LANGUAGES } from '../lib/i18n';
import { goBack } from '../lib/nav';

/** Langues : une liste compacte dans une carte (même système que Réseaux), coche sur la langue choisie. */
export default function Language() {
  const { colors, typography } = useTheme();
  const t = useT();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);

  return (
    <Screen layout="form">
      <ScreenHeader />
      <NovaHero icon="language" title={t('language')} />
      <ScrollView contentContainerStyle={{ paddingVertical: spacing(1) }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {LANGUAGES.map((l, i) => {
            const active = l.code === language;
            return (
              <KPressable
                key={l.code}
                onPress={() => {
                  setLanguage(l.code);
                  goBack();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={l.name}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing(1.5),
                  paddingHorizontal: spacing(2),
                  paddingVertical: spacing(1.5),
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: colors.border,
                  backgroundColor: active ? colors.surface2 : 'transparent',
                }}
              >
                <Text style={{ fontSize: fontSize.xl }}>{l.flag}</Text>
                <Text style={[typography.body, { flex: 1, textAlign: 'left', writingDirection: 'ltr' }]}>{l.name}</Text>
                {active ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="checkmark" size={12} color={colors.bg} weight="bold" />
                  </View>
                ) : (
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.textTertiary }} />
                )}
              </KPressable>
            );
          })}
        </Card>
      </ScrollView>
    </Screen>
  );
}
