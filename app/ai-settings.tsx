import { Button, Chip, Input, ScreenHeader, Pressable as KPressable, Text as KText, Card, Screen, Switch } from '../ui/kit';
import { IconDisc, NovaHero, Rise, SectionLabel } from '../ui/nova';
import { useState, useEffect } from 'react';
import { View, Alert, Linking } from 'react-native';
import { spacing, useTheme } from '../ui/theme';
import { useSettings } from '../lib/settingsStore';
import { useT } from '../lib/settingsStore';
import { Icon } from '../ui/icon';
import { useAiStore, AiProvider } from '../lib/aiStore';
import { validateAiKey } from '../lib/aiValidator';
import { PROVIDER_DEFAULTS, formatAiError } from '../lib/aiConfig';
import { useShallow } from 'zustand/react/shallow';
import { goBack } from '../lib/nav';

export default function AiSettings() {
  const t = useT();
  const { colors } = useTheme();
  const aiToolsEnabled = useSettings((st) => st.aiToolsEnabled);
  const setAiToolsEnabled = useSettings((st) => st.setAiToolsEnabled);
  const { isEnabled, provider, apiKey, setApiKey, disableAi, loadInitialState } = useAiStore(useShallow((s) => ({ isEnabled: s.isEnabled, provider: s.provider, apiKey: s.apiKey, setApiKey: s.setApiKey, disableAi: s.disableAi, loadInitialState: s.loadInitialState })));
  
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
        goBack();
      } else {
        // Retraduit depuis le CODE avec t() : le texte suit la langue de l'écran,
        // jamais une phrase figée par la couche réseau.
        Alert.alert(t('aiConnectionFailed'), check.code ? formatAiError(t, { code: check.code, status: check.status, detail: check.detail }) : t('aiErrorInternal'));
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

  const canSave = !loading && !!inputKey.trim();
  const providerLabel = (p: string) => (p === 'openai' ? 'OpenAI' : p === 'deepseek' ? 'DeepSeek' : p === 'openrouter' ? 'OpenRouter' : p === 'huggingface' ? 'Hugging Face' : p.charAt(0).toUpperCase() + p.slice(1));

  /*
   * THÈME NOVA, comme les autres écrans secondaires : un seul en-tête (il y en
   * avait deux, avec deux flèches retour), le héros, puis des cartes. Plus de
   * ScrollView imbriqué dans celui de l'écran : le clavier et le défilement
   * sont gérés une seule fois, par PremiumScreen.
   */
  return (
    <Screen>
      <ScreenHeader fallback="/settings" />
      <NovaHero icon="sparkles" tone="gold" title={t('copilotByok')} subtitle={t('aiByokIntro')} />

      {isEnabled ? (
        <Card rise delay={120} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
          <IconDisc name="check" size={36} />
          <View style={{ flex: 1, gap: 2 }}>
            <KText variant="body" tone="up">{t('aiActiveTitle')}</KText>
            <KText variant="caption" tone="secondary">{t('aiActiveDesc')}</KText>
          </View>
        </Card>
      ) : null}

      <SectionLabel>{t('aiProvider')}</SectionLabel>
      <Rise delay={160}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
          {(Object.keys(PROVIDER_DEFAULTS) as AiProvider[]).map((p) => (
            <Chip key={p} label={providerLabel(p)} selected={selectedProvider === p} onPress={() => setSelectedProvider(p)} />
          ))}
        </View>
      </Rise>

      <Card rise delay={200} style={{ gap: spacing(1.5) }}>
        <Input label={t('aiApiKey')} placeholder="sk-…" value={inputKey} onChangeText={setInputKey} secureTextEntry sensitive />
        {PROVIDER_DEFAULTS[selectedProvider]?.helperUrl ? (
          <KPressable onPress={() => Linking.openURL(PROVIDER_DEFAULTS[selectedProvider].helperUrl!)} hitSlop={8} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="forward" size={14} color={colors.warm} />
            <KText variant="caption" style={{ color: colors.warm }}>{t('aiFreeKeyHelp')}</KText>
          </KPressable>
        ) : null}
        {selectedProvider === 'custom' ? (
          <>
            <Input label={t('aiApiUrl')} placeholder="https://api.together.xyz/v1/chat/completions" value={customUrl} onChangeText={setCustomUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <Input label={t('aiModelName')} placeholder="qwen-2.5-72b · gemini-1.5-pro" value={customModel} onChangeText={setCustomModel} autoCapitalize="none" autoCorrect={false} />
          </>
        ) : null}
      </Card>

      <View style={{ gap: spacing(1.25) }}>
        <Button label={t('aiTestAndActivate')} onPress={() => void handleSaveAndActivate()} loading={loading} disabled={!canSave} />
        {isEnabled ? <Button label={t('aiDisable')} variant="destructive" onPress={() => void handleDisable()} /> : null}
      </View>

      {/*
        OUTILS DE L'ASSISTANT — opt-in strict, et l'avertissement dit pourquoi.
        Tant que c'est désactivé, les outils ne sont même pas ANNONCÉS au
        modèle : un modèle qui ne les connaît pas ne peut pas les appeler.
        Visible seulement si une clé IA est configurée : proposer d'outiller un
        assistant inactif n'aurait aucun sens.
      */}
      {isEnabled ? (
        <Card rise delay={240} style={{ gap: spacing(1.25) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <View style={{ flex: 1, gap: 4 }}>
              <KText variant="body">{t('aiToolsTitle')}</KText>
              <KText variant="caption" tone="secondary">{t('aiToolsDesc')}</KText>
            </View>
            <Switch value={aiToolsEnabled} onValueChange={setAiToolsEnabled} />
          </View>
          <KText variant="caption" tone="warning">{t('aiToolsWarn')}</KText>
        </Card>
      ) : null}
    </Screen>
  );
}
