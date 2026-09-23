import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, StatusBar, StyleSheet } from 'react-native';
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
import { useT, useSettings } from '../lib/settingsStore';
import { validateMnemonic, unknownWords } from '../src';
import { Text as KText, SENSITIVE_INPUT_PROPS, Pressable as KPressable } from '../ui/kit';
import { PinPromptModal } from '../ui/PinPromptModal';
import { radius } from '../ui/tokens';

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
  const importWallet = useWallet((s) => s.importWallet);
  const hasWallet = useWallet((s) => s.hasWallet);
  const [text, setText] = useState('');
  const pinLength = useSettings((st) => st.pinLength);
  const [error, setError] = useState<string | null>(null);
  /** Phrase en attente quand un wallet existe déjà : on l'AJOUTE via le PIN. */
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [pinError, setPinError] = useState(0);
  const [pinBusy, setPinBusy] = useState(false);

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
    // Rappel post-onboarding : proposer de restaurer les réseaux perso (le
    // presse-papier contient encore la SEED ici, d'où un rappel différé à l'accueil).
    void AsyncStorage.setItem('nova.promptRestoreNetworks', '1').catch(() => {});
    /*
     * CORRECTION D'UNE PERTE DE FONDS — même faute que app/restore-drive.tsx.
     *
     * L'écran envoyait toujours vers /set-pin, qui appelle `confirmDraft` : le
     * flux du PREMIER lancement, qui écrase le coffre `primary` et remplace la
     * liste des wallets. Importer une phrase alors qu'un wallet existait
     * détruisait ce dernier, et sa phrase de récupération avec.
     */
    if (hasWallet) {
      setPendingMnemonic(text.trim());
      return;
    }
    setImportedDraft(text.trim());
    router.push('/set-pin');
  };

  async function addAlongside(pin: string) {
    if (!pendingMnemonic) return;
    setPinBusy(true);
    try {
      await importWallet(pendingMnemonic, pin);
      setPendingMnemonic(null);
      router.replace('/wallets');
    } catch {
      // PIN refusé : on secoue, le wallet existant n'a pas bougé.
      setPinError((n) => n + 1);
    } finally {
      setPinBusy(false);
    }
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Validation mot par mot en direct (§4.9) : mots hors BIP-39 signalés avant de continuer.
  const bad = unknownWords(text);
  const words = text.trim() ? text.trim().split(/\s+/) : [];

  const topPadding = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Barre native retirée : elle doublait le padding de barre d'état. */}
      <Stack.Screen options={{ headerShown: false }} />
      <PinPromptModal
        visible={!!pendingMnemonic}
        title={t('importPinTitle')}
        subtitle={t('importPinSub')}
        expectedLength={pinLength}
        busy={pinBusy}
        errorSignal={pinError}
        onSubmit={addAlongside}
        onCancel={() => setPendingMnemonic(null)}
      />
      {/* `gradients.screen` rend une couleur unie (flat()) : une View suffit,
          et le §2.2 ne tolère aucun dégradé décoratif. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />

      <KeyboardAvoidingView style={{ flex: 1, paddingTop: topPadding }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header unique, calé sous la barre d'état */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48 }}>
          <KPressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
            hitSlop={12}
            accessibilityLabel={t('back')}
            style={{ width: 40, height: 40, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 }}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chevron" size={20} color={colors.text} />
            </View>
          </KPressable>
        </View>

        <View style={{ flex: 1, paddingHorizontal: spacing(2.5) }}>
          {/* Badge → titre → sous-titre, enchaînés sans vide */}
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="import" size={26} color={colors.primary} />
            </View>
            <Text style={[typography.title, { marginVertical: 8, textAlign: 'center' }]}>{t('importWalletT')}</Text>
            <Text style={[typography.muted, { textAlign: 'center', marginBottom: 20 }]}>{t('pastePhraseHint')}</Text>
          </View>

          <GlassCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
              <Text style={typography.muted}>{wordCount > 0 ? `${wordCount} ${t('wordsWord')}` : t('recoveryPhrase')}</Text>
              <KPressable onPress={paste} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="copy" size={15} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: fonts.semibold }}>{t('paste')}</Text>
              </KPressable>
            </View>
            <TextInput
              value={text}
              onChangeText={(v) => { setText(v); setError(null); }}
              placeholder={t('wordExamplePh')}
              placeholderTextColor={colors.textSecondary}
              multiline
              // Phrase de récupération : jamais apprise par le clavier (§7.3).
              {...SENSITIVE_INPUT_PROPS}
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
