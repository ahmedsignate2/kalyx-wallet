import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, Card, Title, Muted, Button } from '../ui/components';
import { ListRow, Chip } from '../ui/premium';
import { colors, spacing, typography } from '../ui/theme';
import { useSettings, useT, FIATS } from '../lib/settingsStore';
import { LANGUAGES } from '../lib/i18n';
import { useWallet } from '../lib/walletStore';
import { isBiometricAvailable } from '../lib/biometrics';

export default function Settings() {
  const t = useT();
  const { profileName, setProfileName, language, fiat, setFiat, biometricEnabled, setBiometricEnabled } =
    useSettings();
  const enableBiometric = useWallet((s) => s.enableBiometric);
  const disableBiometric = useWallet((s) => s.disableBiometric);
  const reset = useWallet((s) => s.reset);

  const [name, setName] = useState(profileName);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [pinForBio, setPinForBio] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
  }, []);

  const langName = LANGUAGES.find((l) => l.code === language)?.name ?? language;

  const onToggleBio = async (on: boolean) => {
    if (on) {
      setPinForBio(''); // ouvre la saisie du PIN
    } else {
      await disableBiometric();
      setBiometricEnabled(false);
    }
  };

  const confirmEnableBio = async () => {
    try {
      await enableBiometric(pin);
      setBiometricEnabled(true);
      setPinForBio(null);
      setPin('');
    } catch {
      Alert.alert('PIN incorrect', 'Impossible d’activer la biométrie.');
    }
  };

  const onReset = () => {
    Alert.alert(
      t('resetWallet'),
      'Cette action supprime le wallet de cet appareil. Assure-toi d’avoir ta phrase de récupération.',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('resetWallet'),
          style: 'destructive',
          onPress: async () => {
            await reset();
            router.replace('/welcome');
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }}>
        <Title>{t('settings')}</Title>

        {/* Profil */}
        <Card>
          <Muted>{t('profile')}</Muted>
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={() => setProfileName(name.trim())}
            placeholder={t('yourName')}
            placeholderTextColor={colors.textMuted}
            style={{ color: colors.text, fontSize: 18, paddingVertical: spacing(1) }}
          />
          <Button label={t('save')} onPress={() => setProfileName(name.trim())} />
        </Card>

        {/* Préférences */}
        <Card>
          <ListRow
            title={t('language')}
            subtitle={langName}
            onPress={() => router.push('/language')}
            right={<Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>}
          />
          <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing(1.5) }}>
            <Muted>{t('currency')}</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
              {FIATS.map((f) => (
                <Chip key={f.code} label={`${f.symbol} ${f.code.toUpperCase()}`} tone={f.code === fiat ? 'accent' : 'neutral'} onPress={() => setFiat(f.code)} />
              ))}
            </View>
          </View>
        </Card>

        {/* Sécurité */}
        <Card>
          <Muted>{t('security')}</Muted>
          {bioAvailable ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={typography.body}>{t('biometrics')}</Text>
              <Switch value={biometricEnabled} onValueChange={onToggleBio} />
            </View>
          ) : null}
          {pinForBio !== null ? (
            <View style={{ gap: spacing(1) }}>
              <TextInput
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                secureTextEntry
                placeholder="PIN"
                placeholderTextColor={colors.textMuted}
                style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }}
              />
              <Button label="Activer la biométrie" onPress={confirmEnableBio} />
            </View>
          ) : null}
          <ListRow divider title={t('changePin')} onPress={() => router.push('/change-pin')} right={<Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>} />
          <ListRow divider title={t('revealPhrase')} onPress={() => router.push('/reveal-phrase')} right={<Text style={{ color: colors.textFaint, fontSize: 20 }}>›</Text>} />
        </Card>

        {/* À propos */}
        <Card>
          <ListRow title={t('about')} subtitle={`Nova Wallet · v${Constants.expoConfig?.version ?? '0.0.1'}`} />
        </Card>

        <Button label={t('resetWallet')} variant="ghost" onPress={onReset} />
        <Text style={{ color: colors.danger, textAlign: 'center', fontSize: 12 }}>Zone sensible</Text>
      </ScrollView>
    </Screen>
  );
}
