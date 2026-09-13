import { ScreenHeader } from '../ui/kit';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTheme, fonts, radii, spacing } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { PremiumScreen, GlassCard, ListRow, IconButton } from '../ui/premium';
import { Icon } from '../ui/icon';
import { useAiStore, AiProvider } from '../lib/aiStore';
import { validateAiKey } from '../lib/aiValidator';
import { PROVIDER_DEFAULTS } from '../lib/aiConfig';
import { Linking } from 'react-native';

export default function AiSettings() {
  const { colors, typography } = useTheme();
  const t = useT();
  const { isEnabled, provider, apiKey, setApiKey, disableAi, loadInitialState } = useAiStore();
  
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(provider);
  const [inputKey, setInputKey] = useState(apiKey || '');
  const [customUrl, setCustomUrl] = useState(useAiStore.getState().customUrl || '');
  const [customModel, setCustomModel] = useState(useAiStore.getState().customModel || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    if (apiKey) setInputKey(apiKey);
    if (provider) setSelectedProvider(provider);
  }, [apiKey, provider]);

  const handleSaveAndActivate = async () => {
    setLoading(true);
    const check = await validateAiKey(selectedProvider, inputKey, customUrl, customModel);

    if (check.success) {
      await setApiKey(inputKey, selectedProvider, customUrl, customModel);
      Alert.alert(t('success'), t('aiSuccessConnected'));
      router.back();
    } else {
      Alert.alert(t('aiConnectionFailed'), check.error || t('aiErrorInternal'));
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    await disableAi();
    setInputKey('');
    Alert.alert(t('aiDisabledTitle'), t('aiDisabledBody'));
  };

  return (
    <PremiumScreen
    >
      <ScreenHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing(2) }}>
        <IconButton icon="chevron" onPress={() => router.back()} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.text, marginLeft: spacing(2) }}>{t('copilotByok')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing(2), gap: spacing(2) }}>
        <Text style={[typography.body, { marginBottom: spacing(1) }]}>
          {t('aiByokIntro')}
        </Text>

        <Text style={[typography.body, { color: colors.textMuted }]}>{t('aiProvider')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
          {(Object.keys(PROVIDER_DEFAULTS) as AiProvider[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setSelectedProvider(p)}
              style={{
                width: '31%',
                alignItems: 'center',
                paddingVertical: spacing(1.5),
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: selectedProvider === p ? colors.accent : colors.glassBorder,
                backgroundColor: selectedProvider === p ? colors.accent + '20' : colors.glass,
              }}
            >
              <Text style={{ fontFamily: fonts.semibold, color: selectedProvider === p ? colors.accent : colors.text }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing(1) }]}>{t('aiApiKey')}</Text>
        <TextInput
          style={{
            backgroundColor: colors.glass,
            borderColor: colors.glassBorder,
            borderWidth: 1,
            borderRadius: radii.md,
            padding: spacing(2),
            color: colors.text,
            fontFamily: fonts.medium,
          }}
          placeholder="Ex: sk-..."
          placeholderTextColor={colors.textFaint}
          value={inputKey}
          onChangeText={setInputKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {PROVIDER_DEFAULTS[selectedProvider]?.helperUrl && (
          <Pressable onPress={() => Linking.openURL(PROVIDER_DEFAULTS[selectedProvider].helperUrl!)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Text style={[typography.body, { color: colors.accent, fontSize: 13, textDecorationLine: 'underline' }]}>{t('aiFreeKeyHelp')}</Text>
          </Pressable>
        )}

        {selectedProvider === 'custom' && (
          <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
            <Text style={[typography.body, { color: colors.textMuted }]}>{t('aiApiUrl')}</Text>
            <TextInput
              style={{ backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1, borderRadius: radii.md, padding: spacing(1.5), color: colors.text, fontFamily: fonts.medium }}
              placeholder="Ex: https://api.together.xyz/v1/chat/completions"
              placeholderTextColor={colors.textFaint}
              value={customUrl}
              onChangeText={setCustomUrl}
              autoCapitalize="none"
            />
            <Text style={[typography.body, { color: colors.textMuted }]}>{t('aiModelName')}</Text>
            <TextInput
              style={{ backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1, borderRadius: radii.md, padding: spacing(1.5), color: colors.text, fontFamily: fonts.medium }}
              placeholder="Ex: qwen-2.5-72b ou gemini-1.5-pro"
              placeholderTextColor={colors.textFaint}
              value={customModel}
              onChangeText={setCustomModel}
              autoCapitalize="none"
            />
          </View>
        )}

        <View style={{ marginTop: spacing(2), gap: spacing(1.5) }}>
          <Pressable
            onPress={handleSaveAndActivate}
            disabled={loading || !inputKey.trim()}
            style={{
              backgroundColor: colors.accent,
              padding: spacing(2),
              borderRadius: radii.pill,
              alignItems: 'center',
              opacity: (loading || !inputKey.trim()) ? 0.7 : 1,
            }}
          >
            {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>{t('aiTestAndActivate')}</Text>}
          </Pressable>

          {isEnabled && (
            <Pressable
              onPress={handleDisable}
              style={{
                backgroundColor: colors.danger + '20',
                padding: spacing(2),
                borderRadius: radii.pill,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.danger,
              }}
            >
              <Text style={{ color: colors.danger, fontFamily: fonts.bold, fontSize: 16 }}>{t('aiDisable')}</Text>
            </Pressable>
          )}
        </View>

        {isEnabled && (
          <GlassCard style={{ marginTop: spacing(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginBottom: spacing(1) }}>
              <Icon name="check" size={20} color={colors.up} />
              <Text style={{ color: colors.up, fontFamily: fonts.bold, fontSize: 16 }}>{t('aiActiveTitle')}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium, lineHeight: 20 }}>
              {t('aiActiveDesc')}
            </Text>
          </GlassCard>
        )}
      </ScrollView>
    </PremiumScreen>
  );
}
