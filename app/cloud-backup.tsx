/**
 * Export manuel d'une sauvegarde chiffrée. L'utilisateur choisit un
 * mot de passe ; on révèle la seed (biométrie/PIN), on la chiffre CÔTÉ CLIENT et on
 * partage le fichier via le partage natif (Drive, Files, e-mail…). Rien ne part vers
 * un serveur Kalyx. La restauration se fait depuis Portefeuilles → Importer.
 */
import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Share, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Button, Title, Muted } from '../ui/components';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { createBackup } from '../src';
import { useDriveFlow, isDriveConfigured } from '../lib/googleDrive';

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
  const flow = useDriveFlow();
  const language = useSettings((s) => s.language);
  const encryptedBackupAt = useSettings((s) => s.encryptedBackupAt);
  const driveBackupAt = useSettings((s) => s.driveBackupAt);
  const driveDone = flow.kind === 'save' && flow.status === 'done';
  const driveBusy = flow.kind === 'save' && (flow.status === 'auth' || flow.status === 'working');
  const driveError = flow.kind === 'save' && flow.status === 'error' ? (flow.error === 'not_configured' ? t('driveNotConfigured') : flow.error === 'denied' || flow.error === 'timeout' ? t('driveCancelled') : flow.error) : null;
  const checkBusy = flow.kind === 'check' && (flow.status === 'auth' || flow.status === 'working');
  const dateLabel = (iso: string) => new Date(iso).toLocaleString(language, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
      // La confirmation biométrique s'arrête ici (elle a un délai de 15 s) : l'aller-retour
      // Google est confié au flux persistant, qui survit même à un redémarrage de l'app.
      setPwd('');
      setConfirm('');
      void flow.start({ kind: 'save', blob });
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

        {driveBusy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.text} />
            <Text style={[typography.muted, { flex: 1 }]}>{flow.status === 'auth' ? t('driveConnect') : t('driveSaving')}</Text>
          </View>
        ) : null}
        {driveDone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bgElevated, borderRadius: 12, padding: spacing(1.5) }}>
            <Icon name="check" size={18} color={colors.up} />
            <Text style={{ color: colors.up, flex: 1 }}>{t('driveSaved')}</Text>
          </View>
        ) : null}
        {driveError ? <Text style={{ color: colors.danger }}>{driveError}</Text> : null}

        {/* Historique : l'utilisateur peut vérifier un autre jour qu'il a bien sauvegardé. */}
        <Card>
          <Text style={typography.muted}>{t('backupStatusTitle')}</Text>
          <Text style={typography.body}>{encryptedBackupAt ? `${t('backupLastFile')} ${dateLabel(encryptedBackupAt)}` : t('backupNeverFile')}</Text>
          {isDriveConfigured() ? (
            <>
              <Text style={typography.body}>{driveBackupAt ? `${t('backupLastDrive')} ${dateLabel(driveBackupAt)}` : t('backupNeverDrive')}</Text>
              {flow.kind === 'check' && flow.status === 'done' ? (
                <Text style={{ color: flow.checkResult ? colors.up : colors.warning }}>
                  {flow.checkResult ? `${t('driveCheckFound')} ${dateLabel(flow.checkResult)}` : t('driveNone')}
                </Text>
              ) : null}
              <Button label={checkBusy ? t('driveSearching') : t('driveCheck')} variant="ghost" onPress={() => flow.start({ kind: 'check' })} disabled={checkBusy} />
            </>
          ) : null}
        </Card>

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
