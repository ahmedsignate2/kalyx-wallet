/**
 * Sauvegarde chiffrée — un écran, quatre blocs :
 *   1. titre + une phrase ;
 *   2. formulaire (mot de passe + jauge, confirmation) ;
 *   3. statut réel (UNE carte : sauvegarde Drive présente / aucune sauvegarde cloud / fichier local) ;
 *   4. actions : « Sauvegarder sur Google Drive » (principal), « Exporter un fichier » (secondaire).
 *
 * La confirmation biométrique/PIN ne fait que révéler + chiffrer (rapide). L'envoi
 * Drive est confié au flux persistant `useDriveFlow` (lib/googleDrive.ts), qui
 * survit au retour de Google et au redémarrage de l'app.
 *
 * Bloc 5 — SYNCHRONISATION AUTOMATIQUE (lib/backupSync.ts). L'activation
 * réutilise le mot de passe du formulaire (même exigence de robustesse), ouvre
 * Google en accès hors ligne, PUIS demande le PIN (PinPromptModal) : le PIN
 * n'est donc jamais gardé en mémoire pendant l'aller-retour dans le navigateur.
 * Si l'app a été relancée par le retour de Google, le mot de passe saisi est
 * perdu (jamais persisté) : l'écran dit « Google est connecté, termine
 * l'activation » et redemande mot de passe puis PIN, sans repasser par Google.
 * Le flux manuel ci-dessus reste disponible tel quel.
 */
import { NovaHero, ScreenDunes } from '../ui/nova';
import { useNoScreenCapture } from '../lib/useNoScreenCapture';
import { passwordStrength, MIN_BACKUP_LEVEL } from '../src/security/passwordStrength';
import { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { shareBackupFile, purgeStaleBackupFiles } from '../lib/backupFile';
import { toast } from '../lib/toast';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Input, ScreenHeader, Divider, Card, Switch, Pressable as KPressable } from '../ui/kit';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius, radii } from '../ui/tokens';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { createWalletsBackup } from '../src';
import { useDriveFlow, isDriveConfigured, clearSyncAuthPending } from '../lib/googleDrive';
import { KeyboardAvoid } from '../ui/KeyboardAvoid';
import { PinPromptModal } from '../ui/PinPromptModal';
import { isWalletError } from '../src';
import type { ConflictInfo } from '../src/domain/backup/drive';
import {
  useBackupSync,
  startAutoSyncAuth,
  enableAutoSync,
  disableAutoSync,
  syncBackupNow,
  replaceRemoteOnConflict,
  dismissSyncConflict
} from '../lib/backupSync';
import { setupAutoSyncKeys } from '../lib/backupKeys';
import { isDecoySession } from '../lib/sessionMode';
import { useShallow } from 'zustand/react/shallow';

type Target = 'drive' | 'file';

