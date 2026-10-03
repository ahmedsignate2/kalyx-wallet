import { ScreenHeader, SENSITIVE_INPUT_PROPS, Pressable as KPressable, Text as KText } from '../ui/kit';
import { PinPromptModal } from '../ui/PinPromptModal';
import { IconDisc, Orbit, Pills, Rise, SectionLabel } from '../ui/nova';
import { fill } from '../lib/i18n';
import { useNoScreenCapture } from '../lib/useNoScreenCapture';
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { Card, Button, Title, Muted } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';
import { useWallet, phraseKindForImport } from '../lib/walletStore';
import { useT, useSettings } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import { toast } from '../lib/toast';
import {
  isWalletError,
  restoreBackup,
  type BackupError,
  parseImportedKey,
  addressFromRawKey,
  chainNameOf,
  listChains,
  groupAddress,
  type KeyFamily,
  type KeyParseError,
  unknownWords,
  type BackupWallet,
} from '../src';
import { isDriveConfigured } from '../lib/googleDrive';
import { KeyboardAvoid } from '../ui/KeyboardAvoid';

type Mode = 'phrase' | 'key' | 'backup';

export default function ImportWallet() {
  // Phrase, clé ou mot de passe saisis ici : aucune capture d'écran.
  useNoScreenCapture('import-wallet');
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const importWallet = useWallet((s) => s.importWallet);
  const importWallets = useWallet((s) => s.importWallets);

  /** Message d'un échec de sauvegarde, depuis son code. */
  const backupErrorText = (code: BackupError) => {
    switch (code) {
      case 'UNREADABLE':
        return t('backupErrUnreadable');
      case 'NOT_A_BACKUP':
        return t('backupErrNotBackup');
      case 'TOO_RECENT':
        return t('backupErrTooRecent');
      case 'WRONG_PASSWORD':
        return t('backupErrWrongPassword');
      default:
        return t('backupErrCorrupted');
    }
  };
  const importPrivateKey = useWallet((s) => s.importPrivateKey);
  const [mode, setMode] = useState<Mode>('phrase');
  const [text, setText] = useState('');
  const [pwd, setPwd] = useState(''); // mot de passe de sauvegarde (mode backup)
  const [label, setLabel] = useState('');
  const pinLength = useSettings((st) => st.pinLength);
  /** Fenêtre PIN ouverte : tout a été vérifié, il ne reste qu'à chiffrer. */
  const [askPin, setAskPin] = useState(false);
  const [pinError, setPinError] = useState(0);
  /** Sauvegarde déjà déchiffrée (avant le PIN), prête à importer. */
  const [restored, setRestored] = useState<BackupWallet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Famille retenue quand la clé collée peut servir plusieurs réseaux. */
  const [family, setFamily] = useState<KeyFamily | null>(null);

  /*
   * ANALYSE À LA FRAPPE, et pas seulement au moment d'importer.
   *
   * L'import n'acceptait qu'une clé EVM en hexadécimal et répondait « clé privée
   * invalide » à tout le reste — un WIF Bitcoin, un export Phantom. On analyse
   * donc en direct et on MONTRE ce qu'on a reconnu, ainsi que l'adresse dérivée :
   * c'est le seul garde-fou qui vaille, puisqu'une clé valide peut désigner une
   * adresse que l'utilisateur ne reconnaît pas.
   */
  const parsed = useMemo(() => (mode === 'key' && text.trim() ? parseImportedKey(text) : null), [mode, text]);
  const candidates = parsed?.ok ? parsed.key.families : [];
  /*
   * Le choix ne vaut que s'il s'applique à la clé ACTUELLE : choisi pour une
   * clé hex puis gardé pour un WIF collé ensuite, il importait le WIF comme
   * graine Solana — une adresse qui ne détient pas les fonds.
   */
  const chosen: KeyFamily | null =
    family && candidates.includes(family) ? family : candidates.length === 1 ? candidates[0] : null;
  const derived = useMemo(() => {
    if (!parsed?.ok || !chosen) return null;
    try {
      return addressFromRawKey(chosen, parsed.key.secret);
    } catch {
      return null;
    }
  }, [parsed, chosen]);

  /** Nom du premier réseau d'une famille, pour étiqueter le choix. */
  const familyLabel = (f: KeyFamily) =>
    chainNameOf(listChains({ includeTestnets: false }).find((c) => c.family === f)?.id ?? '') ?? f;

  /** Message d'un refus d'analyse, depuis son code. */
  const parseErrorText = (code: KeyParseError) => {
    switch (code) {
      case 'OUT_OF_RANGE':
        return t('keyErrOutOfRange');
      case 'BAD_CHECKSUM':
        return t('keyErrChecksum');
      case 'BAD_WIF_VERSION':
        return t('keyErrWifVersion');
      case 'SOLANA_MISMATCH':
        return t('keyErrSolanaMismatch');
      default:
        return t('keyErrUnrecognised');
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setRestored(null);
    setError(null);
    setText('');
    setPwd('');
    setFamily(null);
  };

  /*
   * VÉRIFIER D'ABORD, DEMANDER LE CODE ENSUITE. Le code se tapait dans un
   * champ texte avec le reste ; il se tape désormais sur le pavé Kalyx, et
   * seulement quand tout le reste est valable — un code saisi pour rien, suivi
   * de « phrase invalide », est une frustration évitable.
   */
  const onContinue = async () => {
    setError(null);
    if (mode === 'phrase') {
      /*
        Même règle que le magasin : une phrase Tonkeeper est RECONNUE — elle
        s'ouvre si un réseau TON est configuré, sinon un message l'explique au
        lieu de « phrase invalide ».
      */
      try {
        phraseKindForImport(text);
      } catch (e) {
        setError(isWalletError(e) && e.code === 'INVALID_MNEMONIC' ? t('invalidPhraseSimple') : friendlyTxError(e, t as never));
        return;
      }
    } else if (mode === 'key') {
      if (!parsed) { setError(t('keyErrUnrecognised')); return; }
      if (!parsed.ok) { setError(parseErrorText(parsed.error)); return; }
      // Plusieurs réseaux possibles et aucun choisi : on ne devine pas.
      if (!chosen) { setError(t('keyErrFamilyRequired')); return; }
    } else {
      /*
        Sauvegarde chiffrée : déchiffrée AVANT le code, pour qu'un mauvais mot
        de passe se dise tout de suite. Elle importe ensuite TOUS les
        portefeuilles qu'elle contient — elle n'en restaurait qu'un, sans rien
        signaler.
      */
      setBusy(true);
      try {
        const r = await restoreBackup(text, pwd);
        if (r.error || !r.wallets?.length) {
          setError(r.error ? backupErrorText(r.error) : t('invalidBackup'));
          return;
        }
        setRestored(r.wallets);
      } finally {
        setBusy(false);
      }
    }
    setAskPin(true);
  };

  const runImport = async (pin: string) => {
    setBusy(true);
    try {
      if (mode === 'phrase') {
        await importWallet(text, pin, label); // lance aussi la recherche des comptes 2, 3… (magasin)
      } else if (mode === 'key') {
        if (!parsed?.ok || !chosen) return;
        await importPrivateKey(text, pin, label, chosen);
      } else {
        if (!restored) return;
        const added = await importWallets(restored, pin);
        toast.success(t('backupRestoredCount').replace('{count}', String(added)));
      }
      setAskPin(false);
      router.replace('/home');
    } catch (e) {
      // Seul un PIN faux fait secouer le pavé ; le reste est dit en clair, traduit.
      if (isWalletError(e) && e.code === 'WRONG_PIN') setPinError((n) => n + 1);
      else {
        setAskPin(false);
        setError(friendlyTxError(e, t as never));
      }
    } finally {
      setBusy(false);
    }
  };

  const words = mode === 'phrase' && text.trim() ? text.trim().split(/\s+/) : [];
  const bad = mode === 'phrase' ? unknownWords(text) : [];

  return (
    <KeyboardAvoid style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing(3),
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + spacing(4),
          gap: spacing(2),
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <ScreenHeader />
      {/* Héros : le disque « importer » dans son orbite, le titre, ce qui se passe. */}
      <View style={{ alignItems: 'center', gap: spacing(1.5), paddingBottom: spacing(1) }}>
        <View style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
          <View pointerEvents="none" style={{ position: 'absolute', left: 42, top: 42 }}><Orbit cx={0} cy={0} r={60} /></View>
          <IconDisc name="import" size={76} />
        </View>
        <Rise delay={80}><Text style={[typography.title, { textAlign: 'center' }]}>{t('importWalletT')}</Text></Rise>
        <Rise delay={150}><Text style={[typography.muted, { textAlign: 'center', maxWidth: 320 }]}>{t('walletsCohabit')}</Text></Rise>
      </View>

      {/* Sélecteur Phrase / Clé privée / Sauvegarde */}
      <Rise delay={200} style={{ alignItems: 'center' }}>
        <Pills<Mode>
          items={(['phrase', 'key', 'backup'] as Mode[]).map((m) => ({ key: m, label: m === 'phrase' ? t('tabPhrase') : m === 'key' ? t('privateKeyLabel') : t('backupTitle') }))}
          value={mode}
          onChange={switchMode}
        />
      </Rise>

      {mode === 'phrase' ? (
        <Muted>{t('phraseModeHint')}</Muted>
      ) : mode === 'key' ? (
        <Muted>{t('keyModeHint')}</Muted>
      ) : (
        <>
          <Muted>{t('backupModeHint')}</Muted>
          {isDriveConfigured() ? <Button label={t('driveRestore')} variant="ghost" onPress={() => router.push('/restore-drive')} /> : null}
        </>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{mode === 'phrase' ? t('recoveryPhrase') : mode === 'key' ? t('privateKeyLabel') : t('backupContent')}</Text>
          <KPressable
            onPress={async () => {
              const clip = (await Clipboard.getStringAsync()).trim();
              setText(clip);
              // Phrase ou clé privée : effacée du presse-papier dès qu'elle est dans le champ.
              if (clip) void Clipboard.setStringAsync('').catch(() => {});
            }}
          >
            <Text style={{ color: colors.primary, fontFamily: typography.bodyStrong.fontFamily }}>{t('paste')}</Text>
          </KPressable>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          /*
            Le repère de saisie annonce les TROIS formes acceptées : il ne
            montrait que « 0x… », donc rien ne laissait deviner qu'un WIF
            Bitcoin ou une clé Solana passaient. Et l'exemple de phrase était
            écrit en français en dur, alors que la clé existait déjà.
          */
          placeholder={mode === 'phrase' ? t('wordExamplePh') : mode === 'key' ? '0x… · 5Kd… · base58' : '{ "app": "kalyx", … }'}
          placeholderTextColor={colors.textSecondary}
          multiline={mode !== 'key'}
          // Phrase, clé privée ou sauvegarde chiffrée : tous des secrets (§7.3).
          {...SENSITIVE_INPUT_PROPS}
          secureTextEntry={mode === 'key'}
          style={{ minHeight: mode === 'key' ? 44 : 100, color: colors.text, fontSize: mode === 'backup' ? 12 : 16, textAlignVertical: 'top' }}
        />
      </Card>

      {/* Chaque mot tapé apparaît en pastille ; un mot hors liste BIP-39 est souligné en rouge. */}
      {words.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {words.map((w, i) => {
            const ok = !bad.includes(w.toLowerCase());
            return (
              <Rise key={`${w}-${i}`} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface2, borderBottomWidth: 2, borderBottomColor: ok ? 'transparent' : colors.danger }}>
                <KText variant="caption" tone={ok ? 'secondary' : 'danger'}>{i + 1}. {w}</KText>
              </Rise>
            );
          })}
        </View>
      ) : null}
      {bad.length > 0 ? <KText variant="caption" tone="danger">{bad.length === 1 ? fill(t('bip39BadOne'), { word: bad[0] }) : fill(t('bip39BadMany'), { count: String(bad.length) })}</KText> : null}

      {/*
        CE QU'ON A RECONNU, ET OÙ ÇA MÈNE. Une clé peut être parfaitement valide
        et désigner une adresse que l'utilisateur ne reconnaît pas — un secret
        pris pour la mauvaise famille, une graine confondue avec une clé
        complète. Montrer l'adresse laisse la vérification à celui qui sait.
      */}
      {mode === 'key' && parsed ? (
        <Card>
          {!parsed.ok ? (
            <Text style={{ color: colors.danger }}>{parseErrorText(parsed.error)}</Text>
          ) : (
            <>
              <Text style={typography.muted}>{t('keyRecognised')}</Text>
              {/*
                Plus d'une famille possible : 32 octets sur secp256k1 servent
                l'EVM et Bitcoin, et sont aussi une graine ed25519. Trois adresses
                pour un même secret — l'utilisateur seul sait laquelle il veut.
              */}
              {candidates.length > 1 ? (
                <>
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>{t('keyChooseNetwork')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(0.75), marginTop: spacing(0.5) }}>
                    {candidates.map((f) => {
                      const on = chosen === f;
                      return (
                        <KPressable
                          key={f}
                          onPress={() => setFamily(f)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={{ minHeight: 36, paddingHorizontal: spacing(1.25), justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }}
                        >
                          <Text style={{ color: on ? colors.onPrimary : colors.text, fontFamily: typography.bodyStrong.fontFamily, fontSize: 13 }}>
                            {familyLabel(f)}
                          </Text>
                        </KPressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
              {derived ? (
                <View style={{ marginTop: spacing(1.5) }}>
                  <Text style={typography.muted}>{t('keyDerivedAddress')}</Text>
                  <Text style={{ color: colors.text, fontSize: 13 }}>{groupAddress(derived)}</Text>
                  <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>{t('keyCheckAddress')}</Text>
                  {/*
                    WIF NON COMPRESSÉ : un AVERTISSEMENT, plus un refus. La clé
                    fonctionne et l'adresse dérivée est valide, mais le propriétaire
                    d'une telle clé détient souvent ses fonds sur l'adresse héritée
                    de la même clé — que Kalyx ne sait pas lire. Il faut le dire, pas
                    empêcher l'import.
                  */}
                  {chosen === 'bitcoin' && parsed.ok && parsed.key.compressed === false ? (
                    <Text style={{ color: colors.warning, fontSize: 12, marginTop: spacing(0.75) }}>
                      {t('keyErrWifUncompressed')}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {mode === 'backup' ? (
        <Card>
          <Text style={typography.muted}>{t('backupPassword')}</Text>
          <TextInput value={pwd} onChangeText={setPwd} placeholder={t('backupPasswordPlaceholder')} placeholderTextColor={colors.textSecondary} secureTextEntry autoCapitalize="none" style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
        </Card>
      ) : null}
      <Card>
        <Text style={typography.muted}>{t('nameOptional')}</Text>
        <TextInput value={label} onChangeText={setLabel} placeholder={t('namePlaceholderImport')} placeholderTextColor={colors.textSecondary} style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }} />
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <View style={{ height: spacing(1) }} />
      <Button label={busy ? t('importing') : t('importAction')} loading={busy} disabled={!text.trim() || bad.length > 0} onPress={onContinue} />
      </ScrollView>
      <PinPromptModal
        visible={askPin}
        title={t('appPin')}
        subtitle={t('enterAppPinEncrypt')}
        expectedLength={pinLength}
        busy={busy}
        errorSignal={pinError}
        onSubmit={runImport}
        onCancel={() => setAskPin(false)}
      />
    </KeyboardAvoid>
  );
}
