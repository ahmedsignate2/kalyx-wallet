import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useContacts } from '../lib/contactsStore';
import { useT } from '../lib/settingsStore';
import { useEnsName } from '../lib/useEns';

function shorten(a: string) {
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

/** Sous-titre d'un contact : nom ENS (si l'adresse en a un) + adresse tronquée. */
function ContactSub({ address }: { address: string }) {
  const { colors } = useTheme();
  const ensName = useEnsName(address);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
      {ensName ? <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 }}>{ensName}</Text> : null}
      <Muted>{shorten(address)}</Muted>
    </View>
  );
}

export default function Contacts() {
  const { colors, typography } = useTheme();
  const t = useT();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const pickMode = pick === '1';
  const { contacts, add, update, remove } = useContacts();

  const [form, setForm] = useState<null | { id?: string; name: string; address: string }>(null);

  const save = () => {
    if (!form || !form.name.trim() || !form.address.trim()) return;
    if (form.id) update(form.id, form.name, form.address);
    else add(form.name, form.address);
    setForm(null);
  };

  const onTap = (address: string, id: string, name: string) => {
    if (pickMode) router.navigate({ pathname: '/send', params: { to: address } });
    else setForm({ id, name, address });
  };

  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <ScreenHeader />
      <Title>{t('contacts')}</Title>
      <Muted>{pickMode ? t('chooseRecipient') : t('localAddressBook')}</Muted>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing(1.5), paddingTop: spacing(1), paddingBottom: insets.bottom + spacing(6) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {contacts.length === 0 ? <Muted>{t('noContactsYet')}</Muted> : null}
        {contacts.map((c) => (
          <Pressable key={c.id} onPress={() => onTap(c.address, c.id, c.name)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{c.name}</Text>
                <ContactSub address={c.address} />
              </View>
              {!pickMode ? (
                <Pressable onPress={() => remove(c.id)} hitSlop={10}>
                  <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                </Pressable>
              ) : (
                <Text style={{ color: colors.accent }}>{t('chooseWord')} ›</Text>
              )}
            </Card>
          </Pressable>
        ))}

      {form ? (
        <Card style={{ marginTop: spacing(1), gap: spacing(1) }}>
          <Text style={typography.muted}>{t('name')}</Text>
          <TextInput value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder={t('contactNameExample')} placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16 }} />
          <Text style={typography.muted}>{t('addressLabel')}</Text>
          <TextInput value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder="0x… ou bc1…" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={{ color: colors.text, fontSize: 15 }} />
          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
            <View style={{ flex: 1 }}><Button label={t('cancel')} variant="ghost" onPress={() => setForm(null)} /></View>
            <View style={{ flex: 1 }}><Button label={t('saveAction')} onPress={save} /></View>
          </View>
        </Card>
      ) : (
        <Pressable onPress={() => setForm({ name: '', address: '' })} style={{ marginTop: spacing(1) }}>
          <Text style={{ color: colors.accent }}>{t('addContactPlus')}</Text>
        </Pressable>
      )}
      </ScrollView>
    </Screen>
  );
}
