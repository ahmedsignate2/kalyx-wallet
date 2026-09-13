import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';

function shorten(a: string) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export default function Accounts() {
  const { colors, typography } = useTheme();
  const t = useT();
  // Noms suggérés (style Revolut) proposés à la création.
  const SUGGESTIONS = [t('sugTrading'), t('sugDefi'), t('sugSavings'), t('sugAccount2')];
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const setActiveAccount = useWallet((s) => s.setActiveAccount);
  const addAccount = useWallet((s) => s.addAccount);
  const renameAccount = useWallet((s) => s.renameAccount);

  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const onAdd = async () => {
    setError(null);
    if (pin.length < 6) {
      setError(t('enterYourPin'));
      return;
    }
    setBusy(true);
    try {
      await addAccount({ pin }, newLabel.trim() || undefined);
      setPin('');
      setNewLabel('');
      setAdding(false);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <ScreenHeader />
      <Title>{t('accounts')}</Title>
      <Muted>{t('allDerived')}</Muted>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6), paddingTop: spacing(1) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      <View style={{ gap: spacing(1.5) }}>
        {accounts.map((a) => {
          const active = a.index === activeAccountIndex;
          if (editing === a.index) {
            return (
              <Card key={a.index} style={{ gap: spacing(1) }}>
                <TextInput
                  value={editLabel}
                  onChangeText={setEditLabel}
                  autoFocus
                  placeholder={t('accountNamePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={{ color: colors.text, fontSize: 16 }}
                />
                <View style={{ flexDirection: 'row', gap: spacing(1) }}>
                  <Button
                    label={t('saveAction')}
                    onPress={() => {
                      renameAccount(a.index, editLabel);
                      setEditing(null);
                    }}
                  />
                </View>
              </Card>
            );
          }
          return (
            <Pressable key={a.index} onPress={() => setActiveAccount(a.index)}>
              <Card
                style={{
                  borderColor: active ? colors.accent : colors.cardBorder,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{a.label}</Text>
                  <Muted>{shorten(a.evmAddress)}</Muted>
                </View>
                <Pressable
                  onPress={() => {
                    setEditing(a.index);
                    setEditLabel(a.label);
                  }}
                  hitSlop={10}
                >
                  <Text style={{ fontSize: 16, marginRight: spacing(1.5) }}>✏️</Text>
                </Pressable>
                {active ? <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text> : null}
              </Card>
            </Pressable>
          );
        })}
      </View>

      {adding ? (
        <Card style={{ marginTop: spacing(1), gap: spacing(1) }}>
          <Text style={typography.muted}>{t('nameOptional')}</Text>
          <TextInput
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder={t('accountNameExample')}
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, fontSize: 16 }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => setNewLabel(s)}>
                <Text style={{ color: colors.accent, fontSize: 13 }}>{s}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={typography.muted}>{t('pinLabel')}</Text>
          <TextInput
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }}
          />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button label={busy ? t('creating') : t('createAccount')} loading={busy} onPress={onAdd} />
        </Card>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={{ marginTop: spacing(1) }}>
          <Text style={{ color: colors.accent }}>{t('addAccountPlus')}</Text>
        </Pressable>
      )}
      </ScrollView>
    </Screen>
  );
}