export default function CloudBackupScreen() {
  // Phrase, clé ou mot de passe saisis ici : aucune capture d'écran.
  useNoScreenCapture('cloud-backup');
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const exportAllWallets = useWallet((s) => s.exportAllWallets);
  // Nombre de portefeuilles réellement emportés, pour le DIRE après coup.
  // Les adresses suivies n'ont pas de secret : elles ne partent pas dans la sauvegarde.
  // Les portefeuilles à clé privée y partent aussi (exportAllWallets) : l'écran ne les bloque plus.
  const walletCount = useWallet((s) => s.wallets.filter((w) => w.type !== 'watch').length);

  const language = useSettings((s) => s.language);
  const encryptedBackupAt = useSettings((s) => s.encryptedBackupAt);
  const driveBackupAt = useSettings((s) => s.driveBackupAt);
  const markEncryptedBackup = useSettings((s) => s.markEncryptedBackup);

  const flow = useDriveFlow(useShallow((s) => ({ canRetry: s.canRetry, checkResult: s.checkResult, confirmOverwrite: s.confirmOverwrite, conflict: s.conflict, error: s.error, kind: s.kind, reset: s.reset, retrySave: s.retrySave, start: s.start, status: s.status })));
  const driveOn = isDriveConfigured();

  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [target, setTarget] = useState<Target>('drive');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileDone, setFileDone] = useState(false);
  /** Sauvegarde chiffrée prête, à partager dès la fenêtre de confirmation fermée. */
  const [fileBlob, setFileBlob] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Fichier de sauvegarde resté en cache d'un export précédent (Android le garde exprès, cf. lib/backupFile).
  useEffect(() => {
    purgeStaleBackupFiles();
  }, []);

  // Un flux Drive terminé (succès ou erreur) est acquitté quand on quitte l'écran.
  // Quitter l'écran sur un conflit ou une erreur, c'est abandonner : reset() efface aussi le blob chiffré gardé.
  useEffect(() => () => {
    const { status } = useDriveFlow.getState();
    if (status === 'done' || status === 'error' || status === 'conflict') useDriveFlow.getState().reset();
  }, []);

  const strength = passwordStrength(pwd);
  const mismatch = confirm.length > 0 && pwd !== confirm;
  // Un mot de passe faible n'est plus accepté : c'est la seule protection du fichier.
  const canSubmit = strength.level >= MIN_BACKUP_LEVEL && confirm.length > 0 && !mismatch;

  const driveBusy = flow.kind === 'save' && (flow.status === 'auth' || flow.status === 'working');
  const driveDone = flow.kind === 'save' && flow.status === 'done';
  const driveError =
    flow.kind === 'save' && flow.status === 'error'
      ? flow.error === 'not_configured' ? t('driveNotConfigured')
        : flow.error === 'denied' || flow.error === 'timeout' ? t('driveCancelled')
        : flow.error === 'verify' ? t('driveVerifyFailed')
        : t('driveFailed')
      : null;
  // Coupure réseau : le blob chiffré est gardé, on réessaie sans redemander le mot de passe.
  const canRetry = flow.kind === 'save' && flow.status === 'error' && flow.canRetry;
  const conflict = flow.kind === 'save' && flow.status === 'conflict' ? flow.conflict : null;
  const checkBusy = flow.kind === 'check' && (flow.status === 'auth' || flow.status === 'working');
  const checkResult = flow.kind === 'check' && flow.status === 'done' ? flow.checkResult : undefined;

  const dateLabel = (iso: string) => new Date(iso).toLocaleString(language, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /*
    REMPLACER UNE SAUVEGARDE PLUS RICHE OU VENUE D'AILLEURS se demande. Un
    téléphone à un portefeuille écrasait sans un mot la sauvegarde à trois
    portefeuilles d'un autre ; on dit ce qu'il y a en ligne, et d'où ça vient.
  */
  const describeConflict = (c: ConflictInfo) =>
    (c.sameDevice ? t('driveConflictSame') : c.remoteCount === undefined ? t('driveConflictOtherNoCount') : t('driveConflictOther'))
      .replace('{count}', String(c.remoteCount ?? '?'))
      .replace('{local}', String(c.localCount))
      .replace('{date}', dateLabel(c.modifiedTime));
  const conflictText = conflict ? describeConflict(conflict) : null;

  /*
    CE QUE LA SAUVEGARDE EMPORTE, annoncé avant de la créer. Elle n'emportait
    qu'un portefeuille sans le dire ; annoncer le nombre est ce qui permet à
    l'utilisateur de repérer une sauvegarde incomplète.
  */
  const coversCount = savedCount ?? walletCount;
  // « tous tes portefeuilles : 1 » sonnait faux avec un seul.
  const coversLabel = coversCount === 1 ? t('backupCoversOne') : t('backupCovers').replace('{count}', String(coversCount));
  // Mot de passe long tapé à l'aveugle : on peut l'afficher pour le relire.
  const [showPwd, setShowPwd] = useState(false);

  const submit = (to: Target) => {
    setError(null);
    setFileDone(false);
    if (pwd.length < 8) { setError(t('pwdTooShort')); return; }
    if (pwd !== confirm) { setError(t('pwdMismatch')); return; }
    setTarget(to);
    setConfirming(true);
  };

  /*
    Révèle TOUS les portefeuilles (biométrie/PIN) et chiffre. LÈVE pour ConfirmUnlock.

    La sauvegarde n'emportait que la phrase du portefeuille ACTIF : trois
    portefeuilles créés, un seul sauvegardé — et la restauration réussissait, donc
    rien n'avertissait de la perte des deux autres. C'est le pire genre de
    sauvegarde, celle qui donne confiance et ne tient pas.
  */
  const perform = async (unlock: Unlock) => {
    const all = await exportAllWallets(unlock);
    const blob = await createWalletsBackup(all, pwd);
    setSavedCount(all.length);
    setPwd('');
    setConfirm('');
    if (target === 'drive') {
      void flow.start({ kind: 'save', blob });
      return;
    }
    /*
     * Partage lancé APRÈS la fermeture de la fenêtre de confirmation (effet
     * ci-dessous) : présentée par-dessus une modale qui se ferme, la feuille
     * de partage iOS disparaissait avec elle. Et `perform` n'attend pas le
     * partage : iOS ne rend parfois jamais la main (activité ouverte puis
     * annulée), ce qui figeait la confirmation.
     */
    setFileBlob(blob);
  };

  useEffect(() => {
    if (confirming || !fileBlob) return;
    const blob = fileBlob;
    // Le temps que la modale de confirmation finisse de se fermer (iOS refuse deux présentations simultanées).
    // L'état est vidé DANS le minuteur : vidé avant, le nouveau rendu annulait ce minuteur et le partage ne partait jamais.
    const timer = setTimeout(() => {
      setFileBlob(null);
      shareBackupFile(blob, t('backupShareTitle'))
        .then((r) => {
          /*
           * « Faite » seulement si une copie existe HORS de l'app. Fermer la
           * feuille, ou choisir « Copier » (presse-papiers, éphémère), n'en
           * crée aucune : l'annoncer donnerait une fausse confiance.
           */
          if (r !== 'shared') return;
          markEncryptedBackup('file');
          setFileDone(true);
        })
        .catch(() => toast.error(t('exportFailed')));
    }, 450);
    return () => clearTimeout(timer);
  }, [confirming, fileBlob, markEncryptedBackup, t]);

  // ── Statut réel : une seule carte, un seul état ──
  const driveDate = checkResult ?? driveBackupAt; // la vérification en ligne prime sur la mémoire locale
  const status: { tone: 'up' | 'secondary' | 'warning'; icon: 'check' | 'info' | 'warning'; text: string } = driveDone
    ? { tone: 'up', icon: 'check', text: t('driveSaved') }
    : checkResult === null
      ? { tone: 'warning', icon: 'warning', text: t('driveNone') }
      : driveDate
        ? { tone: 'up', icon: 'check', text: `${t('backupLastDrive')} ${dateLabel(driveDate)}` }
        : encryptedBackupAt
          ? { tone: 'secondary', icon: 'info', text: `${t('backupLastFile')} ${dateLabel(encryptedBackupAt)}` }
          : { tone: 'secondary', icon: 'info', text: t('backupNoneCloud') };

  const bar = [1, 2, 3].map((i) => (
    <View
      key={i}
      style={{ flex: 1, height: 4, borderRadius: radii.full, backgroundColor: strength.level >= i ? (strength.level === 1 ? colors.danger : strength.level === 2 ? colors.warning : colors.up) : colors.surface3 }}
    />
  ));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenDunes />
      <KeyboardAvoid style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SCREEN_MARGIN, paddingTop: insets.top + space[3], paddingBottom: insets.bottom + space[8], gap: space[5] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Héros + ce que la sauvegarde emporte */}
          <View style={{ gap: space[2] }}>
            <ScreenHeader />
            <NovaHero icon="share" tone="gold" title={t('encBackup')} subtitle={t('backupOneLiner')} />
            {/*
              COMBIEN de portefeuilles la sauvegarde emporte. Elle n'en prenait
              qu'un sans le dire ; annoncer le nombre est ce qui permet de repérer
              une sauvegarde incomplète avant d'avoir besoin d'elle.
            */}
            <View style={{ alignSelf: 'center', paddingHorizontal: 14, height: 32, borderRadius: radii.full, justifyContent: 'center', backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
              <Text variant="caption" tone="secondary">{coversLabel}</Text>
            </View>
          </View>

          {/* 2. Formulaire */}
          <Card style={{ gap: space[4], borderRadius: radii.xl }}>
            <View style={{ gap: space[2] }}>
              <Input
                label={t('backupPassword')}
                value={pwd}
                onChangeText={(v) => { setPwd(v); setError(null); }}
                placeholder={t('pwdPlaceholderShort')}
                secureTextEntry={!showPwd}
                right={<KPressable onPress={() => setShowPwd((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t(showPwd ? 'hidePassword' : 'showPassword')}><Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} color={colors.textSecondary} /></KPressable>}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />
              <View style={{ flexDirection: 'row', gap: space[1], alignItems: 'center' }}>{bar}</View>
              {pwd.length > 0 ? (
                <Text variant="caption" tone={strength.level >= 3 ? 'up' : strength.level === 2 ? 'warning' : 'danger'}>
                  {strength.level < MIN_BACKUP_LEVEL ? `${t(strength.key)} · ${t('pwdRuleHint')}` : t(strength.key)}
                </Text>
              ) : null}
            </View>
            <Input
              label={t('confirmPassword')}
              value={confirm}
              onChangeText={(v) => { setConfirm(v); setError(null); }}
              placeholder={t('repeatPassword')}
              secureTextEntry={!showPwd}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              error={mismatch ? t('pwdMismatch') : null}
            />
            {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
          </Card>

          {/* 3. Statut réel */}
          <Card style={{ gap: space[3], borderRadius: radii.xl }}>
            {driveBusy ? (
              <View style={{ gap: space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                  <ActivityIndicator color={colors.text} />
                  <Text tone="secondary" style={{ flex: 1 }}>{flow.status === 'auth' ? t('driveConnect') : t('driveSaving')}</Text>
                </View>
                {/* Revenu de Google sans finir : abandonner efface la session et le blob chiffré en attente. */}
                {flow.status === 'auth' ? <Button label={t('cancel')} variant="ghost" onPress={flow.reset} /> : null}
              </View>
            ) : conflict ? (
              <View style={{ gap: space[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
                  <Icon name="warning" size={18} color={colors.warning} />
                  <Text style={{ flex: 1 }}>{conflictText}</Text>
                </View>
                <Button label={t('driveReplace')} variant="secondary" onPress={() => void flow.confirmOverwrite()} />
                <Button label={t('cancel')} variant="ghost" onPress={flow.reset} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={status.icon} size={18} color={status.tone === 'up' ? colors.up : status.tone === 'warning' ? colors.warning : colors.textSecondary} />
                </View>
                <Text tone={status.tone === 'secondary' ? 'secondary' : status.tone} style={{ flex: 1 }}>{status.text}</Text>
              </View>
            )}
            {driveError ? <Text variant="caption" tone="danger">{driveError}</Text> : null}
            {canRetry ? <Button label={t('driveTryAgain')} variant="secondary" onPress={() => void flow.retrySave()} /> : null}
            {fileDone ? <Text variant="caption" tone="up">{t('backupCreated')}</Text> : null}
            {driveOn && !driveBusy && !conflict ? (
              <>
                <Divider />
                <Button label={checkBusy ? t('driveSearching') : t('driveCheck')} variant="ghost" onPress={() => flow.start({ kind: 'check' })} disabled={checkBusy} />
              </>
            ) : null}
          </Card>

          {/* 4. Actions */}
          <View style={{ gap: space[3] }}>
            {driveOn ? (
              <Button label={t('driveSave')} onPress={() => submit('drive')} disabled={!canSubmit || driveBusy || !!conflict} />
            ) : null}
            <Button label={t('exportLocalFile')} variant={driveOn ? 'secondary' : 'primary'} onPress={() => submit('file')} disabled={!canSubmit} />
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t('restoreHint')}</Text>
          </View>

          {/* 5. Synchronisation automatique */}
          {driveOn && !isDecoySession() ? (
            <AutoSyncSection
              password={pwd}
              passwordOk={canSubmit}
              onActivated={() => { setPwd(''); setConfirm(''); }}
              describeConflict={describeConflict}
              dateLabel={dateLabel}
            />
          ) : null}
        </ScrollView>

        <ConfirmUnlock
          visible={confirming}
          title={t('backupThePhrase')}
          subtitle={t('confirmIdentityEncrypt')}
          perform={perform}
          onDone={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
        />
      </KeyboardAvoid>
    </>
  );
}

/*
 * Synchronisation automatique. Ne connaît aucun secret au-delà de l'instant de
 * l'activation : le mot de passe vient du formulaire, le PIN de la feuille, et
 * les deux partent aussitôt dans setupAutoSyncKeys (lib/backupKeys.ts).
 */
function AutoSyncSection({
  password,
  passwordOk,
  onActivated,
  describeConflict,
  dateLabel,
}: {
  password: string;
  passwordOk: boolean;
  onActivated: () => void;
  describeConflict: (c: ConflictInfo) => string;
  dateLabel: (iso: string) => string;
}) {
  const { colors } = useTheme();
  const t = useT();
  const sync = useBackupSync();
  const flow = useDriveFlow(useShallow((s) => ({ error: s.error, kind: s.kind, status: s.status })));
  const pinLength = useSettings((s) => s.pinLength);

  /** L'utilisateur a demandé l'activation DEPUIS cet écran (mot de passe en main). */
  const [wanted, setWanted] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const authBusy = flow.kind === 'sync' && (flow.status === 'auth' || flow.status === 'working');
  const authError = flow.kind === 'sync' && flow.status === 'error' ? flow.error : null;

  // Retour de Google réussi (refresh_token rangé) : place au PIN.
  useEffect(() => {
    if (wanted && sync.authorized && !sync.enabled && !askPin) setAskPin(true);
  }, [wanted, sync.authorized, sync.enabled, askPin]);

  // Reconnexion d'une synchro active : l'autorisation n'est pas « à terminer », elle n'est pas orpheline.
  useEffect(() => {
    if (sync.enabled && sync.authorized) void clearSyncAuthPending();
  }, [sync.enabled, sync.authorized]);

  // Retour de Google en échec (refus, pas de refresh_token) : la synchro reste désactivée.
  useEffect(() => {
    if (authError) setWanted(false);
  }, [authError]);

  const begin = () => {
    setHint(null);
    // Même exigence que la sauvegarde manuelle : c'est la seule protection du fichier en ligne.
    if (!passwordOk) {
      setHint(t('autoSyncNeedPassword'));
      return;
    }
    setWanted(true);
    // Déjà autorisé (app relancée par le retour de Google, ou réactivation) : pas de second passage chez Google.
    if (sync.authorized) setAskPin(true);
    else void startAutoSyncAuth();
  };

  /*
   * Activation abandonnée après le retour de Google (PIN annulé, clés non
   * préparées) : le refresh_token ne doit pas rester orphelin dans le
   * trousseau. disableAutoSync le révoque et le purge (et efface les clés via
   * les crochets). Jamais quand la synchro tourne déjà (réactivation).
   */
  const abandon = () => {
    setAskPin(false);
    setWanted(false);
    if (!sync.enabled) {
      setBusy(true);
      void disableAutoSync().then(clearSyncAuthPending).finally(() => setBusy(false));
    }
  };

  const finish = async (pin: string) => {
    setPinBusy(true);
    try {
      await setupAutoSyncKeys(password, pin);
    } catch (e) {
      setPinBusy(false);
      if (isWalletError(e) && (e.code === 'WRONG_PIN' || e.code === 'INVALID_PIN')) {
        setPinError((n) => n + 1);
        return;
      }
      abandon();
      setHint(t('driveFailed'));
      return;
    }
    setAskPin(false);
    setPinBusy(false);
    setWanted(false);
    onActivated();
    try {
      await enableAutoSync(); // premier envoi compris ; son issue s'affiche dans le statut
      await clearSyncAuthPending(); // activation aboutie : le refresh_token n'est plus orphelin
    } catch {
      // Plus de refresh_token entre-temps : rien ne doit rester activé à moitié (les crochets effacent les clés).
      await disableAutoSync();
      setHint(t('autoSyncNoRefresh'));
    }
  };

  const toggle = (on: boolean) => {
    if (on) {
      begin();
      return;
    }
    setBusy(true);
    setWanted(false);
    void disableAutoSync().finally(() => setBusy(false));
  };

  const errorText = (code: string | null) =>
    code === 'verify' ? t('driveVerifyFailed')
      : code === 'RESEAL_REQUIRED' ? t('autoSyncReseal')
      : t('autoSyncError');

  // Statut en une ligne (rien de sensible : état, date, code d'erreur).
  let line: { tone: 'up' | 'secondary' | 'warning' | 'danger'; text: string } | null = null;
  if (sync.enabled) {
    if (sync.status === 'syncing') line = { tone: 'secondary', text: t('autoSyncSyncing') };
    else if (sync.status === 'pending') line = { tone: 'secondary', text: t('autoSyncPending') };
    else if (sync.status === 'reconnect') line = { tone: 'warning', text: t('autoSyncReconnect') };
    else if (sync.status === 'error') line = { tone: 'danger', text: errorText(sync.error) };
    else if (sync.lastSyncAt) line = { tone: 'up', text: t('autoSyncOk').replace('{date}', dateLabel(sync.lastSyncAt)) };
  } else if (sync.authorized && !wanted) {
    // Autorisation obtenue mais activation interrompue (redémarrage) : on la termine ici.
    line = { tone: 'warning', text: t('autoSyncFinish') };
  }

  const switchOn = sync.enabled || wanted || authBusy;

  return (
    <Card style={{ gap: space[3], borderRadius: radii.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" style={{ fontWeight: '600' }}>{t('autoSyncTitle')}</Text>
          <Text variant="caption" tone="secondary">{t('autoSyncExplain')}</Text>
        </View>
        {authBusy || busy || sync.status === 'syncing' ? <ActivityIndicator color={colors.text} /> : null}
        <Switch value={switchOn} onValueChange={toggle} disabled={busy || authBusy || pinBusy} />
      </View>

      {authBusy ? <Text variant="caption" tone="secondary">{t('driveConnect')}</Text> : null}
      {authError ? (
        <Text variant="caption" tone="danger">
          {authError === 'no_refresh_token' ? t('autoSyncNoRefresh') : authError === 'not_configured' ? t('driveNotConfigured') : t('driveCancelled')}
        </Text>
      ) : null}
      {hint ? <Text variant="caption" tone="danger">{hint}</Text> : null}

      {sync.enabled && sync.status === 'conflict' && sync.conflict ? (
        // Même décision que le flux manuel : jamais d'écrasement sans l'accord de l'utilisateur.
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
            <Icon name="warning" size={18} color={colors.warning} />
            <Text style={{ flex: 1 }}>{describeConflict(sync.conflict)}</Text>
          </View>
          <Button label={t('driveReplace')} variant="secondary" onPress={() => void replaceRemoteOnConflict()} />
          <Button label={t('cancel')} variant="ghost" onPress={dismissSyncConflict} />
        </View>
      ) : line ? (
        <Text variant="caption" tone={line.tone}>{line.text}</Text>
      ) : null}

      {sync.enabled && sync.status === 'reconnect' ? (
        // Bouton explicite : le navigateur ne s'ouvre jamais tout seul.
        <Button label={t('autoSyncReconnectBtn')} variant="secondary" onPress={() => void startAutoSyncAuth()} disabled={authBusy} />
      ) : null}
      {sync.enabled && sync.status === 'error' && sync.error === 'RESEAL_REQUIRED' ? (
        <Button label={t('autoSyncReactivate')} variant="secondary" onPress={begin} disabled={pinBusy} />
      ) : null}
      {sync.enabled && (sync.status === 'error' || sync.status === 'pending' || sync.status === 'ok') && sync.error !== 'RESEAL_REQUIRED' ? (
        <Button label={t('autoSyncNow')} variant="ghost" onPress={() => void syncBackupNow()} />
      ) : null}
      {!sync.enabled && sync.authorized && !wanted ? (
        <>
          <Button label={t('autoSyncFinishBtn')} variant="secondary" onPress={begin} disabled={busy} />
          {/* Renoncer : révoque et purge l'autorisation Google obtenue. */}
          <Button label={t('cancel')} variant="ghost" onPress={abandon} disabled={busy} />
        </>
      ) : null}

      <PinPromptModal
        visible={askPin}
        title={t('appPin')}
        subtitle={t('autoSyncPinSub')}
        expectedLength={pinLength}
        busy={pinBusy}
        errorSignal={pinError}
        onSubmit={(pin) => void finish(pin)}
        onCancel={abandon}
      />
    </Card>
  );
}
