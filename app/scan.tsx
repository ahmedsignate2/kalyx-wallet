/**
 * Scanner QR premium.
 *
 * Sécurité : le contenu scanné n'est JAMAIS exécuté directement. On l'analyse
 * (parseQr), on AFFICHE toujours ce qui a été lu, puis on agit seulement après
 * confirmation explicite. Adresses/URIs → écran Envoyer prérempli ; wc: → flow
 * WalletConnect ; URL → navigateur dApps (avec avertissement) ; sinon erreur.
 *
 * Le module caméra natif n'est actif qu'après un rebuild EAS : sans lui, on
 * bascule sur un repli « coller depuis le presse-papiers » (aucun crash).
 */
import { ScreenHeader } from '../ui/kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { toast } from '../lib/toast';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { useWalletConnect } from '../lib/walletconnect';
import {
  parseQr,
  describeQr,
  qrTargetFamily,
  kalyxChainIdForEvm,
  getAdapter,
  listChains,
  type QrResult,
} from '../src';

// expo-camera est un MODULE NATIF : présent seulement après un rebuild EAS.
// On le charge de façon paresseuse ET gardée — un import statique planterait
// tout l'app au chargement si le natif est absent (ExpoCamera introuvable).
let cameraMod: typeof import('expo-camera') | null = null;
if (requireOptionalNativeModule('ExpoCamera')) {
  try {
    cameraMod = require('expo-camera');
  } catch {
    cameraMod = null;
  }
}
const CAMERA_OK = !!cameraMod;

export default function Scan() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {CAMERA_OK ? <Scanner /> : <PasteOnly />}
    </>
  );
}

/** Détermine la chaîne cible puis navigue selon le contenu scanné. */
function useQrAction() {
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const activeChain = useWallet((s) => s.activeChain);
  const t = useT();

  return (r: QrResult) => {
    if (r.kind === 'walletconnect') {
      useWalletConnect.getState().pair(r.uri).catch(() => {});
      router.replace('/walletconnect');
      return;
    }
    if (r.kind === 'url') {
      router.replace({ pathname: '/browser', params: { url: r.url } });
      return;
    }
    if (r.kind === 'invalid') {
      toast.error(t('qrNotRecognized'));
      return;
    }

    // Adresse ou URI de paiement : aligner la chaîne active sur la famille.
    const fam = qrTargetFamily(r);
    const currentIsEvm = getAdapter(activeChain).config.family === 'evm';
    let chainId = activeChain;
    if (fam === 'bitcoin') chainId = 'bitcoin';
    else if (fam === 'solana') chainId = 'solana';
    else if (fam === 'evm') {
      if (r.kind === 'ethereum-uri' && r.chainId) {
        chainId = kalyxChainIdForEvm(r.chainId, listChains()) ?? (currentIsEvm ? activeChain : 'ethereum');
      } else {
        chainId = currentIsEvm ? activeChain : 'ethereum';
      }
    }
    if (chainId !== activeChain) setActiveChain(chainId);

    // Montant préchargé seulement si sûr (pas de token SPL via URI : décimales inconnues).
    const amount =
      r.kind === 'solana-uri' && r.splToken ? undefined : 'amount' in r ? (r as { amount?: string }).amount : undefined;
    router.replace({ pathname: '/send', params: { to: r.address, ...(amount ? { amount } : {}) } });
  };
}

function Scanner() {
  // cameraMod est garanti non-null ici (Scanner n'est rendu que si CAMERA_OK).
  const { CameraView, useCameraPermissions } = cameraMod!;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<QrResult | null>(null);
  const [torch, setTorch] = useState(false);
  const locked = useRef(false);
  const act = useQrAction();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission]);

  const onScan = (raw: string) => {
    if (locked.current || !raw) return;
    locked.current = true;
    setResult(parseQr(raw));
  };
  const rescan = () => {
    locked.current = false;
    setResult(null);
  };
  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return toast.info(t('clipboardEmpty'));
    locked.current = true;
    setResult(parseQr(text));
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, padding: spacing(3) }]}>
        <Icon name="scan" size={48} color={colors.accent} />
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 18, marginTop: spacing(2), textAlign: 'center' }}>
          {t('allowCamera')}
        </Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing(1) }}>
          {t('cameraNeedReason')}
        </Text>
        <View style={{ height: spacing(3) }} />
        <Button label={t('allow')} onPress={requestPermission} />
        <Pressable onPress={paste} style={{ marginTop: spacing(2) }}>
          <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('pasteFromClipboard')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ position: 'absolute', top: insets.top, left: 12, right: 12, zIndex: 5 }}>
        <ScreenHeader title={t('scanQrTitle')} />
      </View>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={locked.current ? undefined : ({ data }: { data: string }) => onScan(data)}
      />
      <ScanFrame />

      {/* Barre d'outils bas */}
      <View style={styles.toolbar}>
        <ToolButton icon={torch ? 'flash' : 'flashOff'} label={t('torchLabel')} active={torch} onPress={() => setTorch((v) => !v)} />
        <ToolButton icon="copy" label={t('paste')} onPress={paste} />
      </View>

      {result ? <ResultSheet result={result} onAct={act} onRescan={rescan} /> : null}
    </View>
  );
}

