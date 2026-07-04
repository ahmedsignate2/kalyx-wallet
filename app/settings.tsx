import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Alert } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow, Chip, SectionHeader } from '../ui/premium';
import { Icon, type IconName } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useSettings, useT, FIATS } from '../lib/settingsStore';
import { LANGUAGES } from '../lib/i18n';
import { useWallet } from '../lib/walletStore';
import { isBiometricAvailable } from '../lib/biometrics';

function Ico({ n }: { n: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 28, alignItems: 'center' }}>
      <Icon name={n} size={20} tone="muted" />
    </View>
  );
}
const chevron = <Icon name="chevron" size={18} tone="faint" />;

export default function Settings() {
  const { colors, typography } = useTheme();
  const t = useT();
  const { profileName, setProfileName, language, fiat, setFiat, biometricEnabled, setBiometricEnabled, themePref, setThemePref } =
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
  const soon = () => Alert.alert(t('soon'));

  const onToggleBio = async (on: boolean) => {
    if (on) setPinForBio('');
    else {
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
      Alert.alert('PIN incorrect');
    }
  };
  const onReset = () => {
    Alert.alert(t('resetWallet'), 'Assure-toi d’avoir ta phrase de récupération.', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('resetWallet'),
        style: 'destructive',
        onPress: async () => {
          await reset();
          router.replace('/welcome');
        },
      },
    ]);
  };

  return (
    <PremiumScreen>
      <Text style={typography.title}>{t('settings')}</Text>

      {/* Profil */}
      <GlassCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
          <Ico n="profile" />
          <View style={{ flex: 1 }}>
            <Text style={typography.muted}>{t('profile')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={() => setProfileName(name.trim())}
              onSubmitEditing={() => setProfileName(name.trim())}
              placeholder={t('yourName')}
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: 18, paddingVertical: 4 }}
            />
          </View>
        </View>
      </GlassCard>

      {/* Préférences */}
      <GlassCard>
        <ListRow left={<Ico n="language" />} title={t('language')} subtitle={langName} right={chevron} onPress={() => router.push('/language')} />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing(1.5), marginTop: spacing(0.5) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <Ico n="currency" />
            <Text style={typography.body}>{t('currency')}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
            {FIATS.map((f) => (
              <Chip key={f.code} label={`${f.symbol} ${f.code.toUpperCase()}`} tone={f.code === fiat ? 'accent' : 'neutral'} onPress={() => setFiat(f.code)} />
            ))}
          </View>
        </View>
        {/* Apparence : Système / Sombre / Clair */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing(1.5), marginTop: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <Ico n="appearance" />
            <Text style={typography.body}>Apparence</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
            {(
              [
                { key: 'system', label: '⚙ Système' },
                { key: 'dark', label: '🌙 Sombre' },
                { key: 'light', label: '☀️ Clair' },
              ] as const
            ).map((o) => (
              <Chip key={o.key} label={o.label} tone={themePref === o.key ? 'accent' : 'neutral'} onPress={() => setThemePref(o.key)} />
            ))}
          </View>
        </View>
      </GlassCard>

      {/* Sécurité */}
      <GlassCard>
        {bioAvailable ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <Ico n="security" />
              <Text style={typography.body}>{t('biometrics')}</Text>
            </View>
            <Switch value={biometricEnabled} onValueChange={onToggleBio} />
          </View>
        ) : null}
        {pinForBio !== null ? (
          <View style={{ gap: spacing(1), marginTop: spacing(1) }}>
            <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry placeholder="PIN" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
            <Chip label="Activer" tone="accent" onPress={confirmEnableBio} />
          </View>
        ) : null}
        <ListRow divider left={<Ico n="pin" />} title={t('changePin')} right={chevron} onPress={() => router.push('/change-pin')} />
        <ListRow divider left={<Ico n="phrase" />} title={t('revealPhrase')} right={chevron} onPress={() => router.push('/reveal-phrase')} />
      </GlassCard>

      {/* Réseau & à venir */}
      <GlassCard>
        <ListRow left={<Ico n="networks" />} title="Réseau" subtitle="Choisir le réseau actif" right={chevron} onPress={() => router.push('/networks')} />
        <ListRow divider left={<Ico n="notifications" />} title="Notifications" right={<Chip label={t('soon')} />} onPress={soon} />
        <ListRow divider left={<Ico n="buy" />} title="Achat crypto" right={<Chip label={t('soon')} />} onPress={soon} />
      </GlassCard>

      {/* À propos */}
      <GlassCard>
        <ListRow left={<Ico n="about" />} title={t('about')} subtitle={`Nova Wallet · v${Constants.expoConfig?.version ?? '0.0.1'}`} />
      </GlassCard>

      <SectionHeader title="" />
      <ListRow left={<Ico n="reset" />} title={t('resetWallet')} onPress={onReset} right={<Text style={{ color: colors.danger }}>›</Text>} />
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
  );
}
