import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, TouchableOpacity, KeyboardAvoidingView, Platform, StatusBar, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { validateMnemonic, unknownWords } from '../src';
import { Text as KText } from '../ui/kit';

/**
 * Import d'une phrase (onboarding). LAYOUT FIXE, sans barre native ni double
 * padding : header 48 px (retour) → badge → titre → sous-titre → saisie ;
 * le bouton Continuer est calé en bas (`insets.bottom + 16`) et remonte avec
 * le clavier (KeyboardAvoidingView).
 */
export default function Import() {
  const { colors, typography, gradients } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
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
  // Validation mot par mot en direct (§4.9) : mots hors BIP-39 signalés avant de continuer.
  const bad = unknownWords(text);
  const words = text.trim() ? text.trim().split(/\s+/) : [];

  const topPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      {/* Barre native retirée : elle doublait le padding de barre d'état. */}
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={{ flex: 1, paddingTop: topPadding }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header unique, calé sous la barre d'état */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48 }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassStrong }}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chevron" size={20} color={colors.text} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, paddingHorizontal: spacing(2.5) }}>
          {/* Badge → titre → sous-titre, enchaînés sans vide */}
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="import" size={26} color={colors.accent} />
            </View>
            <Text style={[typography.title, { marginVertical: 8, textAlign: 'center' }]}>{t('importWalletT')}</Text>
            <Text style={[typography.muted, { textAlign: 'center', marginBottom: 20 }]}>{t('pastePhraseHint')}</Text>
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

          {words.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing(1.5) }}>
              {words.map((w, i) => {
                const ok = !bad.includes(w.toLowerCase());
                return (
                  <View key={`${w}-${i}`} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface2, borderBottomWidth: 2, borderBottomColor: ok ? 'transparent' : colors.danger }}>
                    <KText variant="caption" tone={ok ? 'secondary' : 'danger'}>{i + 1}. {w}</KText>
                  </View>
                );
              })}
            </View>
          ) : null}
          {bad.length > 0 ? <View style={{ marginTop: spacing(1) }}><KText variant="caption" tone="danger">{bad.length === 1 ? `« ${bad[0]} » n’est pas un mot de la liste BIP-39.` : `${bad.length} mots ne sont pas dans la liste BIP-39.`}</KText></View> : null}
          {error ? <View style={{ marginTop: spacing(1.5) }}><ErrorBox message={error} /></View> : null}

          {/* Espace flexible : le bouton reste calé en bas */}
          <View style={{ flex: 1 }} />
          <View style={{ marginBottom: insets.bottom + 16 }}>
            <Button label={t('continueWord')} onPress={onNext} disabled={words.length === 0 || bad.length > 0} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
