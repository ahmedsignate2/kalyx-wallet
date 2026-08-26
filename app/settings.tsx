import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Alert } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow, Chip, SectionHeader } from '../ui/premium';
import { PinPromptModal } from '../ui/PinPromptModal';
import { Icon, type IconName } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useSettings, useT, FIATS } from '../lib/settingsStore';
import { LANGUAGES } from '../lib/i18n';
import { useWallet } from '../lib/walletStore';
import { isBiometricAvailable } from '../lib/biometrics';
import { ensureNotifPermission, notificationsAvailable, notify } from '../lib/notifications';
import { toast } from '../lib/toast';

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
  const { profileName, setProfileName, language, fiat, setFiat, biometricEnabled, setBiometricEnabled, themePref, setThemePref, notifTx, notifPrice, setNotifPref, autoLockMinutes, setAutoLockMinutes, privacyGuard, setPrivacyGuard } =
    useSettings();
  const enableBiometric = useWallet((s) => s.enableBiometric);
  const disableBiometric = useWallet((s) => s.disableBiometric);
  const reset = useWallet((s) => s.reset);

  const pinLength = useSettings((s) => s.pinLength);
  const [name, setName] = useState(profileName);
  const [notifOn, setNotifOn] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  // Pop-up de saisie du PIN pour activer la biométrie.
  const [askPin, setAskPin] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioErr, setBioErr] = useState(0);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
    notificationsAvailable().then(setNotifOn).catch(() => setNotifOn(false));
  }, []);

  const onToggleNotif = async (on: boolean) => {
    if (!on) {
      // Pas de désactivation programmatique côté OS : on informe l'utilisateur.
      toast.info(t('notifications'), t('notifDisableHint'));
      return;
    }
    const ok = await ensureNotifPermission();
    setNotifOn(ok);
    if (ok) void notify(t('notifEnabledTitle'), t('notifEnabledBody'));
    else toast.warning(t('notifications'), t('notifDenied'));
  };

  const langName = LANGUAGES.find((l) => l.code === language)?.name ?? language;
  const soon = () => toast.info(t('soon'));

  const onToggleBio = async (on: boolean) => {
    if (on) setAskPin(true);
    else {
      await disableBiometric();
      setBiometricEnabled(false);
    }
  };
  const confirmEnableBio = async (pin: string) => {
    setBioBusy(true);
    try {
      await enableBiometric(pin);
      setBiometricEnabled(true);
      setAskPin(false);
    } catch {
      setBioErr((n) => n + 1); // PIN refusé → secousse dans le pop-up
    } finally {
      setBioBusy(false);
    }
  };
  const onReset = () => {
    Alert.alert(t('resetWallet'), t('resetWarning'), [
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
            <Text style={typography.body}>{t('appearance')}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
            {(
              [
                { key: 'system', label: `⚙ ${t('themeSystem')}` },
                { key: 'dark', label: `🌙 ${t('themeDark')}` },
                { key: 'light', label: `☀️ ${t('themeLight')}` },
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
        {/* Verrouillage automatique */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing(1.5), marginTop: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <Ico n="security" />
            <View style={{ flex: 1 }}>
              <Text style={typography.body}>{t('autoLock')}</Text>
              <Text style={typography.muted}>{t('autoLockHint')}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1) }}>
            {([
              { label: t('immediate'), m: 0 },
              { label: '1 min', m: 1 },
              { label: '3 min', m: 3 },
              { label: '5 min', m: 5 },
              { label: '15 min', m: 15 },
              { label: t('never'), m: -1 },
            ] as const).map((o) => (
              <Chip key={o.m} label={o.label} tone={autoLockMinutes === o.m ? 'accent' : 'neutral'} onPress={() => setAutoLockMinutes(o.m)} />
            ))}
          </View>
        </View>
        {/* Écran de garde */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing(1.5), marginTop: spacing(1.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
          <Ico n="eye" />
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>{t('privacyScreen')}</Text>
            <Text style={typography.muted}>{t('privacyScreenHint')}</Text>
          </View>
          <Switch value={privacyGuard} onValueChange={setPrivacyGuard} />
        </View>
        <ListRow divider left={<Ico n="pin" />} title={t('changePin')} right={chevron} onPress={() => router.push('/change-pin')} />
        <ListRow divider left={<Ico n="phrase" />} title={t('revealPhrase')} right={chevron} onPress={() => router.push('/reveal-phrase')} />
        <ListRow divider left={<Ico n="copy" />} title={t('revealPrivateKey')} right={chevron} onPress={() => router.push('/reveal-private-key')} />
        <ListRow divider left={<Ico n="market" />} title="Copilote IA" subtitle="Analyse & Sécurité (BYOK)" right={chevron} onPress={() => router.push('/ai-settings')} />
      </GlassCard>

      {/* Réseau & à venir */}
      <GlassCard>
        <ListRow left={<Ico n="networks" />} title={t('network')} subtitle={t('chooseActiveNetwork')} right={chevron} onPress={() => router.push('/networks')} />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing(1.5), marginTop: spacing(1.5) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), flex: 1 }}>
              <Ico n="notifications" />
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{t('notifications')}</Text>
                <Text style={typography.muted}>{t('txAlerts')}</Text>
              </View>
            </View>
            <Switch value={notifOn} onValueChange={onToggleNotif} />
          </View>
          {/* Catégories */}
          <View style={{ marginTop: spacing(1.25), gap: spacing(0.5), paddingLeft: spacing(4) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={typography.body}>{t('transactions')}</Text>
              <Switch value={notifTx} onValueChange={(v) => setNotifPref('notifTx', v)} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={typography.body}>{t('priceAlerts')}</Text>
              <Switch value={notifPrice} onValueChange={(v) => setNotifPref('notifPrice', v)} />
            </View>
          </View>
        </View>

        {/* Son */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing(1.5), marginTop: spacing(1.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), flex: 1 }}>
            <Ico n="notifications" /> {/* Placeholder icon for sound */}
            <View style={{ flex: 1 }}>
              <Text style={typography.body}>Sons de l'application</Text>
              <Text style={typography.muted}>Jouer un son lors des actions importantes</Text>
            </View>
          </View>
          <Switch value={useSettings((s) => s.soundEnabled)} onValueChange={useSettings.getState().setSoundEnabled} />
        </View>

        <ListRow divider left={<Ico n="buy" />} title={t('buyCrypto')} right={<Chip label={t('soon')} />} onPress={soon} />
      </GlassCard>

      {/* À propos */}
      <GlassCard>
        <ListRow left={<Ico n="about" />} title={t('about')} subtitle={`Nova Wallet · v${Constants.expoConfig?.version ?? '0.0.1'}`} right={chevron} onPress={() => router.push('/about')} />
      </GlassCard>

      <SectionHeader title="" />
      <ListRow left={<Ico n="reset" />} title={t('resetWallet')} onPress={onReset} right={<Text style={{ color: colors.danger }}>›</Text>} />
      <View style={{ height: spacing(2) }} />

      <PinPromptModal
        visible={askPin}
        title={t('confirmYourPin')}
        subtitle={t('enterPinForBio')}
        expectedLength={pinLength >= 6 ? pinLength : undefined}
        busy={bioBusy}
        errorSignal={bioErr}
        onSubmit={confirmEnableBio}
        onCancel={() => setAskPin(false)}
      />
    </PremiumScreen>
  );
}
