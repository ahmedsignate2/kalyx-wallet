import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';

export default function Wallets() {
  const wallets = useWallet((s) => s.wallets);
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const setActiveWallet = useWallet((s) => s.setActiveWallet);
  const renameWallet = useWallet((s) => s.renameWallet);
  const removeWallet = useWallet((s) => s.removeWallet);

  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const onRemove = (id: string, label: string) => {
    if (wallets.length <= 1) {
      Alert.alert('Impossible', 'Tu ne peux pas supprimer ton dernier portefeuille.');
      return;
    }
    Alert.alert(
      'Supprimer ce portefeuille ?',
      `« ${label} » sera retiré de cet appareil. Assure-toi d’avoir sa phrase de récupération, sinon les fonds seront perdus.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => removeWallet(id).catch(() => {}) },
      ],
    );
  };

  return (
    <Screen>
      <Title>Mes portefeuilles</Title>
      <Muted>Chaque portefeuille a sa propre phrase de récupération.</Muted>

      <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
        {wallets.map((w) => {
          const active = w.id === activeWalletId;
          if (editing === w.id) {
            return (
              <Card key={w.id} style={{ gap: spacing(1) }}>
                <TextInput value={editLabel} onChangeText={setEditLabel} autoFocus placeholder="Nom du portefeuille" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16 }} />
                <Button label="Enregistrer" onPress={() => { renameWallet(w.id, editLabel); setEditing(null); }} />
              </Card>
            );
          }
          return (
            <Pressable key={w.id} onPress={() => setActiveWallet(w.id)}>
              <Card style={{ borderColor: active ? colors.accent : colors.cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{w.label}</Text>
                  {active ? <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Actif ✓</Text> : null}
                </View>
                <Pressable onPress={() => { setEditing(w.id); setEditLabel(w.label); }} hitSlop={10}>
                  <Text style={{ fontSize: 16, marginRight: spacing(1.5) }}>✏️</Text>
                </Pressable>
                <Pressable onPress={() => onRemove(w.id, w.label)} hitSlop={10}>
                  <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                </Pressable>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
        <View style={{ flex: 1 }}>
          <Button label="Importer" variant="ghost" onPress={() => router.push('/import-wallet')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Créer" onPress={() => router.push('/create-wallet')} />
        </View>
      </View>
    </Screen>
  );
}
