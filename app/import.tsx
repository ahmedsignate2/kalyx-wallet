import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { PremiumScreen, GlassCard, ErrorBox } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { validateMnemonic } from '../src';

export default function Import() {
  const { colors, typography } = useTheme();
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
      setError("Phrase invalide : vérifie les mots et l'ordre (12 ou 24 mots BIP-39).");
      return;
    }
    setImportedDraft(text.trim());
    router.push('/set-pin'); // même flux de sécurisation que la création
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Importer' }} />

      <View style={{ alignItems: 'center', gap: spacing(1), marginBottom: spacing(0.5) }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="import" size={26} color={colors.accent} />
        </View>
        <Text style={typography.title}>Importer un wallet</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>Colle ta phrase de récupération BIP-39 (12 ou 24 mots).</Text>
      </View>

      <GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
          <Text style={typography.muted}>{wordCount > 0 ? `${wordCount} mot${wordCount > 1 ? 's' : ''}` : 'Phrase de récupération'}</Text>
          <Pressable onPress={paste} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="copy" size={15} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Coller</Text>
          </Pressable>
        </View>
        <TextInput
          value={text}
          onChangeText={(v) => { setText(v); setError(null); }}
          placeholder="mot1 mot2 mot3 …"
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
      <Button label="Continuer" onPress={onNext} />
      <View style={{ height: spacing(1) }} />
    </PremiumScreen>
  );
}
