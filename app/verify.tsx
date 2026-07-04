import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { createBackupChallenge, verifyBackupChallenge } from '../src';

/**
 * Confirme que l'utilisateur a bien noté sa phrase : il doit re-sélectionner
 * quelques mots aux bonnes positions (logique fournie par le moteur testé).
 */
export default function Verify() {
  const { colors, typography } = useTheme();
  const draft = useWallet((s) => s.draftMnemonic);
  const challenge = useMemo(
    () => (draft ? createBackupChallenge(draft, { count: 3, optionsPerWord: 4 }) : []),
    [draft],
  );
  const [answers, setAnswers] = useState<Record<number, string>>({});

  if (!draft) {
    return (
      <Screen>
        <Muted>Session expirée. Recommence l'onboarding.</Muted>
        <Button label="Retour" variant="ghost" onPress={() => router.replace('/welcome')} />
      </Screen>
    );
  }

  const allAnswered = challenge.every((c) => answers[c.position]);

  const onValidate = () => {
    const list = challenge.map((c) => ({ position: c.position, word: answers[c.position] }));
    if (verifyBackupChallenge(draft, list)) {
      router.push('/set-pin');
    } else {
      Alert.alert('Presque', 'Un mot ne correspond pas. Vérifie ta phrase notée.');
      setAnswers({});
    }
  };

  return (
    <Screen>
      <Title>Vérifie ta sauvegarde</Title>
      <Muted>Sélectionne le bon mot pour chaque position.</Muted>
      <View style={{ gap: spacing(2), marginTop: spacing(1) }}>
        {challenge.map((c) => (
          <Card key={c.position}>
            <Text style={typography.muted}>Mot n°{c.position}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
              {c.options.map((opt) => {
                const selected = answers[c.position] === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setAnswers((a) => ({ ...a, [c.position]: opt }))}
                    style={{
                      paddingVertical: spacing(1),
                      paddingHorizontal: spacing(2),
                      borderRadius: radii.pill,
                      backgroundColor: selected ? colors.accent : colors.bgElevated,
                    }}
                  >
                    <Text style={{ color: colors.text }}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Button label="Valider" disabled={!allAnswered} onPress={onValidate} />
    </Screen>
  );
}
