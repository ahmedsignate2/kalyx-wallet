import { IconDisc, NovaCard, NovaSwitch, OptionPill, Orbit, SectionLabel, SettingRow } from '../ui/nova';
import { WalletAvatar, AvatarPicker } from '../ui/avatarArt';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Alert } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow, Chip, SectionHeader } from '../ui/premium';
import { PinPromptModal } from '../ui/PinPromptModal';
import { Icon, type IconName } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useSettings, useT, FIATS } from '../lib/settingsStore';
import { LANGUAGES } from '../lib/i18n';
import { useWallet } from '../lib/walletStore';
import { isBiometricAvailable } from '../lib/biometrics';
import { ensureNotifPermission, notificationsAvailable, notify } from '../lib/notifications';
import { toast } from '../lib/toast';
import { friendlyTxError } from '../lib/txError';
import { isWalletError } from '../src';

function Ico({ n }: { n: IconName }) {
  return <IconDisc name={n} />;
}
const chevron = <Icon name="chevron" size={18} tone="faint" />;

function OptionButton({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <KPressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(0.75),
        minHeight: 38,
        paddingHorizontal: spacing(1.25),
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : 'transparent',
      }}
    >
      {/* Coche si sélectionné, sinon l'icône de l'option — jamais les deux, pour
          ne pas élargir le bouton selon son état. */}
      {selected ? (
        <Icon name="checkmark" size={15} color={colors.onPrimary} />
      ) : icon ? (
        <Icon name={icon} size={15} color={colors.text} />
      ) : null}
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontFamily: fonts.semibold }}>{label}</Text>
    </KPressable>
  );
}

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
  const [confirmReset, setConfirmReset] = useState(false);
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

  const onToggleBio = async (on: boolean) => {
    if (on) setAskPin(true);
    else {
      try {
        await disableBiometric();
        setBiometricEnabled(false);
      } catch (e) {
        toast.error(friendlyTxError(e, t as never)); // l'interrupteur reste juste : rien n'a changé
      }
    }
  };
  const confirmEnableBio = async (pin: string) => {
    setBioBusy(true);
    try {
      await enableBiometric(pin);
      setBiometricEnabled(true);
      setAskPin(false);
    } catch (e) {
      // Code refusé → secousse. Tout autre refus (code de contrainte défini, biométrie refusée,
      // trop d'essais) est DIT : sinon on retapait le bon code sans jamais savoir pourquoi.
      if (isWalletError(e) && e.code === 'WRONG_PIN') setBioErr((n) => n + 1);
      else {
        setAskPin(false);
        toast.error(friendlyTxError(e, t as never));
      }
    } finally {
      setBioBusy(false);
    }
  };
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const [pickAvatar, setPickAvatar] = useState(false);
  const onReset = () => {
    Alert.alert(t('resetWallet'), t('resetWarning'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('resetWallet'),
        style: 'destructive',
        // Tout effacer exige le code (ou la biométrie), pas seulement cette confirmation.
        onPress: () => setConfirmReset(true),
      },
    ]);
  };

  const soundOn = useSettings((s) => s.soundEnabled);
  const hapticsOn = useSettings((s) => s.hapticsEnabled);

  return (
    <PremiumScreen>
      <AvatarPicker walletId={activeWalletId} visible={pickAvatar} onClose={() => setPickAvatar(false)} />
      <ScreenHeader />

      {/*
        HÉROS : l'avatar en grand, dans son orbite. Un tap ouvre le sélecteur ;
        le nom se modifie juste dessous, centré, comme un titre.
      */}
      <View style={{ alignItems: 'center', gap: spacing(1) }}>
        <KPressable onPress={() => setPickAvatar(true)} haptic="light" accessibilityLabel={t('a11yChangeAvatar')} style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
          <View pointerEvents="none" style={{ position: 'absolute', left: 52, top: 52 }}><Orbit cx={0} cy={0} r={68} /></View>
          <WalletAvatar size={96} />
          <View style={{ position: 'absolute', right: 2, bottom: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="image" size={14} color={colors.onPrimary} />
          </View>
        </KPressable>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={() => setProfileName(name.trim())}
          onSubmitEditing={() => setProfileName(name.trim())}
          placeholder={t('yourName')}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={t('profile')}
          style={{ color: colors.text, fontSize: 26, fontFamily: fonts.bold, textAlign: 'center', minWidth: 200, paddingVertical: 4 }}
        />
        <Text style={[typography.muted, { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }]}>{t('profile')} · {t('settings')}</Text>
      </View>

      {/* Préférences */}
      <SectionLabel>{t('menuSecPreferences')}</SectionLabel>
      <NovaCard delay={60}>
        <SettingRow icon="language" title={t('language')} hint={langName} onPress={() => router.push('/language')} />
        <SettingRow divider icon="currency" title={t('currency')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), paddingBottom: spacing(1.5) }}>
          {/* Symbole seulement s'il diffère du code : « CHF CHF » devient « CHF ». */}
          {FIATS.map((f) => (
            <OptionPill key={f.code} label={f.symbol.toUpperCase() === f.code.toUpperCase() ? f.code.toUpperCase() : `${f.symbol} ${f.code.toUpperCase()}`} selected={f.code === fiat} onPress={() => setFiat(f.code)} />
          ))}
        </View>
        <SettingRow divider icon="appearance" title={t('appearance')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
          {(
            [
              { key: 'system', label: t('themeSystem') },
              { key: 'dark', label: t('themeDark') },
              { key: 'light', label: t('themeLight') },
            ] as const
          ).map((o) => (
            <OptionPill key={o.key} label={o.label} selected={themePref === o.key} onPress={() => setThemePref(o.key)} />
          ))}
        </View>
      </NovaCard>

      {/* Sécurité */}
      <SectionLabel>{t('security')}</SectionLabel>
      <NovaCard delay={120}>
        {bioAvailable ? <SettingRow icon="security" title={t('biometrics')} right={<NovaSwitch value={biometricEnabled} onValueChange={onToggleBio} />} /> : null}
        <SettingRow divider={bioAvailable} icon="lock" title={t('autoLock')} hint={t('autoLockHint')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), paddingBottom: spacing(1.5) }}>
          {([
            { label: t('immediate'), m: 0 },
            { label: '1 min', m: 1 },
            { label: '3 min', m: 3 },
            { label: '5 min', m: 5 },
            { label: '15 min', m: 15 },
            { label: t('never'), m: -1 },
          ] as const).map((o) => (
            <OptionPill key={o.m} label={o.label} selected={autoLockMinutes === o.m} onPress={() => setAutoLockMinutes(o.m)} />
          ))}
        </View>
        <SettingRow divider icon="eye" title={t('privacyScreen')} hint={t('privacyScreenHint')} right={<NovaSwitch value={privacyGuard} onValueChange={setPrivacyGuard} />} />
        <SettingRow divider icon="pin" title={t('changePin')} onPress={() => router.push('/change-pin')} />
        <SettingRow divider icon="phrase" title={t('revealPhrase')} onPress={() => router.push('/reveal-phrase')} />
        <SettingRow divider icon="copy" title={t('revealPrivateKey')} onPress={() => router.push('/reveal-private-key')} />
        <SettingRow divider icon="sparkles" tone="gold" title={t('copilotByok')} hint={t('copilotByokSubtitle')} onPress={() => router.push('/ai-settings')} />
      </NovaCard>

      {/* Notifications, sons, vibrations */}
      <SectionLabel>{t('notifications')}</SectionLabel>
      <NovaCard delay={180}>
        <SettingRow icon="networks" title={t('network')} hint={t('chooseActiveNetwork')} onPress={() => router.push('/networks')} />
        <SettingRow divider icon="notifications" title={t('notifications')} hint={t('txAlerts')} right={<NovaSwitch value={notifOn} onValueChange={onToggleNotif} />} />
        {notifOn ? (
          <View style={{ paddingLeft: 48, paddingBottom: spacing(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
              <Text style={typography.body}>{t('transactions')}</Text>
              <NovaSwitch value={notifTx} onValueChange={(v) => setNotifPref('notifTx', v)} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
              <Text style={typography.body}>{t('priceAlerts')}</Text>
              <NovaSwitch value={notifPrice} onValueChange={(v) => setNotifPref('notifPrice', v)} />
            </View>
          </View>
        ) : null}
        <SettingRow divider icon="bell" title={t('appSounds')} hint={t('appSoundsHint')} right={<NovaSwitch value={soundOn} onValueChange={useSettings.getState().setSoundEnabled} />} />
        <SettingRow divider icon="flash" title={t('appHaptics')} hint={t('appHapticsHint')} right={<NovaSwitch value={hapticsOn} onValueChange={useSettings.getState().setHapticsEnabled} />} />
      </NovaCard>

      {/* À propos et réinitialisation */}
      <NovaCard delay={240}>
        <SettingRow icon="about" title={t('about')} hint={`Kalyx Wallet · v${Constants.expoConfig?.version ?? '0.0.1'}`} onPress={() => router.push('/about')} />
        <SettingRow divider icon="reset" tone="danger" title={t('resetWallet')} onPress={onReset} />
      </NovaCard>
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
      <ConfirmUnlock
        visible={confirmReset}
        title={t('resetWallet')}
        perform={(unlock) => reset(unlock)}
        onDone={() => {
          setConfirmReset(false);
          router.replace('/welcome');
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </PremiumScreen>
  );
}
