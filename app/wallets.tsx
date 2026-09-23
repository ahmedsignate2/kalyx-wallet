import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import { Icon } from '../ui/icon';
import React, { useState } from 'react';
import { View, Text, TextInput, Alert, ScrollView } from 'react-native';
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
                <TextInput value={editLabel} onChangeText={setEditLabel} autoFocus placeholder={t('walletNamePlaceholder')} placeholderTextColor={colors.textSecondary} style={{ color: colors.text, fontSize: 16 }} />
                <Button label={t('saveAction')} onPress={() => { renameWallet(w.id, editLabel); setEditing(null); }} />
              </Card>
            );
          }
          return (
            <KPressable
              key={w.id}
              onPress={() => setActiveWallet(w.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={w.label}
            >
              <Card style={{ borderColor: active ? colors.primary : colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{w.label}</Text>
                  {active ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: colors.primary, fontSize: 13, fontFamily: fonts.semibold }}>{t('activeLabel')}</Text>
                      <Icon name="check" size={13} color={colors.primary} />
                    </View>
                  ) : null}
                </View>
                {/*
                  Ces deux actions étaient un EMOJI (✏️) et un « ✕ » texte, sans
                  libellé pour le lecteur d'écran. L'emoji est interdit (§19), et
                  son rendu change selon la plateforme et la police.
                */}
                <KPressable
                  onPress={() => { setEditing(w.id); setEditLabel(w.label); }}
                  hitSlop={10}
                  accessibilityLabel={t('name')}
                  style={{ marginRight: spacing(1.5) }}
                >
                  <Icon name="sign" size={18} />
                </KPressable>
                <KPressable onPress={() => onRemove(w.id, w.label)} hitSlop={10} accessibilityLabel={t('deleteAction')}>
                  <Icon name="close" size={18} color={colors.danger} />
                </KPressable>
              </Card>
            </KPressable>
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
