/**
 * Restauration depuis Google Drive (accueil → « Restaurer depuis Google »).
 *
 * 1. Connexion Google éphémère (navigateur système, portée drive.appdata).
 * 2. UNE recherche + UN téléchargement du fichier chiffré, puis déconnexion et
 *    révocation du jeton (lib/googleDrive.ts) — avant même de demander le mot de passe.
 * 3. « Sauvegarde trouvée (date) » → Restaurer / Ignorer.
 * 4. Mot de passe de sauvegarde → déchiffrement LOCAL (scrypt + AES-256-GCM).
 *    Un mot de passe faux se retente sans recontacter Google.
 * 5. Phrase → même flux de sécurisation que l'import (PIN, Keystore) → accueil.
 */
import React, { useEffect, useState } from 'react';
import { View, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Surface, ScreenHeader } from '../ui/kit';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { withDriveToken, isDriveConfigured, GoogleAuthError } from '../lib/googleDrive';
import { findBackup, downloadBackup, DriveError } from '../src/domain/backup/drive';
import { restoreBackup } from '../src';

type Step =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'none' }
  | { kind: 'found'; modifiedTime: string; text: string }
  | { kind: 'password'; text: string }
  | { kind: 'error'; message: string };

export default function RestoreDriveScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const language = useSettings((s) => s.language);
  const setImportedDraft = useWallet((s) => s.setImportedDraft);

  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [pwd, setPwd] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = isDriveConfigured();

  // Dès l'arrivée : connexion Google puis recherche silencieuse.
  useEffect(() => {
    if (configured) void connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setStep({ kind: 'searching' });
    try {
      const result = await withDriveToken(async (token) => {
        const info = await findBackup(token);
        if (!info) return null;
        const text = await downloadBackup(token, info.id);
        return { modifiedTime: info.modifiedTime, text };
      });
      // Ici, le jeton Google est déjà révoqué : tout ce qui suit est local.
      setStep(result ? { kind: 'found', ...result } : { kind: 'none' });
    } catch (e) {
      if (e instanceof GoogleAuthError && (e.code === 'cancelled' || e.code === 'denied' || e.code === 'timeout')) {
        setStep({ kind: 'error', message: t('driveCancelled') });
      } else if (e instanceof GoogleAuthError && e.code === 'not_configured') {
        setStep({ kind: 'error', message: t('driveNotConfigured') });
      } else {
        setStep({ kind: 'error', message: e instanceof DriveError || e instanceof Error ? e.message : String(e) });
      }
    }
  }

  async function decrypt(text: string) {
    setBusy(true);
    setPwdError(null);
    const r = await restoreBackup(text, pwd);
    setBusy(false);
    if (r.error || !r.mnemonic) {
      setPwdError(r.error ?? 'Erreur inconnue.');
      return;
    }
    setPwd('');
    setImportedDraft(r.mnemonic);
    router.push('/set-pin'); // même flux de sécurisation que l'import
  }

  const dateLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: SCREEN_MARGIN,
            paddingTop: insets.top + space[3],
            paddingBottom: insets.bottom + space[6],
            gap: space[4],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title={t('driveTitle')} fallback="/welcome" />
          <Text variant="bodySecondary" tone="secondary">
            {t('driveExplain')}
          </Text>

          {!configured && (
            <Surface style={{ padding: space[4], gap: space[2] }}>
              <Text>{t('driveNotConfigured')}</Text>
            </Surface>
          )}

          {step.kind === 'searching' && (
            <Surface style={{ padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <ActivityIndicator color={colors.text} />
              <Text tone="secondary" style={{ flex: 1 }}>
                {t('driveSearching')}
              </Text>
            </Surface>
          )}

          {step.kind === 'none' && (
            <Surface style={{ padding: space[4], gap: space[3] }}>
              <Text>{t('driveNone')}</Text>
              <Button label={t('driveTryAgain')} variant="secondary" onPress={connect} />
              <Button label={t('driveIgnore')} variant="secondary" onPress={() => router.replace('/welcome')} />
            </Surface>
          )}

          {step.kind === 'error' && (
            <Surface style={{ padding: space[4], gap: space[3] }}>
              <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
                <Icon name="warning" size={18} color={colors.warning} />
                <Text style={{ flex: 1 }}>{step.message}</Text>
              </View>
              {configured && <Button label={t('driveTryAgain')} onPress={connect} />}
              <Button label={t('driveIgnore')} variant="secondary" onPress={() => router.replace('/welcome')} />
            </Surface>
          )}

          {step.kind === 'found' && (
            <Surface style={{ padding: space[4], gap: space[3] }}>
              <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                <Icon name="check" size={20} color={colors.up} />
                <Text variant="title2">{t('driveFound')}</Text>
              </View>
              <Text tone="secondary">{t('driveFoundSub').replace('{date}', dateLabel(step.modifiedTime))}</Text>
              <Button label={t('driveRestoreBtn')} onPress={() => setStep({ kind: 'password', text: step.text })} />
              <Button label={t('driveIgnore')} variant="secondary" onPress={() => router.replace('/welcome')} />
            </Surface>
          )}

          {step.kind === 'password' && (
            <Surface style={{ padding: space[4], gap: space[3] }}>
              <Text variant="title2">{t('drivePasswordTitle')}</Text>
              <Text tone="secondary">{t('drivePasswordSub')}</Text>
              <TextInput
                value={pwd}
                onChangeText={(v) => {
                  setPwd(v);
                  setPwdError(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoFocus
                placeholder="••••••••"
                placeholderTextColor={colors.textTertiary}
                style={{
                  color: colors.text,
                  fontSize: 16,
                  paddingVertical: space[3],
                  paddingHorizontal: space[3],
                  backgroundColor: colors.surface2,
                  borderRadius: radius.input,
                }}
              />
              {pwdError ? <Text style={{ color: colors.danger }}>{pwdError}</Text> : null}
              <Button label={busy ? t('driveSaving') : t('driveDecrypt')} onPress={() => decrypt(step.text)} disabled={busy || pwd.length === 0} />
            </Surface>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
