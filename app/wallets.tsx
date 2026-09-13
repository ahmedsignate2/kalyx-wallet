import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';

export default function Wallets() {
  const { colors, typography } = useTheme();
  const t = useT();
  const wallets = useWallet((s) => s.wallets);
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const setActiveWallet = useWallet((s) => s.setActiveWallet);
  const renameWallet = useWallet((s) => s.renameWallet);
  const removeWallet = useWallet((s) => s.removeWallet);

  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const onRemove = (id: string, label: string) => {
    if (wallets.length <= 1) {
      toast.warning(t('cannotTitle'), t('cannotDeleteLast'));
      return;
    }
    Alert.alert(
      t('deleteWalletQ'),
      t('deleteWalletBody').replace('{label}', label),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('deleteAction'), style: 'destructive', onPress: () => removeWallet(id).catch(() => {}) },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader />
      <Title>{t('myWallets')}</Title>
      <Muted>{t('eachWalletOwnPhrase')}</Muted>

      <ScrollView
        style={{ flex: 1, marginTop: spacing(1) }}
        contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(2) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {wallets.map((w) => {
          const active = w.id === activeWalletId;
          if (editing === w.id) {
            return (
              <Card key={w.id} style={{ gap: spacing(1) }}>
                <TextInput value={editLabel} onChangeText={setEditLabel} autoFocus placeholder={t('walletNamePlaceholder')} placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16 }} />
                <Button label={t('saveAction')} onPress={() => { renameWallet(w.id, editLabel); setEditing(null); }} />
              </Card>
            );
          }
          return (
            <Pressable key={w.id} onPress={() => setActiveWallet(w.id)}>
              <Card style={{ borderColor: active ? colors.accent : colors.cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{w.label}</Text>
                  {active ? <Text style={{ color: colors.accent, fontSize: 13, fontFamily: fonts.semibold }}>{t('activeLabel')} ✓</Text> : null}
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
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
        <View style={{ flex: 1 }}>
          <Button label={t('importAction')} variant="ghost" onPress={() => router.push('/import-wallet')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('createAction')} onPress={() => router.push('/create-wallet')} />
        </View>
      </View>
    </Screen>
  );
}
