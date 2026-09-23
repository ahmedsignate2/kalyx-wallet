import { Icon } from '../ui/icon';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { accountDisplayName } from '../lib/walletNames';
import { useT, useSettings } from '../lib/settingsStore';

function shorten(a: string) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export default function Accounts() {
  const { colors, typography } = useTheme();
  const t = useT();
  const language = useSettings((st) => st.language);
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
                  placeholderTextColor={colors.textSecondary}
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
            <KPressable
              key={a.index}
              onPress={() => setActiveAccount(a.index)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={accountDisplayName(a, t)}
            >
              <Card
                style={{
                  borderColor: active ? colors.primary : colors.border,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{accountDisplayName(a, t)}</Text>
                  <Muted>{shorten(a.evmAddress)}</Muted>
                </View>
                {/* Emoji ✏️ et « ✓ » texte remplacés : interdits (§19) et sans
                    libellé pour le lecteur d'écran. */}
                <KPressable
                  onPress={() => {
                    setEditing(a.index);
                    setEditLabel(accountDisplayName(a, t));
                  }}
                  hitSlop={10}
                  accessibilityLabel={t('nameOptional')}
                  style={{ marginRight: spacing(1.5) }}
                >
                  <Icon name="sign" size={18} />
                </KPressable>
                {active ? <Icon name="check" size={18} color={colors.primary} /> : null}
              </Card>
            </KPressable>
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
            placeholderTextColor={colors.textSecondary}
            style={{ color: colors.text, fontSize: 16 }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {SUGGESTIONS.map((s) => (
              <KPressable key={s} onPress={() => setNewLabel(s)} hitSlop={8} accessibilityLabel={s}>
                <Text style={{ color: colors.primary, fontSize: 13 }}>{s}</Text>
              </KPressable>
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
        <KPressable onPress={() => setAdding(true)} hitSlop={8} style={{ marginTop: spacing(1) }}>
          <Text style={{ color: colors.primary }}>{t('addAccountPlus')}</Text>
        </KPressable>
      )}
      </ScrollView>
    </Screen>
  );
}
