import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';
import { validateMnemonic, normalizeEvmPrivateKey } from '../src';

type Mode = 'phrase' | 'key';

export default function ImportWallet() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const importWallet = useWallet((s) => s.importWallet);
  const importPrivateKey = useWallet((s) => s.importPrivateKey);
  const [mode, setMode] = useState<Mode>('phrase');
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setText('');
  };

  const onImport = async () => {
    setError(null);
    if (mode === 'phrase' && !validateMnemonic(text)) {
      setError('Phrase invalide : vérifie les mots et l’ordre.');
      return;
    }
    if (mode === 'key') {
      try {
        normalizeEvmPrivateKey(text); // valide sans stocker
      } catch {
        setError('Clé privée invalide : 64 caractères hexadécimaux (avec ou sans 0x).');
        return;
      }
    }
    if (pin.length < 6) {
      setError('Entre ton PIN d’app pour chiffrer ce portefeuille.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'phrase') await importWallet(text, pin, label);
      else await importPrivateKey(text, pin, label);
      router.replace('/home');
    } catch (e) {
      setError(friendlyTxError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing(3),
          paddingTop: insets.top + spacing(2),
          paddingBottom: insets.bottom + spacing(4),
          gap: spacing(2),
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Title>Importer un portefeuille</Title>
      <Muted>
        Ton portefeuille actuel n’est pas effacé : les portefeuilles cohabitent, tu passes de
        l’un à l’autre depuis l’écran Portefeuilles.
      </Muted>

      {/* Sélecteur Phrase / Clé privée */}
      <View style={{ flexDirection: 'row', gap: spacing(1), marginVertical: spacing(1) }}>
        {(['phrase', 'key'] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => switchMode(m)}
              style={{
                flex: 1,
                paddingVertical: spacing(1.25),
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: active ? colors.accent : colors.card,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.cardBorder,
              }}
            >
              <Text style={{ color: active ? '#fff' : colors.text, fontFamily: typography.bodyStrong.fontFamily }}>
                {m === 'phrase' ? 'Phrase secrète' : 'Clé privée'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'phrase' ? (
        <Muted>Colle une phrase BIP-39 (12 ou 24 mots). Elle sera chiffrée avec ton PIN.</Muted>
      ) : (
        <Muted>
          Colle une clé privée EVM (0x… ou 64 hex). Un seul compte, réseaux EVM uniquement
          (ni Bitcoin, ni Solana, pas de phrase de récupération).
        </Muted>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{mode === 'phrase' ? 'Phrase de récupération' : 'Clé privée'}</Text>
          <Pressable onPress={async () => setText((await Clipboard.getStringAsync()).trim())}>
            <Text style={{ color: colors.accent, fontFamily: typography.bodyStrong.fontFamily }}>Coller</Text>
          </Pressable>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={mode === 'phrase' ? 'mot1 mot2 mot3 …' : '0x…'}
          placeholderTextColor={colors.textMuted}
          multiline={mode === 'phrase'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={mode === 'key'}
          style={{ minHeight: mode === 'phrase' ? 100 : 44, color: colors.text, fontSize: 16, textAlignVertical: 'top' }}
        />
      </Card>
      <Card>
        <Text style={typography.muted}>Nom (optionnel)</Text>
        <TextInput value={label} onChangeText={setLabel} placeholder="Ex. Ledger, Ancien wallet…" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
      </Card>
      <Card>
        <Text style={typography.muted}>PIN de l’app</Text>
        <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ height: spacing(1) }} />
      <Button label={busy ? 'Import…' : 'Importer'} loading={busy} onPress={onImport} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
