import { radius, fontSize } from '../ui/tokens';
import { isWalletError } from '../src';
import { friendlyTxError } from '../lib/txError';
import { Pressable as KPressable, Halo, Sheet, HoldButton, Button } from '../ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { Orbit, Rise, Stardust } from '../ui/nova';
import { router, Stack } from 'expo-router';
import { useResetToHome } from '../lib/nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from '../ui/PinPad';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useDriveFlow } from '../lib/googleDrive';
import { useWallet, pinLockRemainingMs } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { flushPendingIntent } from '../lib/paymentIntent';
import { isBiometricAvailable, isBiometricLockedOut } from '../lib/biometrics';
import { acknowledgeReinstall, detectReinstall } from '../lib/installMarker';
import { recordTechnicalLog } from '../lib/technicalLogger';

export default function Unlock() {
  // Pile vidée jusqu'aux onglets : un replace('/home') empilait un second jeu d'onglets sous lequel le balayage iOS revenait.
  const resetToHome = useResetToHome();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const t = useT();
  const unlockWithPin = useWallet((s) => s.unlockWithPin);
  const unlockWithBiometrics = useWallet((s) => s.unlockWithBiometrics);
  const healBiometric = useWallet((s) => s.healBiometric);
  const wipeForgottenCode = useWallet((s) => s.wipeForgottenCode);
  const failedAttempts = useWallet((s) => s.failedAttempts);
  const lastFailedAt = useWallet((s) => s.lastFailedAt);
  const biometricEnabled = useSettings((s) => s.biometricEnabled);
  const profileName = useSettings((s) => s.profileName);
  const pinLength = useSettings((s) => s.pinLength);
  const setPinLength = useSettings((s) => s.setPinLength);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [errSignal, setErrSignal] = useState(0);
  /*
   * ISSUE DE SECOURS. Code oublié = portefeuilles inaccessibles pour toujours,
   * et sur iOS le trousseau survit même à la désinstallation : l'écran de code
   * revenait sans fin. `reinstall` : proposé UNE fois après une réinstallation
   * détectée ; `wipe` : la confirmation (maintien) avant d'effacer.
   */
  const [rescue, setRescue] = useState<'reinstall' | 'wipe' | null>(null);
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const screenOp = useRef(new Animated.Value(1)).current;

  /*
   * Horloge de l'écran : le verrou se calculait au rendu seulement, et rien ne
   * rendait l'écran de nouveau — le décompte restait figé et le clavier
   * désactivé après la fin de l'attente. Tic chaque seconde tant qu'il y a
   * une attente.
   */
  const [, setNow] = useState(() => Date.now());
  // Même règle que le portefeuille (horloge du téléphone ET chronomètre interne) ; le tic de `setNow` fait seulement retourner le décompte.
  const lockedMs = pinLockRemainingMs();
  const locked = lockedMs > 0;
  /*
   * iOS : le trousseau survit à la désinstallation (lib/installMarker). Jamais
   * d'effacement automatique (un AsyncStorage vidé pour une autre raison
   * détruirait l'unique copie d'un coffre) : on DEMANDE, une fois — garder
   * (code connu) ou effacer et restaurer avec la phrase.
   */
  useEffect(() => {
    detectReinstall()
      .then((reinstalled) => {
        if (!reinstalled) return;
        recordTechnicalLog('WALLET', 'Réinstallation iOS probable : portefeuilles retrouvés dans le trousseau, données locales absentes');
        setRescue('reinstall');
      })
      .catch(() => {});
  }, []);

  // « Garder » ou feuille fermée : la question ne revient plus (proposée une fois).
  const keepWallets = useCallback(() => {
    setRescue(null);
    void acknowledgeReinstall();
  }, []);

  /*
   * Effacement SANS déverrouillage, même bloqué par les essais : c'est l'issue
   * quand le code est perdu. Il ne lit rien — il détruit (walletStore,
   * `wipeForgottenCode`) — et l'écran dit la même chose quoi qu'il y ait derrière.
   */
  const wipeEverything = useCallback(async () => {
    if (wiping) return;
    setWiping(true);
    setWipeError(null);
    try {
      await wipeForgottenCode();
      await acknowledgeReinstall();
      setRescue(null);
      router.replace('/welcome');
    } catch (e) {
      console.warn('[KALYX-UNLOCK] forgotten-code:wipe-failed', { error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' });
      setWipeError(t('forgotCodeWipeFailed'));
      setWiping(false);
    }
  }, [wiping, wipeForgottenCode, t]);

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked]);
  // Nouvel échec enregistré : l'horloge repart de maintenant.
  useEffect(() => setNow(Date.now()), [failedAttempts, lastFailedAt]);
  const known = pinLength >= 6 ? pinLength : undefined; // option 3 si connue
  const complete = known ? pin.length === known : pin.length >= 6;

  // Déverrouillage fluide : léger fondu de sortie avant de basculer sur l'accueil.
  const goHome = useCallback(() => {
    Animated.timing(screenOp, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
      // Retour de Google pendant que l'app était verrouillée : on rouvre l'écran de sauvegarde.
      const back = useDriveFlow.getState().returnTo;
      if (back) {
        useDriveFlow.getState().setReturnTo(null);
        resetToHome();
        router.push(back);
        // Rejouée ici aussi : un lien de paiement est une action que
        // l'utilisateur vient de faire, elle passe devant la reprise du flux
        // Drive. La laisser en attente la ferait surgir au déverrouillage
        // SUIVANT, hors de tout contexte.
        flushPendingIntent();
        return;
      }
      resetToHome();
      // Lien de paiement reçu pendant que l'app était verrouillée : c'est la
      // raison pour laquelle l'utilisateur vient de déverrouiller.
      flushPendingIntent();
    });
  }, [screenOp, resetToHome]);

  // UNE seule demande d'empreinte : la lecture du coffre biométrique
  // (SecureStore requireAuthentication) EST déjà le prompt de l'OS. On
  // n'appelle donc PAS authenticate() en plus (c'était la double empreinte).
  const tryBiometrics = useCallback(
    async (manual = false) => {
      try {
        await unlockWithBiometrics();
        goHome();
      } catch (e) {
        // Refus/annulation → silencieux (l'utilisateur saisit son PIN).
        // Au TAP manuel, on affiche la cause — sans alarmer quand elle se répare d'elle-même.
        const msg = e instanceof Error ? e.message : '';
        const code = isWalletError(e) ? e.code : null;
        console.warn('[KALYX-UNLOCK] biometrics:failed', { manual, code, msg });
        /*
         * Verrouillage SYSTÈME (trop d'échecs Face ID / Touch ID) : le trousseau
         * le rend comme une annulation, et le bouton ne faisait plus rien, sans
         * un mot. Sondé sans invite ; dit aussi au lancement, sinon on le cherche.
         */
        if (code === 'BIOMETRIC_REFUSED' && (await isBiometricLockedOut())) {
          setError(t('bioLockedOut'));
          return;
        }
        if (manual && code !== 'BIOMETRIC_REFUSED' && !/refus|annul|cancel/i.test(msg)) {
          /*
           * Jamais le message brut (souvent anglais, technique) : une erreur connue
           * est traduite par son code. Entrée biométrique absente, invalidée
           * (empreinte ajoutée) ou dépassée (code changé) : ce n'est PAS « biométrie
           * non activée » — un déverrouillage par code la rétablit (healBiometric).
           */
          setError(code === 'BIOMETRIC_NOT_SET' ? t('bioUsePinOnce') : isWalletError(e) ? friendlyTxError(e, t as never) : t('bioUnavailable'));
        }
      }
    },
    [unlockWithBiometrics, goHome, t],
  );

  useEffect(() => {
    (async () => {
      const ok = biometricEnabled && (await isBiometricAvailable());
      setBioAvailable(ok);
      if (ok) tryBiometrics();
    })();
  }, [biometricEnabled, tryBiometrics]);

  const submit = useCallback(
    async (code: string) => {
      if (code.length < 6) return;
      setBusy(true);
      setError(null);
      try {
        await unlockWithPin(code);
        setPinLength(code.length); // mémorise la longueur (option 3 au prochain coup)
        // Biométrie activée : PIN biométrique réécrit s'il manque (ancien schéma par
        // portefeuille, clé invalidée, code changé) — seul moment où l'on a le code.
        if (biometricEnabled) void healBiometric(code).catch(() => {});
        goHome();
      } catch (e) {
        // Traduit par code : le message du coffre est en français, et un PIN faux doit se lire dans la langue choisie.
        setError(isWalletError(e) ? friendlyTxError(e, t) : t('incorrectCode'));
        setPin('');
        setErrSignal((n) => n + 1); // secousse + vibration
        setBusy(false);
      }
    },
    [unlockWithPin, setPinLength, goHome, biometricEnabled, healBiometric, t],
  );

  const onChange = (v: string) => {
    if (busy || locked) return;
    setError(null);
    setPin(v);
  };

  const title = profileName ? `${t('welcomeBack')}, ${profileName}` : t('unlockKalyx');
  const subtitle = locked
    ? t('tooManyAttempts').replace('{n}', String(Math.ceil(lockedMs / 1000)))
    : error ?? t('enterCodeToContinue');

  return (
    <Animated.View style={{ flex: 1, backgroundColor: colors.bg, opacity: screenOp }}>
      {/* Plein écran : pas de barre d'en-tête vide. */}
      {/* Écran de verrouillage : aucun balayage iOS ne doit le contourner. */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      {/* `gradients.screen` rend une couleur unie (flat()) : une View suffit,
          et le §2.2 ne tolère aucun dégradé décoratif. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      {/*
        L'AURA vit ici (docs/08 §3.4). C'était le trou laissé par l'étape 1 :
        walletStore émet bien l'impulsion d'Ouverture au déverrouillage réussi,
        mais aucun halo n'était monté sur cet écran, donc le moteur l'abandonnait
        — correctement, mais l'utilisateur ne voyait rien. Le halo est derrière
        l'anneau : au succès, il s'ouvre depuis le centre, juste avant le fondu
        vers l'accueil. Pour la biométrie, la fenêtre appartient au système et ne
        peut pas être animée : la continuité se joue au timing (§3.5).
      */}
      <Stardust width={winW} height={winH} count={14} />
      <Orbit cx={winW / 2} cy={insets.top + 120 + 160} r={132} />
      <Halo size={320} mood="flat" aura style={{ position: 'absolute', alignSelf: 'center', top: insets.top + 120 }} />
      <View style={{ flex: 1, paddingTop: insets.top + spacing(3), paddingBottom: insets.bottom + spacing(2), paddingHorizontal: spacing(3), alignItems: 'center' }}>
        {/* En-tête compact : titre, sous-titre, biométrie */}
        <Rise style={{ alignItems: 'center', gap: spacing(1.25) }}>
          <Text style={{ color: colors.text, fontSize: fontSize.xxl, fontFamily: fonts.bold, textAlign: 'center' }}>{title}</Text>
          <Text style={{ color: error && !locked ? colors.danger : colors.textSecondary, fontSize: fontSize.md, textAlign: 'center' }}>{subtitle}</Text>
          {/*
            Le retour d'appui était un changement d'OPACITÉ (0.6), ce que le
            §3.2 interdit explicitement : c'est le scale qui dit « touché ».
          */}
          {bioAvailable ? (
            <KPressable
              onPress={() => tryBiometrics(true)}
              disabled={busy || locked}
              accessibilityLabel={t('biometrics')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(0.5), paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.round, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}
            >
              <Icon name="security" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontFamily: fonts.semibold }}>{t('biometrics')}</Text>
            </KPressable>
          ) : null}
        </Rise>

        {/* Espace flexible : pousse le clavier vers le bas sans l'étirer */}
        <View style={{ flex: 1, minHeight: spacing(2) }} />

        {/* Ronds + clavier + validation, groupés en bas */}
        <View style={{ alignItems: 'center', gap: spacing(2) }}>
          <PinPad
            value={pin}
            onChange={onChange}
            disabled={busy || locked}
            errorSignal={errSignal}
            expectedLength={known}
            onComplete={submit}
          />
          {/* Bouton visible uniquement quand le PIN est complet (auto-validation
              en mode longueur connue ; ici c'est le filet de sécurité). */}
          <View style={{ height: 24, justifyContent: 'center' }}>
            {complete ? (
              <KPressable onPress={() => submit(pin)} disabled={busy || locked} hitSlop={8} haptic="light" accessibilityLabel={t('unlockBtn')}>
                <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontFamily: fonts.semibold }}>
                  {busy ? t('verifying') : t('unlockBtn')}
                </Text>
              </KPressable>
            ) : null}
          </View>
          {/* Toujours offert, même bloqué : c'est l'issue quand le code est perdu. */}
          <KPressable onPress={() => { setWipeError(null); setRescue('wipe'); }} disabled={busy} hitSlop={8} haptic="light" accessibilityRole="button">
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, fontFamily: fonts.medium }}>{t('forgotCode')}</Text>
          </KPressable>
        </View>
      </View>

      <Sheet visible={rescue === 'reinstall'} onClose={keepWallets} showWhenLocked>
        <Text style={{ color: colors.text, fontSize: fontSize.lg, fontFamily: fonts.bold }}>{t('reinstallFoundTitle')}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.base }}>{t('reinstallFoundBody')}</Text>
        <Button label={t('reinstallKeep')} onPress={keepWallets} />
        <Button label={t('reinstallWipe')} variant="outline" onPress={() => { setWipeError(null); setRescue('wipe'); }} />
      </Sheet>

      {/* Pas de fermeture au fond pendant l'effacement : il irait au bout sans écran pour le dire. */}
      <Sheet visible={rescue === 'wipe'} onClose={() => setRescue(null)} dismissable={!wiping} showWhenLocked>
        <Text style={{ color: colors.text, fontSize: fontSize.lg, fontFamily: fonts.bold }}>{t('forgotCodeTitle')}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.base }}>{t('forgotCodeBody')}</Text>
        {wipeError ? <Text style={{ color: colors.danger, fontSize: fontSize.sm, fontFamily: fonts.medium }}>{wipeError}</Text> : null}
        {/* Maintien long (niveau Danger) plutôt qu'un appui : un geste qu'on ne fait pas par mégarde. */}
        <HoldButton label={wiping ? t('forgotCodeWiping') : t('forgotCodeHold')} danger icon="reset" disabled={wiping} onComplete={() => void wipeEverything()} />
        <Button label={t('cancel')} variant="ghost" disabled={wiping} onPress={() => setRescue(null)} />
      </Sheet>
    </Animated.View>
  );
}