/** Repli sans caméra (module natif absent) : coller le contenu d'un QR. */
function PasteOnly() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const act = useQrAction();
  const [result, setResult] = useState<QrResult | null>(null);
  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return toast.info(t('clipboardEmpty'));
    setResult(parseQr(text));
  };
  return (
    <View style={[styles.center, { backgroundColor: colors.bg, padding: spacing(3), flex: 1 }]}>
      <View style={{ position: 'absolute', top: insets.top, left: 12, right: 12 }}>
        <ScreenHeader title={t('scanQrTitle')} />
      </View>
      <Icon name="scan" size={48} color={colors.textMuted} />
      <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 18, marginTop: spacing(2), textAlign: 'center' }}>
        {t('cameraUnavailable')}
      </Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing(1) }}>
        {t('scannerAfterRebuild')}
      </Text>
      <View style={{ height: spacing(3) }} />
      <Button label={t('pasteFromClipboard')} onPress={paste} />
      {result ? <ResultSheet result={result} onAct={act} onRescan={() => setResult(null)} /> : null}
    </View>
  );
}

/** Cadre de scan animé (ligne qui balaie). */
function ScanFrame() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const size = Math.min(Dimensions.get('window').width * 0.7, 280);
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={{ width: size, height: size, borderRadius: radii.lg, borderWidth: 2, borderColor: colors.accent + '88', overflow: 'hidden' }}>
        <Animated.View
          style={{
            height: 2,
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            shadowOpacity: 0.9,
            shadowRadius: 8,
            transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [8, size - 10] }) }],
          }}
        />
      </View>
      <Text style={{ color: '#fff', marginTop: spacing(2), fontFamily: fonts.semibold, opacity: 0.85 }}>
        {t('aimAtQr')}
      </Text>
    </View>
  );
}

function ToolButton({ icon, label, active, onPress }: { icon: 'flash' | 'flashOff' | 'copy'; label: string; active?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable onPress={onPress} style={styles.tool}>
      <View style={[styles.toolCircle, { backgroundColor: active ? colors.accent : 'rgba(255,255,255,0.12)' }]}>
        <Icon name={icon} size={22} color="#fff" />
      </View>
      <Text style={{ color: '#fff', fontSize: 12, marginTop: 4, opacity: 0.85 }}>{label}</Text>
    </Pressable>
  );
}

/** Fiche de confirmation : montre TOUJOURS ce qui a été scanné avant d'agir. */
function ResultSheet({ result, onAct, onRescan }: { result: QrResult; onAct: (r: QrResult) => void; onRescan: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const d = describeQr(result);
  return (
    <View style={styles.sheetWrap}>
      <View style={[styles.sheet, { backgroundColor: colors.bgElevated, borderColor: colors.glassBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {d.danger ? <Icon name="warning" size={20} color={colors.warning} /> : <Icon name="check" size={20} color={colors.up} />}
          <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{d.title}</Text>
        </View>
        <Text selectable style={{ color: colors.textMuted, marginTop: spacing(1), fontSize: 13 }}>
          {d.detail}
        </Text>
        {d.danger && result.kind === 'url' ? (
          <Text style={{ color: colors.warning, fontSize: 12, marginTop: spacing(1) }}>
            {t('verifyUrlWarning')}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(2) }}>
          <Pressable onPress={onRescan} style={[styles.btnGhost, { borderColor: colors.glassBorder }]}>
            <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{t('scanAgain')}</Text>
          </Pressable>
          {d.cta ? (
            <Pressable onPress={() => onAct(result)} style={[styles.btnPrimary, { backgroundColor: colors.accent }]}>
              <Text style={{ color: '#fff', fontFamily: fonts.bold }}>{d.cta}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  toolbar: { position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 40 },
  tool: { alignItems: 'center' },
  toolCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing(2) },
  sheet: { borderRadius: radii.lg, borderWidth: 1, padding: spacing(2.5) },
  btnGhost: { flex: 1, borderWidth: 1, borderRadius: radii.pill, paddingVertical: spacing(1.5), alignItems: 'center' },
  btnPrimary: { flex: 1, borderRadius: radii.pill, paddingVertical: spacing(1.5), alignItems: 'center' },
});
