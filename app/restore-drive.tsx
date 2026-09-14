/**
 * Restauration depuis Google Drive (accueil → « Restaurer depuis Google »,
 * Importer → onglet Sauvegarde).
 *
 * Le travail réseau vit dans `useDriveFlow` (lib/googleDrive.ts) et survit à un
 * redémarrage de l'app au retour de Google. Cet écran ne fait qu'afficher l'état
 * du flux, puis déchiffre LOCALEMENT (scrypt + AES-256-GCM) avec le mot de passe :
 * Google est déjà déconnecté avant la saisie. Un mot de passe faux se retente
 * sans le recontacter. Phrase → même flux de sécurisation que l'import (PIN).
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
import { useDriveFlow, isDriveConfigured } from '../lib/googleDrive';
import { restoreBackup } from '../src';

export default function RestoreDriveScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const language = useSettings((s) => s.language);
  const setImportedDraft = useWallet((s) => s.setImportedDraft);
  const hasWallet = useWallet((s) => s.hasWallet);

  const flow = useDriveFlow();
  const [askPassword, setAskPassword] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = isDriveConfigured();
  const isRestore = flow.kind === 'restore';

  // À l'arrivée : si aucun flux de restauration n'est en cours ou terminé, on lance Google.
  useEffect(() => {
    if (!configured) return;
    if (!isRestore || flow.status === 'idle') void flow.start({ kind: 'restore' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = () => {
    flow.reset();
    router.replace(hasWallet ? '/wallets' : '/welcome');
  };

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
    flow.reset();
    setImportedDraft(r.mnemonic);
    router.push('/set-pin'); // même flux de sécurisation que l'import
  }

  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' });
  const errorText =
    flow.error === 'not_configured' ? t('driveNotConfigured') : flow.error === 'denied' || flow.error === 'timeout' ? t('driveCancelled') : flow.error;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SCREEN_MARGIN, paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[6], gap: space[4] }}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title={t('driveTitle')} onBack={leave} fallback={hasWallet ? '/wallets' : '/welcome'} />
          <Text variant="bodySecondary" tone="secondary">{t('driveExplain')}</Text>

          {!configured && (
            <Surface style={{ padding: space[4] }}>
              <Text>{t('driveNotConfigured')}</Text>
            </Surface>
          )}

          {isRestore && (flow.status === 'auth' || flow.status === 'working') && (
            <Surface style={{ padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <ActivityIndicator color={colors.text} />
              <Text tone="secondary" style={{ flex: 1 }}>{flow.status === 'auth' ? t('driveConnect') : t('driveSearching')}</Text>
            </Surface>
          )}

          {isRestore && flow.status === 'done' && flow.restoreResult === null && (
            <Surface style={{ padding: space[4], gap: space[3] }}>
              <Text>{t('driveNone')}</Text>
              <Button label={t('driveTryAgain')} variant="secondary" onPress={() => flow.start({ kind: 'restore' })} />
              <Button label={t('driveIgnore')} variant="secondary" onPress={leave} />
            </Surface>
          )}

          {isRestore && flow.status === 'error' && (
            <Surface style={{ padding: space[4], gap: space[3] }}>
              <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
                <Icon name="warning" size={18} color={colors.warning} />
                <Text style={{ flex: 1 }}>{errorText}</Text>
              </View>
              {configured && <Button label={t('driveTryAgain')} onPress={() => flow.start({ kind: 'restore' })} />}
              <Button label={t('driveIgnore')} variant="secondary" onPress={leave} />
            </Surface>
          )}

          {isRestore && flow.status === 'done' && flow.restoreResult && !askPassword && (
            <Surface style={{ padding: space[4], gap: space[3] }}>
              <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                <Icon name="check" size={20} color={colors.up} />
                <Text variant="title2">{t('driveFound')}</Text>
              </View>
              <Text tone="secondary">{t('driveFoundSub').replace('{date}', dateLabel(flow.restoreResult.modifiedTime))}</Text>
              <Button label={t('driveRestoreBtn')} onPress={() => setAskPassword(true)} />
              <Button label={t('driveIgnore')} variant="secondary" onPress={leave} />
            </Surface>
          )}

          {isRestore && flow.status === 'done' && flow.restoreResult && askPassword && (
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
                style={{ color: colors.text, fontSize: 16, paddingVertical: space[3], paddingHorizontal: space[3], backgroundColor: colors.surface2, borderRadius: radius.input }}
              />
              {pwdError ? <Text style={{ color: colors.danger }}>{pwdError}</Text> : null}
              <Button label={busy ? t('driveSaving') : t('driveDecrypt')} onPress={() => decrypt(flow.restoreResult!.text)} disabled={busy || pwd.length === 0} />
            </Surface>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
