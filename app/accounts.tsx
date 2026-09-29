import { GOLD, IconDisc, NovaHero, Pulse, Rise } from '../ui/nova';
import { AddressGlyph } from '../ui/kit';
import { Icon } from '../ui/icon';
import { isWalletError } from '../src';
import { friendlyTxError } from '../lib/txError';
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
      setError(isWalletError(e) ? friendlyTxError(e, t) : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <ScreenHeader />
      <NovaHero icon="accounts" title={t('accounts')} subtitle={t('allDerived')} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6), paddingTop: spacing(1) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      <View style={{ gap: spacing(1.5) }}>
        {accounts.map((a, i) => {
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
            <Rise key={a.index} delay={Math.min(i, 8) * 50}>
            <KPressable
              onPress={() => setActiveAccount(a.index)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={accountDisplayName(a, t)}
            >
              <Card
                style={{
                  borderColor: active ? 'rgba(221,181,101,0.45)' : colors.border,
                  borderRadius: 24,
                  gap: spacing(1.5),
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <AddressGlyph address={a.evmAddress} size={32} />
                </View>
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
                  <IconDisc name="sign" size={34} />
                </KPressable>
                {active ? <Pulse size={8} /> : <View style={{ width: 8 }} />}
              </Card>
            </KPressable>
            </Rise>
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
        <KPressable onPress={() => setAdding(true)} haptic="light" style={{ marginTop: spacing(1.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), padding: spacing(2), borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}>
          <IconDisc name="add" tone="gold" />
          <Text style={{ color: colors.text, fontFamily: 'GeneralSans-Semibold', fontSize: 15 }}>{t('addAccountPlus').replace(/^[+＋]\s*/, '')}</Text>
        </KPressable>
      )}
      </ScrollView>
    </Screen>
  );
}
