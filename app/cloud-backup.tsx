/**
 * Sauvegarde chiffrée — un écran, quatre blocs :
 *   1. titre + une phrase ;
 *   2. formulaire (mot de passe + jauge, confirmation) ;
 *   3. statut réel (UNE carte : sauvegarde Drive présente / aucune sauvegarde cloud / fichier local) ;
 *   4. actions : « Sauvegarder sur Google Drive » (principal), « Exporter un fichier » (secondaire).
 *
 * La confirmation biométrique/PIN ne fait que révéler + chiffrer (rapide). L'envoi
 * Drive est confié au flux persistant `useDriveFlow` (lib/googleDrive.ts), qui
 * survit au retour de Google et au redémarrage de l'app.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Share, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Surface, Input, ScreenHeader, Divider } from '../ui/kit';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { createBackup } from '../src';
import { useDriveFlow, isDriveConfigured } from '../lib/googleDrive';

type Target = 'drive' | 'file';

function strengthOf(pwd: string): { level: 0 | 1 | 2 | 3; key: 'strengthWeak' | 'strengthMedium' | 'strengthStrong' } {
  if (pwd.length < 8) return { level: pwd.length === 0 ? 0 : 1, key: 'strengthWeak' };
  const varied = /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd);
  if (pwd.length >= 12 && varied) return { level: 3, key: 'strengthStrong' };
  return { level: 2, key: 'strengthMedium' };
}

export default function CloudBackupScreen() {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const revealPhrase = useWallet((s) => s.revealPhrase);
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const wallets = useWallet((s) => s.wallets);
  const isPk = wallets.find((w) => w.id === activeWalletId)?.type === 'privateKey';

  const language = useSettings((s) => s.language);
  const encryptedBackupAt = useSettings((s) => s.encryptedBackupAt);
  const driveBackupAt = useSettings((s) => s.driveBackupAt);
  const markEncryptedBackup = useSettings((s) => s.markEncryptedBackup);

  const flow = useDriveFlow();
  const driveOn = isDriveConfigured();

  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [target, setTarget] = useState<Target>('drive');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileDone, setFileDone] = useState(false);

  // Un flux Drive terminé (succès ou erreur) est acquitté quand on quitte l'écran.
  useEffect(() => () => { if (flow.status === 'done' || flow.status === 'error') flow.reset(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const strength = strengthOf(pwd);
  const mismatch = confirm.length > 0 && pwd !== confirm;
  const canSubmit = pwd.length >= 8 && confirm.length > 0 && !mismatch;

  const driveBusy = flow.kind === 'save' && (flow.status === 'auth' || flow.status === 'working');
  const driveDone = flow.kind === 'save' && flow.status === 'done';
  const driveError =
    flow.kind === 'save' && flow.status === 'error'
      ? flow.error === 'not_configured' ? t('driveNotConfigured') : flow.error === 'denied' || flow.error === 'timeout' ? t('driveCancelled') : flow.error
      : null;
  const checkBusy = flow.kind === 'check' && (flow.status === 'auth' || flow.status === 'working');
  const checkResult = flow.kind === 'check' && flow.status === 'done' ? flow.checkResult : undefined;

  const dateLabel = (iso: string) => new Date(iso).toLocaleString(language, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const submit = (to: Target) => {
    setError(null);
    setFileDone(false);
    if (pwd.length < 8) { setError(t('pwdTooShort')); return; }
    if (pwd !== confirm) { setError(t('pwdMismatch')); return; }
    setTarget(to);
    setConfirming(true);
  };

  // Révèle la phrase (biométrie/PIN) et chiffre — 1 s. LÈVE pour ConfirmUnlock.
  const perform = async (unlock: Unlock) => {
    const mnemonic = await revealPhrase(unlock);
    const blob = await createBackup(mnemonic, pwd);
    setPwd('');
    setConfirm('');
    if (target === 'drive') {
      void flow.start({ kind: 'save', blob });
      return;
    }
    await Share.share({ message: blob, title: t('backupShareTitle') });
    markEncryptedBackup('file');
    setFileDone(true);
  };

  // ── Statut réel : une seule carte, un seul état ──
  const driveDate = checkResult ?? driveBackupAt; // la vérification en ligne prime sur la mémoire locale
  const status: { tone: 'up' | 'secondary' | 'warning'; icon: 'check' | 'info' | 'warning'; text: string } = driveDone
    ? { tone: 'up', icon: 'check', text: t('driveSaved') }
    : checkResult === null
      ? { tone: 'warning', icon: 'warning', text: t('driveNone') }
      : driveDate
        ? { tone: 'up', icon: 'check', text: `${t('backupLastDrive')} ${dateLabel(driveDate)}` }
        : encryptedBackupAt
          ? { tone: 'secondary', icon: 'info', text: `${t('backupLastFile')} ${dateLabel(encryptedBackupAt)}` }
          : { tone: 'secondary', icon: 'info', text: t('backupNoneCloud') };

  const bar = [1, 2, 3].map((i) => (
    <View
      key={i}
      style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: strength.level >= i ? (strength.level === 1 ? colors.danger : strength.level === 2 ? colors.warning : colors.up) : colors.surface3 }}
    />
  ));

  if (isPk) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space[3], paddingHorizontal: SCREEN_MARGIN, gap: space[3] }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title={t('encBackup')} />
        <Text tone="secondary">{t('pkNoBackup')}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SCREEN_MARGIN, paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[8], gap: space[5] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Titre + une phrase */}
          <View style={{ gap: space[2] }}>
            <ScreenHeader title={t('encBackup')} />
            <Text variant="bodySecondary" tone="secondary">{t('backupOneLiner')}</Text>
          </View>

          {/* 2. Formulaire */}
          <Surface style={{ gap: space[4] }}>
            <View style={{ gap: space[2] }}>
              <Input
                label={t('backupPassword')}
                value={pwd}
                onChangeText={(v) => { setPwd(v); setError(null); }}
                placeholder={t('pwdPlaceholder')}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />
              <View style={{ flexDirection: 'row', gap: space[1], alignItems: 'center' }}>{bar}</View>
              {pwd.length > 0 ? (
                <Text variant="caption" tone={strength.level >= 3 ? 'up' : strength.level === 2 ? 'warning' : 'danger'}>
                  {t(strength.key)}{pwd.length >= 8 && pwd.length < 12 ? ` · ${t('pwdRecommend12')}` : ''}
                </Text>
              ) : null}
            </View>
            <Input
              label={t('confirmPassword')}
              value={confirm}
              onChangeText={(v) => { setConfirm(v); setError(null); }}
              placeholder={t('repeatPassword')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              error={mismatch ? t('pwdMismatch') : null}
            />
            {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
          </Surface>

          {/* 3. Statut réel */}
          <Surface style={{ gap: space[3] }}>
            {driveBusy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <ActivityIndicator color={colors.text} />
                <Text tone="secondary" style={{ flex: 1 }}>{flow.status === 'auth' ? t('driveConnect') : t('driveSaving')}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={status.icon} size={18} color={status.tone === 'up' ? colors.up : status.tone === 'warning' ? colors.warning : colors.textSecondary} />
                </View>
                <Text tone={status.tone === 'secondary' ? 'secondary' : status.tone} style={{ flex: 1 }}>{status.text}</Text>
              </View>
            )}
            {driveError ? <Text variant="caption" tone="danger">{driveError}</Text> : null}
            {fileDone ? <Text variant="caption" tone="up">{t('backupCreated')}</Text> : null}
            {driveOn && !driveBusy ? (
              <>
                <Divider />
                <Button label={checkBusy ? t('driveSearching') : t('driveCheck')} variant="ghost" onPress={() => flow.start({ kind: 'check' })} disabled={checkBusy} />
              </>
            ) : null}
          </Surface>

          {/* 4. Actions */}
          <View style={{ gap: space[3] }}>
            {driveOn ? (
              <Button label={t('driveSave')} onPress={() => submit('drive')} disabled={!canSubmit || driveBusy} />
            ) : null}
            <Button label={t('exportLocalFile')} variant={driveOn ? 'secondary' : 'primary'} onPress={() => submit('file')} disabled={!canSubmit} />
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t('restoreHint')}</Text>
          </View>
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
    </>
  );
}
