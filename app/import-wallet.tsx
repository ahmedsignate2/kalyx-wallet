import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import { validateMnemonic, normalizeEvmPrivateKey, restoreBackup } from '../src';

type Mode = 'phrase' | 'key' | 'backup';

export default function ImportWallet() {
  const { colors, typography } = useTheme();
  const t = useT();
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
      setError(t('enterAppPinEncrypt'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'phrase') {
        if (!validateMnemonic(text)) { setError(t('invalidPhraseSimple')); return; }
        await importWallet(text, pin, label);
      } else if (mode === 'key') {
        try { normalizeEvmPrivateKey(text); } catch { setError(t('invalidPrivateKey')); return; }
        await importPrivateKey(text, pin, label);
      } else {
        // Sauvegarde chiffrée : déchiffre avec le mot de passe puis importe la phrase.
        const { mnemonic, error: err } = await restoreBackup(text, pwd);
        if (err || !mnemonic) { setError(err ?? t('invalidBackup')); return; }
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
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + spacing(4),
          gap: spacing(2),
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <ScreenHeader title={t('importWalletT')} />
      <Muted>{t('walletsCohabit')}</Muted>

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
              <Text style={{ color: active ? colors.onPrimary : colors.text, fontFamily: typography.bodyStrong.fontFamily, fontSize: 13 }}>
                {m === 'phrase' ? t('tabPhrase') : m === 'key' ? t('privateKeyLabel') : t('backupTitle')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'phrase' ? (
        <Muted>{t('phraseModeHint')}</Muted>
      ) : mode === 'key' ? (
        <Muted>{t('keyModeHint')}</Muted>
      ) : (
        <Muted>{t('backupModeHint')}</Muted>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{mode === 'phrase' ? t('recoveryPhrase') : mode === 'key' ? t('privateKeyLabel') : t('backupContent')}</Text>
          <Pressable onPress={async () => setText((await Clipboard.getStringAsync()).trim())}>
            <Text style={{ color: colors.accent, fontFamily: typography.bodyStrong.fontFamily }}>{t('paste')}</Text>
          </Pressable>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={mode === 'phrase' ? 'mot1 mot2 mot3 …' : mode === 'key' ? '0x…' : '{ "app": "kalyx", … }'}
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
          <Text style={typography.muted}>{t('backupPassword')}</Text>
          <TextInput value={pwd} onChangeText={setPwd} placeholder={t('backupPasswordPlaceholder')} placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>
      ) : null}
      <Card>
        <Text style={typography.muted}>{t('nameOptional')}</Text>
        <TextInput value={label} onChangeText={setLabel} placeholder={t('namePlaceholderImport')} placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
      </Card>
      <Card>
        <Text style={typography.muted}>{t('appPin')}</Text>
        <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ height: spacing(1) }} />
      <Button label={busy ? t('importing') : t('importAction')} loading={busy} onPress={onImport} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
