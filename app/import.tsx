import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PremiumScreen, GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { validateMnemonic } from '../src';

export default function Import() {
  const { colors, typography } = useTheme();
  const t = useT();
  const setImportedDraft = useWallet((s) => s.setImportedDraft);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const paste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip) {
      setText(clip.trim());
      setError(null);
    }
  };

  const onNext = () => {
    setError(null);
    if (!validateMnemonic(text.trim())) {
      setError(t('invalidPhraseBip'));
      return;
    }
    setImportedDraft(text.trim());
    // Rappel post-onboarding : proposer de restaurer les réseaux perso (le
    // presse-papier contient encore la SEED ici, d'où un rappel différé à l'accueil).
    void AsyncStorage.setItem('nova.promptRestoreNetworks', '1').catch(() => {});
    router.push('/set-pin'); // même flux de sécurisation que la création
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('importTitle') }} />
      <PremiumScreen>

      <View style={{ alignItems: 'center', gap: spacing(1), marginBottom: spacing(0.5) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="import" size={26} color={colors.accent} />
        </View>
        <Text style={typography.title}>{t('importWalletT')}</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>{t('pastePhraseHint')}</Text>
      </View>

      <GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
          <Text style={typography.muted}>{wordCount > 0 ? `${wordCount} ${t('wordsWord')}` : t('recoveryPhrase')}</Text>
          <Pressable onPress={paste} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="copy" size={15} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('paste')}</Text>
          </Pressable>
        </View>
        <TextInput
          value={text}
          onChangeText={(v) => { setText(v); setError(null); }}
          placeholder={t('wordExamplePh')}
          placeholderTextColor={colors.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          style={{ minHeight: 120, color: colors.text, fontSize: 16, textAlignVertical: 'top', fontFamily: fonts.medium }}
        />
      </GlassCard>

      {error ? <ErrorBox message={error} /> : null}

      <View style={{ flex: 1 }} />
      <Button label={t('continueWord')} onPress={onNext} />
      <View style={{ height: spacing(1) }} />
    </PremiumScreen>
    </>
  );
}
