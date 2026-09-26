import { ScreenHeader, SENSITIVE_INPUT_PROPS, Pressable as KPressable } from '../ui/kit';
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import {
  validateMnemonic,
  restoreBackup,
  parseImportedKey,
  addressFromRawKey,
  chainNameOf,
  listChains,
  groupAddress,
  type KeyFamily,
  type KeyParseError,
} from '../src';
import { isDriveConfigured } from '../lib/googleDrive';

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
  /** Famille retenue quand la clé collée peut servir plusieurs réseaux. */
  const [family, setFamily] = useState<KeyFamily | null>(null);

  /*
   * ANALYSE À LA FRAPPE, et pas seulement au moment d'importer.
   *
   * L'import n'acceptait qu'une clé EVM en hexadécimal et répondait « clé privée
   * invalide » à tout le reste — un WIF Bitcoin, un export Phantom. On analyse
   * donc en direct et on MONTRE ce qu'on a reconnu, ainsi que l'adresse dérivée :
   * c'est le seul garde-fou qui vaille, puisqu'une clé valide peut désigner une
   * adresse que l'utilisateur ne reconnaît pas.
   */
  const parsed = useMemo(() => (mode === 'key' && text.trim() ? parseImportedKey(text) : null), [mode, text]);
  const candidates = parsed?.ok ? parsed.key.families : [];
  const chosen: KeyFamily | null = family ?? (candidates.length === 1 ? candidates[0] : null);
  const derived = useMemo(() => {
    if (!parsed?.ok || !chosen) return null;
    try {
      return addressFromRawKey(chosen, parsed.key.secret);
    } catch {
      return null;
    }
  }, [parsed, chosen]);

  /** Nom du premier réseau d'une famille, pour étiqueter le choix. */
  const familyLabel = (f: KeyFamily) =>
    chainNameOf(listChains({ includeTestnets: false }).find((c) => c.family === f)?.id ?? '') ?? f;

  /** Message d'un refus d'analyse, depuis son code. */
  const parseErrorText = (code: KeyParseError) => {
    switch (code) {
      case 'OUT_OF_RANGE':
        return t('keyErrOutOfRange');
      case 'BAD_CHECKSUM':
        return t('keyErrChecksum');
      case 'BAD_WIF_VERSION':
        return t('keyErrWifVersion');
      case 'SOLANA_MISMATCH':
        return t('keyErrSolanaMismatch');
      default:
        return t('keyErrUnrecognised');
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setText('');
    setPwd('');
    setFamily(null);
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
        if (!parsed) { setError(t('keyErrUnrecognised')); return; }
        if (!parsed.ok) { setError(parseErrorText(parsed.error)); return; }
        // Plusieurs réseaux possibles et aucun choisi : on ne devine pas.
        if (!chosen) { setError(t('keyErrFamilyRequired')); return; }
        await importPrivateKey(text, pin, label, chosen);
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
            <KPressable
              key={m}
              onPress={() => switchMode(m)}
              style={{
                flex: 1,
                paddingVertical: spacing(1.25),
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: active ? colors.primary : colors.surface1,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
              }}
            >
              <Text style={{ color: active ? colors.onPrimary : colors.text, fontFamily: typography.bodyStrong.fontFamily, fontSize: 13 }}>
                {m === 'phrase' ? t('tabPhrase') : m === 'key' ? t('privateKeyLabel') : t('backupTitle')}
              </Text>
            </KPressable>
          );
        })}
      </View>

      {mode === 'phrase' ? (
        <Muted>{t('phraseModeHint')}</Muted>
      ) : mode === 'key' ? (
        <Muted>{t('keyModeHint')}</Muted>
      ) : (
        <>
          <Muted>{t('backupModeHint')}</Muted>
          {isDriveConfigured() ? <Button label={t('driveRestore')} variant="ghost" onPress={() => router.push('/restore-drive')} /> : null}
        </>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{mode === 'phrase' ? t('recoveryPhrase') : mode === 'key' ? t('privateKeyLabel') : t('backupContent')}</Text>
          <KPressable onPress={async () => setText((await Clipboard.getStringAsync()).trim())}>
            <Text style={{ color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }}>{t('paste')}</Text>
          </KPressable>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          /*
            Le repère de saisie annonce les TROIS formes acceptées : il ne
            montrait que « 0x… », donc rien ne laissait deviner qu'un WIF
            Bitcoin ou une clé Solana passaient. Et l'exemple de phrase était
            écrit en français en dur, alors que la clé existait déjà.
          */
          placeholder={mode === 'phrase' ? t('wordExamplePh') : mode === 'key' ? '0x… · 5Kd… · base58' : '{ "app": "kalyx", … }'}
          placeholderTextColor={colors.textSecondary}
          multiline={mode !== 'key'}
          // Phrase, clé privée ou sauvegarde chiffrée : tous des secrets (§7.3).
          {...SENSITIVE_INPUT_PROPS}
          secureTextEntry={mode === 'key'}
          style={{ minHeight: mode === 'key' ? 44 : 100, color: colors.text, fontSize: mode === 'backup' ? 12 : 16, textAlignVertical: 'top' }}
        />
      </Card>

      {/*
        CE QU'ON A RECONNU, ET OÙ ÇA MÈNE. Une clé peut être parfaitement valide
        et désigner une adresse que l'utilisateur ne reconnaît pas — un secret
        pris pour la mauvaise famille, une graine confondue avec une clé
        complète. Montrer l'adresse laisse la vérification à celui qui sait.
      */}
      {mode === 'key' && parsed ? (
        <Card>
          {!parsed.ok ? (
            <Text style={{ color: colors.danger }}>{parseErrorText(parsed.error)}</Text>
          ) : (
            <>
              <Text style={typography.muted}>{t('keyRecognised')}</Text>
              {/*
                Plus d'une famille possible : 32 octets sur secp256k1 servent
                l'EVM et Bitcoin, et sont aussi une graine ed25519. Trois adresses
                pour un même secret — l'utilisateur seul sait laquelle il veut.
              */}
              {candidates.length > 1 ? (
                <>
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>{t('keyChooseNetwork')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(0.75), marginTop: spacing(0.5) }}>
                    {candidates.map((f) => {
                      const on = chosen === f;
                      return (
                        <KPressable
                          key={f}
                          onPress={() => setFamily(f)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={{ minHeight: 36, paddingHorizontal: spacing(1.25), justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }}
                        >
                          <Text style={{ color: on ? colors.onPrimary : colors.text, fontFamily: typography.bodyStrong.fontFamily, fontSize: 13 }}>
                            {familyLabel(f)}
                          </Text>
                        </KPressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
              {derived ? (
                <View style={{ marginTop: spacing(1.5) }}>
                  <Text style={typography.muted}>{t('keyDerivedAddress')}</Text>
                  <Text style={{ color: colors.text, fontSize: 13 }}>{groupAddress(derived)}</Text>
                  <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>{t('keyCheckAddress')}</Text>
                  {/*
                    WIF NON COMPRESSÉ : un AVERTISSEMENT, plus un refus. La clé
                    fonctionne et l'adresse dérivée est valide, mais le propriétaire
                    d'une telle clé détient souvent ses fonds sur l'adresse héritée
                    de la même clé — que Kalyx ne sait pas lire. Il faut le dire, pas
                    empêcher l'import.
                  */}
                  {chosen === 'bitcoin' && parsed.ok && parsed.key.compressed === false ? (
                    <Text style={{ color: colors.warning, fontSize: 12, marginTop: spacing(0.75) }}>
                      {t('keyErrWifUncompressed')}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {mode === 'backup' ? (
        <Card>
          <Text style={typography.muted}>{t('backupPassword')}</Text>
          <TextInput value={pwd} onChangeText={setPwd} placeholder={t('backupPasswordPlaceholder')} placeholderTextColor={colors.textSecondary} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>
      ) : null}
      <Card>
        <Text style={typography.muted}>{t('nameOptional')}</Text>
        <TextInput value={label} onChangeText={setLabel} placeholder={t('namePlaceholderImport')} placeholderTextColor={colors.textSecondary} style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
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
