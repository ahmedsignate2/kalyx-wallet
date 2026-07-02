import React, { useEffect } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { router } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { colors, radii, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';

/**
 * Affiche la phrase de récupération.
 * SÉCURITÉ : capture d'écran bloquée pendant l'affichage de la seed
 * (FLAG_SECURE Android ; sur iOS, expo-screen-capture notifie/masque).
 */
export default function Backup() {
  const draft = useWallet((s) => s.draftMnemonic);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('seed').catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync('seed').catch(() => {});
    };
  }, []);

  if (!draft) {
    return (
      <Screen>
        <Muted>Aucune phrase à afficher. Reviens à l'accueil.</Muted>
        <Button label="Retour" variant="ghost" onPress={() => router.replace('/welcome')} />
      </Screen>
    );
  }

  const words = draft.split(' ');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: spacing(2) }}>
        <Title>Ta phrase de récupération</Title>
        <Muted>
          Écris ces {words.length} mots dans l'ordre, sur papier. Ne les prends pas en
          photo, ne les copie pas dans le cloud. C'est la seule façon de restaurer ton
          wallet {Platform.OS === 'android' ? '(capture d\'écran bloquée)' : ''}.
        </Muted>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
            {words.map((w, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.bgElevated,
                  borderRadius: radii.sm,
                  paddingVertical: spacing(1),
                  paddingHorizontal: spacing(1.5),
                  minWidth: '30%',
                  gap: 6,
                }}
              >
                <Text style={[typography.muted, { width: 20 }]}>{i + 1}</Text>
                <Text style={typography.body}>{w}</Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
      <Button label="J'ai noté ma phrase" onPress={() => router.push('/verify')} />
    </Screen>
  );
}
