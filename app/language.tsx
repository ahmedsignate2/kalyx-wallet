import { ScreenHeader } from '../ui/kit';
import React from 'react';
import { Text, ScrollView, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Title } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useSettings, useT } from '../lib/settingsStore';
import { LANGUAGES } from '../lib/i18n';

export default function Language() {
  const { colors, typography } = useTheme();
  const t = useT();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);

  return (
    <Screen>
      <ScreenHeader />
      <Title>{t('language')}</Title>
      <ScrollView contentContainerStyle={{ gap: spacing(1), paddingVertical: spacing(1) }}>
        {LANGUAGES.map((l) => {
          const active = l.code === language;
          return (
            <Pressable
              key={l.code}
              onPress={() => {
                setLanguage(l.code);
                router.back();
              }}
            >
              <Card
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderColor: active ? colors.accent : colors.cardBorder,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                  <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                  <Text style={typography.body}>{l.name}</Text>
                </View>
                {active ? <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text> : null}
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
