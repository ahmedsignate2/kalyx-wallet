import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { friendlyTxError } from '../lib/txError';
import { validateMnemonic, normalizeEvmPrivateKey, restoreBackup } from '../src';

type Mode = 'phrase' | 'key' | 'backup';

export default function ImportWallet() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const importWallet = useWallet((s) => s.importWallet);
  const importPrivateKey = useWallet((s) => s.importPrivateKey);
  const [mode, setMode] = useState<Mode>('phrase');
  const [text, setText] = useState('');
  const [pwd, setPwd] = useState(''); // mot de passe de sauvegarde (mode backup)
  const [label, setLabel] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setText('');
    setPwd('');
  };

  const onImport = async () => {
    setError(null);
    if (pin.length < 6) {
      setError('Entre ton PIN d’app pour chiffrer ce portefeuille.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'phrase') {
        if (!validateMnemonic(text)) { setError('Phrase invalide : vérifie les mots et l’ordre.'); return; }
        await importWallet(text, pin, label);
      } else if (mode === 'key') {
        try { normalizeEvmPrivateKey(text); } catch { setError('Clé privée invalide : 64 caractères hexadécimaux (avec ou sans 0x).'); return; }
        await importPrivateKey(text, pin, label);
      } else {
        // Sauvegarde chiffrée : déchiffre avec le mot de passe puis importe la phrase.
        const { mnemonic, error: err } = await restoreBackup(text, pwd);
        if (err || !mnemonic) { setError(err ?? 'Sauvegarde invalide.'); return; }
        await importWallet(mnemonic, pin, label);
      }
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

      {/* Sélecteur Phrase / Clé privée / Sauvegarde */}
      <View style={{ flexDirection: 'row', gap: spacing(0.75), marginVertical: spacing(1) }}>
        {(['phrase', 'key', 'backup'] as Mode[]).map((m) => {
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
              <Text style={{ color: active ? '#fff' : colors.text, fontFamily: typography.bodyStrong.fontFamily, fontSize: 13 }}>
                {m === 'phrase' ? 'Phrase' : m === 'key' ? 'Clé privée' : 'Sauvegarde'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'phrase' ? (
        <Muted>Colle une phrase BIP-39 (12 ou 24 mots). Elle sera chiffrée avec ton PIN.</Muted>
      ) : mode === 'key' ? (
        <Muted>
          Colle une clé privée EVM (0x… ou 64 hex). Un seul compte, réseaux EVM uniquement
          (ni Bitcoin, ni Solana, pas de phrase de récupération).
        </Muted>
      ) : (
        <Muted>Colle le contenu d’une sauvegarde chiffrée Nova et entre son mot de passe.</Muted>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{mode === 'phrase' ? 'Phrase de récupération' : mode === 'key' ? 'Clé privée' : 'Contenu de la sauvegarde'}</Text>
          <Pressable onPress={async () => setText((await Clipboard.getStringAsync()).trim())}>
            <Text style={{ color: colors.accent, fontFamily: typography.bodyStrong.fontFamily }}>Coller</Text>
          </Pressable>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={mode === 'phrase' ? 'mot1 mot2 mot3 …' : mode === 'key' ? '0x…' : '{ "app": "nova", … }'}
          placeholderTextColor={colors.textMuted}
          multiline={mode !== 'key'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={mode === 'key'}
          style={{ minHeight: mode === 'key' ? 44 : 100, color: colors.text, fontSize: mode === 'backup' ? 12 : 16, textAlignVertical: 'top' }}
        />
      </Card>

      {mode === 'backup' ? (
        <Card>
          <Text style={typography.muted}>Mot de passe de la sauvegarde</Text>
          <TextInput value={pwd} onChangeText={setPwd} placeholder="Mot de passe choisi à la sauvegarde" placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>
      ) : null}
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
