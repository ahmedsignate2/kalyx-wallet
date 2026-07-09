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
import { createBackup } from '../src';

export default function CloudBackup() {
  const { colors, typography } = useTheme();
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
    if (pwd.length < 8) { setError('Choisis un mot de passe d’au moins 8 caractères.'); return; }
    if (pwd !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setConfirming(true);
  };

  // Révèle la seed (biométrie/PIN), chiffre, puis partage. LÈVE pour ConfirmUnlock.
  const perform = async (unlock: Unlock) => {
    const mnemonic = await revealPhrase(unlock);
    const blob = await createBackup(mnemonic, pwd);
    await Share.share({
      message: blob,
      title: 'Sauvegarde Nova (chiffrée)',
    });
    setDone(true);
    setPwd('');
    setConfirm('');
  };

  if (isPk) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing(6), padding: spacing(3) }}>
        <Stack.Screen options={{ headerShown: true, title: 'Sauvegarde chiffrée' }} />
        <Title>Sauvegarde chiffrée</Title>
        <Muted>Ce portefeuille a été importé par clé privée : il n’a pas de phrase de récupération à sauvegarder. Exporte plutôt sa clé privée (Réglages → Afficher la clé privée).</Muted>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: 'Sauvegarde chiffrée' }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing(3), paddingBottom: insets.bottom + spacing(4), gap: spacing(2) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Title>Sauvegarde chiffrée</Title>
        <Muted>
          Chiffre ta phrase de récupération avec un mot de passe, puis enregistre le fichier où
          tu veux (Drive, Fichiers, e-mail à toi-même…). Rien n’est envoyé à Nova. Le fichier est
          inutile sans ton mot de passe.
        </Muted>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.bgElevated, borderRadius: 12, padding: spacing(1.5) }}>
          <Icon name="warning" size={18} color={colors.warning} />
          <Text style={[typography.muted, { flex: 1 }]}>
            Choisis un mot de passe FORT et retiens-le : personne (pas même nous) ne peut le récupérer.
            Sans lui, la sauvegarde est irrécupérable.
          </Text>
        </View>

        <Card>
          <Text style={typography.muted}>Mot de passe de la sauvegarde</Text>
          <TextInput value={pwd} onChangeText={setPwd} placeholder="Au moins 8 caractères" placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>
        <Card>
          <Text style={typography.muted}>Confirme le mot de passe</Text>
          <TextInput value={confirm} onChangeText={setConfirm} placeholder="Répète le mot de passe" placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        {done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={18} color={colors.up} />
            <Text style={{ color: colors.up, flex: 1 }}>Sauvegarde créée et partagée. Range-la en lieu sûr.</Text>
          </View>
        ) : null}

        <View style={{ height: spacing(1) }} />
        <Button label="Créer la sauvegarde" onPress={onCreate} />
        <Muted>Pour restaurer : Portefeuilles → Importer → Sauvegarde chiffrée.</Muted>
      </ScrollView>

      <ConfirmUnlock
        visible={confirming}
        title="Sauvegarder la phrase"
        subtitle="Confirme ton identité pour chiffrer ta phrase."
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </KeyboardAvoidingView>
  );
}
