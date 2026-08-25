/**
 * Sauvegarde chiffrée de la phrase (« cloud backup »). L'utilisateur choisit un
 * mot de passe ; on révèle la seed (biométrie/PIN), on la chiffre CÔTÉ CLIENT et on
 * partage le fichier via le partage natif (Drive, Files, e-mail…). Rien ne part vers
 * un serveur Nova. La restauration se fait depuis Portefeuilles → Importer.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Share } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Button, Title, Muted } from '../ui/components';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { createBackup } from '../src';

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

  const onCreate = () => {
    setError(null);
    if (pwd.length < 8) { setError(t('pwdMin8')); return; }
    if (pwd !== confirm) { setError(t('pwdsMismatch')); return; }
    setConfirming(true);
  };

  // Révèle la seed (biométrie/PIN), chiffre, puis partage. LÈVE pour ConfirmUnlock.
  const perform = async (unlock: Unlock) => {
    const mnemonic = await revealPhrase(unlock);
    const blob = await createBackup(mnemonic, pwd);
    await Share.share({
      message: blob,
      title: t('backupShareTitle'),
    });
    setDone(true);
    setPwd('');
    setConfirm('');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('encBackup') }} />
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
        contentContainerStyle={{ padding: spacing(3), paddingBottom: insets.bottom + spacing(4), gap: spacing(2) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Title>{t('encBackup')}</Title>
        <Muted>{t('backupIntro')}</Muted>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.bgElevated, borderRadius: 12, padding: spacing(1.5) }}>
          <Icon name="warning" size={18} color={colors.warning} />
          <Text style={[typography.muted, { flex: 1 }]}>{t('backupPwdWarning')}</Text>
        </View>

        <Card>
          <Text style={typography.muted}>{t('backupPassword')}</Text>
          <TextInput value={pwd} onChangeText={setPwd} placeholder={t('atLeast8Chars')} placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>
        <Card>
          <Text style={typography.muted}>{t('confirmPassword')}</Text>
          <TextInput value={confirm} onChangeText={setConfirm} placeholder={t('repeatPassword')} placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        {done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={18} color={colors.up} />
            <Text style={{ color: colors.up, flex: 1 }}>{t('backupCreated')}</Text>
          </View>
        ) : null}

        <View style={{ height: spacing(1) }} />
        <Button label={t('createBackupBtn')} onPress={onCreate} />
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
