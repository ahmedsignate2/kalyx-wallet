/**
 * Export manuel d'une sauvegarde chiffrée. L'utilisateur choisit un
 * mot de passe ; on révèle la seed (biométrie/PIN), on la chiffre CÔTÉ CLIENT et on
 * partage le fichier via le partage natif (Drive, Files, e-mail…). Rien ne part vers
 * un serveur Kalyx. La restauration se fait depuis Portefeuilles → Importer.
 */
import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Share } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Button, Title, Muted } from '../ui/components';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { createBackup } from '../src';
import { withDriveToken, isDriveConfigured, GoogleAuthError } from '../lib/googleDrive';
import { findBackup, uploadBackup } from '../src/domain/backup/drive';

export default function CloudBackup() {
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const revealPhrase = useWallet((s) => s.revealPhrase);
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const wallets = useWallet((s) => s.wallets);
  const isPk = wallets.find((w) => w.id === activeWalletId)?.type === 'privateKey';

  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [target, setTarget] = useState<'share' | 'drive'>('share');
  const [driveDone, setDriveDone] = useState(false);

  const strength = pwd.length < 8 ? { label: t('strengthWeak'), color: colors.danger } : pwd.length < 12 ? { label: t('strengthMedium'), color: colors.warning } : /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd) ? { label: t('strengthStrong'), color: colors.up } : { label: t('strengthMedium'), color: colors.warning };
  const mismatch = confirm.length > 0 && pwd !== confirm;
  const canCreate = pwd.length >= 8 && confirm.length > 0 && !mismatch;

  const onCreate = (to: 'share' | 'drive' = 'share') => {
    setError(null);
    if (pwd.length < 8) { setError(t('pwdTooShort')); return; }
    if (pwd !== confirm) { setError(t('pwdMismatch')); return; }
    setTarget(to);
    setConfirming(true);
  };

  // Révèle la seed (biométrie/PIN), chiffre, puis partage. LÈVE pour ConfirmUnlock.
  const perform = async (unlock: Unlock) => {
    const startedAt = Date.now();
    console.log('[KALYX-AUTH][backup] perform:start', {
      unlockMode: 'biometric' in unlock ? 'biometric' : 'pin',
      passwordLength: pwd.length,
    });
    const mnemonic = await revealPhrase(unlock);
    console.log('[KALYX-AUTH][backup] revealPhrase:resolved', { elapsedMs: Date.now() - startedAt });
    const blob = await createBackup(mnemonic, pwd);
    console.log('[KALYX-AUTH][backup] createBackup:resolved', {
      elapsedMs: Date.now() - startedAt,
      blobBytes: blob.length,
    });
    if (target === 'drive') {
      // Coffre passif : une connexion Google éphémère, deux requêtes (trouver, envoyer), jeton révoqué.
      try {
        await withDriveToken(async (token) => {
          const existing = await findBackup(token);
          await uploadBackup(token, blob, existing?.id ?? null);
        });
      } catch (e) {
        if (e instanceof GoogleAuthError && e.code === 'not_configured') throw new Error(t('driveNotConfigured'));
        if (e instanceof GoogleAuthError && e.code !== 'exchange_failed') throw new Error(t('driveCancelled'));
        throw e;
      }
      console.log('[KALYX-AUTH][backup] drive:uploaded', { elapsedMs: Date.now() - startedAt });
      useSettings.getState().markEncryptedBackup();
      setDriveDone(true);
      setPwd('');
      setConfirm('');
      return;
    }
    await Share.share({
      message: blob,
      title: t('backupShareTitle'),
    });
    console.log('[KALYX-AUTH][backup] share:resolved', { elapsedMs: Date.now() - startedAt });
    useSettings.getState().markEncryptedBackup();
    setDone(true);
    setPwd('');
    setConfirm('');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {(() => {
  if (isPk) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing(6), padding: spacing(3) }}>
        
        <Title>{t('encBackup')}</Title>
        <Muted>{t('pkNoBackup')}</Muted>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      <ScrollView
        contentContainerStyle={{ padding: spacing(3), paddingTop: insets.top + 12, paddingBottom: insets.bottom + spacing(4), gap: spacing(2) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title={t('encBackup')} />
        <Muted>{t('backupLocalIntro')}</Muted>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.bgElevated, borderRadius: 12, padding: spacing(1.5) }}>
          <Icon name="warning" size={18} color={colors.warning} />
          <Text style={[typography.muted, { flex: 1 }]}>{t('backupNoRecovery')}</Text>
        </View>

        <Card>
          <Text style={typography.muted}>{t('backupPassword')}</Text>
          <TextInput value={pwd} onChangeText={(v) => { setPwd(v); setError(null); }} placeholder={t('pwdPlaceholder')} placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
          <Text style={{ color: strength.color, fontSize: 13 }}>{t('pwdStrength')} {strength.label}{pwd.length >= 8 && pwd.length < 12 ? ` · ${t('pwdRecommend12')}` : ''}</Text>
        </Card>
        <Card>
          <Text style={typography.muted}>{t('confirmPassword')}</Text>
          <TextInput value={confirm} onChangeText={(v) => { setConfirm(v); setError(null); }} placeholder={t('repeatPassword')} placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
          {mismatch ? <Text style={{ color: colors.danger, fontSize: 13 }}>{t('pwdMismatch')}</Text> : null}
        </Card>

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        {done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={18} color={colors.up} />
            <Text style={{ color: colors.up, flex: 1 }}>{t('backupCreated')}</Text>
          </View>
        ) : null}

        {driveDone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={18} color={colors.up} />
            <Text style={{ color: colors.up, flex: 1 }}>{t('driveSaved')}</Text>
          </View>
        ) : null}

        <View style={{ height: spacing(1) }} />
        <Button label={t('createBackupBtn')} onPress={() => onCreate('share')} disabled={!canCreate} />
        {isDriveConfigured() ? (
          <>
            <Button label={t('driveSave')} variant="ghost" onPress={() => onCreate('drive')} disabled={!canCreate} />
            <Muted>{t('driveExplain')}</Muted>
          </>
        ) : null}
        <Muted>{t('restoreHint')}</Muted>
      </ScrollView>

      <ConfirmUnlock
        visible={confirming}
        title={t('backupThePhrase')}
        subtitle={t('confirmIdentityEncrypt')}
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </KeyboardAvoidingView>
  );
      })()}
    </>
  );
}
