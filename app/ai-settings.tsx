import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Alert, ActivityIndicator, Switch } from 'react-native';
import { router } from 'expo-router';
import { useTheme, fonts, radii, spacing } from '../ui/theme';
import { useSettings } from '../lib/settingsStore';
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
  const aiToolsEnabled = useSettings((st) => st.aiToolsEnabled);
  const setAiToolsEnabled = useSettings((st) => st.setAiToolsEnabled);
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
    try {
      const check = await validateAiKey(selectedProvider, inputKey, customUrl, customModel);
      if (check.success) {
        await setApiKey(inputKey, selectedProvider, customUrl, customModel);
        Alert.alert(t('success'), t('aiSuccessConnected'));
        router.back();
      } else {
        Alert.alert(t('aiConnectionFailed'), check.error || t('aiErrorInternal'));
      }
    } catch (e) {
      Alert.alert(t('aiConnectionFailed'), e instanceof Error ? e.message : t('aiErrorInternal'));
    } finally {
      setLoading(false);
    }
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

        <Text style={[typography.body, { color: colors.textSecondary }]}>{t('aiProvider')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
          {(Object.keys(PROVIDER_DEFAULTS) as AiProvider[]).map((p) => (
            <KPressable
              key={p}
              onPress={() => setSelectedProvider(p)}
              style={{
                width: '31%',
                alignItems: 'center',
                paddingVertical: spacing(1.5),
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: selectedProvider === p ? colors.primary : colors.border,
                backgroundColor: selectedProvider === p ? colors.primary + '20' : colors.surface1,
              }}
            >
              <Text style={{ fontFamily: fonts.semibold, color: selectedProvider === p ? colors.primary : colors.text }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </KPressable>
          ))}
        </View>

        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing(1) }]}>{t('aiApiKey')}</Text>
        <TextInput
          style={{
            backgroundColor: colors.surface1,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radii.md,
            padding: spacing(2),
            color: colors.text,
            fontFamily: fonts.medium,
          }}
          placeholder="Ex: sk-..."
          placeholderTextColor={colors.textTertiary}
          value={inputKey}
          onChangeText={setInputKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {PROVIDER_DEFAULTS[selectedProvider]?.helperUrl && (
          <KPressable onPress={() => Linking.openURL(PROVIDER_DEFAULTS[selectedProvider].helperUrl!)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Text style={[typography.body, { color: colors.primary, fontSize: 13, textDecorationLine: 'underline' }]}>{t('aiFreeKeyHelp')}</Text>
          </KPressable>
        )}

        {selectedProvider === 'custom' && (
          <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>{t('aiApiUrl')}</Text>
            <TextInput
              style={{ backgroundColor: colors.surface1, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: spacing(1.5), color: colors.text, fontFamily: fonts.medium }}
              placeholder="Ex: https://api.together.xyz/v1/chat/completions"
              placeholderTextColor={colors.textTertiary}
              value={customUrl}
              onChangeText={setCustomUrl}
              autoCapitalize="none"
            />
            <Text style={[typography.body, { color: colors.textSecondary }]}>{t('aiModelName')}</Text>
            <TextInput
              style={{ backgroundColor: colors.surface1, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: spacing(1.5), color: colors.text, fontFamily: fonts.medium }}
              placeholder="Ex: qwen-2.5-72b ou gemini-1.5-pro"
              placeholderTextColor={colors.textTertiary}
              value={customModel}
              onChangeText={setCustomModel}
              autoCapitalize="none"
            />
          </View>
        )}

        <View style={{ marginTop: spacing(2), gap: spacing(1.5) }}>
          <KPressable
            onPress={handleSaveAndActivate}
            disabled={loading || !inputKey.trim()}
            style={{
              backgroundColor: colors.primary,
              padding: spacing(2),
              borderRadius: radii.pill,
              alignItems: 'center',
              opacity: (loading || !inputKey.trim()) ? 0.7 : 1,
            }}
          >
            {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>{t('aiTestAndActivate')}</Text>}
          </KPressable>

          {isEnabled && (
            <KPressable
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
            </KPressable>
          )}
        </View>

        {isEnabled && (
          <GlassCard style={{ marginTop: spacing(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginBottom: spacing(1) }}>
              <Icon name="check" size={20} color={colors.up} />
              <Text style={{ color: colors.up, fontFamily: fonts.bold, fontSize: 16 }}>{t('aiActiveTitle')}</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium, lineHeight: 20 }}>
              {t('aiActiveDesc')}
            </Text>
          </GlassCard>
        )}

        {/*
          OUTILS DE L'ASSISTANT — opt-in strict, et l'avertissement dit pourquoi.
          Tant que c'est désactivé, les outils ne sont même pas ANNONCÉS au
          modèle : un modèle qui ne les connaît pas ne peut pas les appeler.
          Visible seulement si une clé IA est configurée : proposer d'outiller un
          assistant inactif n'aurait aucun sens.
        */}
        {isEnabled && (
          <GlassCard style={{ marginTop: spacing(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 15 }}>{t('aiToolsTitle')}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium, lineHeight: 19 }}>
                  {t('aiToolsDesc')}
                </Text>
              </View>
              <Switch value={aiToolsEnabled} onValueChange={setAiToolsEnabled} />
            </View>
            <Text style={{ color: colors.warning, fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginTop: spacing(1.25) }}>
              {t('aiToolsWarn')}
            </Text>
          </GlassCard>
        )}
      </ScrollView>
    </PremiumScreen>
  );
}
