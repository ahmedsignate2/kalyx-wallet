import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, radii, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';

function shorten(a: string) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export default function Accounts() {
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const setActiveAccount = useWallet((s) => s.setActiveAccount);
  const addAccount = useWallet((s) => s.addAccount);

  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (index: number) => {
    setActiveAccount(index);
    router.back();
  };

  const onAdd = async () => {
    setError(null);
    if (pin.length < 6) {
      setError('Entre ton PIN pour créer un compte.');
      return;
    }
    setBusy(true);
    try {
      await addAccount({ pin });
      setPin('');
      setAdding(false);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la création.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Comptes</Title>
      <Muted>Tous dérivés de ta même phrase de récupération.</Muted>

      <View style={{ gap: spacing(1.5), marginTop: spacing(1) }}>
        {accounts.map((a) => {
          const active = a.index === activeAccountIndex;
          return (
            <Pressable key={a.index} onPress={() => choose(a.index)}>
              <Card
                style={{
                  borderColor: active ? colors.accent : colors.cardBorder,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text style={typography.body}>{a.label}</Text>
                  <Muted>{shorten(a.evmAddress)}</Muted>
                </View>
                {active ? <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text> : null}
              </Card>
            </Pressable>
          );
        })}
      </View>

      {adding ? (
        <Card style={{ marginTop: spacing(1) }}>
          <Text style={typography.muted}>PIN (pour dériver le nouveau compte)</Text>
          <TextInput
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={12}
            style={{ color: colors.text, fontSize: 22, letterSpacing: 6, paddingVertical: spacing(1) }}
          />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button label={busy ? 'Création…' : 'Créer le compte'} loading={busy} onPress={onAdd} />
        </Card>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={{ marginTop: spacing(1) }}>
          <Text style={{ color: colors.accent }}>+ Ajouter un compte</Text>
        </Pressable>
      )}
    </Screen>
  );
}
