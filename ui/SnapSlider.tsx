/**
 * Curseur à crans — choisir « quelle part de mon solde » au pouce.
 *
 * Cinq crans (0, 25, 50, 75 %, Max). Le pouce suit le doigt librement, mais la
 * valeur ne prend que les crans : à chaque cran franchi, une vibration sèche
 * et le montant se met à jour aussitôt. Au relâchement, le pouce se pose sur le
 * cran au ressort. Le trait se remplit de la couleur de l'actif.
 *
 * Pensé pour compléter le clavier, pas le remplacer : le clavier pour un
 * montant précis, le curseur pour « la moitié », « tout ».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from './kit';
import { useTheme } from './theme';
import { BRAND_GOLD, fontFamily } from './tokens';
import { haptic } from '../lib/haptics';

const SNAPS = [0, 25, 50, 75, 100];
const THUMB = 26;
/** Déplacement (px) qui distingue un glissement d'un toucher franc. */
const SLOP = 6;

/*
 * LE POUCE SUIT LE DOIGT SUR LE THREAD UI. Position, cran courant et pose au
 * ressort sont des valeurs partagées pilotées par le geste ; le thread JS n'est
 * appelé qu'au franchissement d'un cran (vibration + `onChange`).
 */
export function SnapSlider({ value, onChange, accent, maxLabel, disabled }: { value: number | null; onChange: (pct: number) => void; accent?: string | null; maxLabel: string; /** Inactif (solde pas encore connu) : visible, atténué, sans effet. */ disabled?: boolean }) {
  const { colors } = useTheme();
  const tint = accent ?? BRAND_GOLD.light;
  const [w, setW] = useState(0);
  const track = Math.max(1, w - THUMB);
  const x = useSharedValue(0);
  /** Cran annoncé en dernier (-1 : aucun, montant tapé au clavier). */
  const idx = useSharedValue(-1);
  const startX = useSharedValue(0);
  const dragging = useSharedValue(false);
  const trackPx = useSharedValue(track);
  const boxW = useSharedValue(w);
  const enabled = useSharedValue(!disabled);
  useEffect(() => {
    trackPx.value = track;
    boxW.value = w;
  }, [track, w, trackPx, boxW]);
  useEffect(() => {
    enabled.value = !disabled;
  }, [disabled, enabled]);

  /*
   * RÉFÉRENCE TOUJOURS À JOUR : le geste appelle le `onChange` du dernier rendu
   * — d'avant le chargement du solde, le curseur fixait toujours 0 % de 0.
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const announce = useCallback((i: number) => {
    haptic.selection();
    onChangeRef.current(SNAPS[i]);
  }, []);

  // Position du pouce quand la valeur change d'ailleurs (clavier → aucun cran, bouton Max…).
  const shownIdx = value == null ? -1 : SNAPS.indexOf(value);
  useEffect(() => {
    if (!w) return;
    // Aucun cran (montant tapé au clavier) : -1, pour que toucher « 0 % » agisse quand même.
    // Mis à jour même pendant un geste : le relâchement se posera sur la valeur du parent.
    idx.value = shownIdx;
    if (!dragging.value) x.value = withSpring((SNAPS[Math.max(0, shownIdx)] / 100) * track, { damping: 18, stiffness: 260 });
  }, [shownIdx, w, track, idx, dragging, x]);

  /*
   * Glisser HORIZONTAL ou toucher franc seulement. Un geste vertical (on fait
   * défiler l'écran et on frôle le curseur) est rendu au défilement et ne
   * change rien : il effaçait un montant tapé au clavier.
   */
  const gesture = useMemo(() => {
    /** Position du doigt (px depuis le bord du trait), bornée au trait. */
    const clampPx = (v: number) => {
      'worklet';
      return Math.min(trackPx.value, Math.max(0, v));
    };
    /** Pendant le geste : vibration et mise à jour à chaque NOUVEAU cran. */
    const crossNotch = (px: number) => {
      'worklet';
      if (!enabled.value) return; // devenu inactif pendant le geste : on n'annonce plus rien
      const i = Math.round((px / trackPx.value) * (SNAPS.length - 1));
      if (i !== idx.value) {
        idx.value = i;
        runOnJS(announce)(i);
      }
    };
    /**
     * À la fin : le pouce se pose sur le cran DÉJÀ annoncé pendant le geste.
     * Aucun nouvel appel à `onChange` : relâcher sur le même cran ne doit pas
     * effacer un devis en cours (le parent invalide le devis à chaque changement).
     */
    const finish = () => {
      'worklet';
      x.value = withSpring((SNAPS[Math.max(0, idx.value)] / 100) * trackPx.value, { damping: 18, stiffness: 260 });
      dragging.value = false;
    };
    const pan = Gesture.Pan()
      .activeOffsetX([-SLOP, SLOP])
      .failOffsetY([-SLOP, SLOP])
      .onBegin((e) => {
        if (!enabled.value) return;
        dragging.value = true;
        startX.value = clampPx(e.x - THUMB / 2);
      })
      .onUpdate((e) => {
        if (!enabled.value) return;
        const px = clampPx(startX.value + e.translationX);
        x.value = px;
        crossNotch(px);
      })
      .onFinalize(() => {
        if (dragging.value) finish();
      });
    // Toucher franc (sans glisser) : le cran touché est choisi.
    const tap = Gesture.Tap()
      .maxDistance(SLOP)
      .onEnd((e, success) => {
        if (!success || !enabled.value) return;
        crossNotch(clampPx(e.x - THUMB / 2));
        finish();
      });
    return Gesture.Race(pan, tap);
  }, [announce, enabled, idx, startX, dragging, trackPx, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // Remplissage découpé par translations (pas de largeur animée) ; son bout droit est sous le pouce.
  const fillClip = useAnimatedStyle(() => ({ transform: [{ translateX: x.value + THUMB / 2 - boxW.value }] }));
  const fillContent = useAnimatedStyle(() => ({ transform: [{ translateX: boxW.value - (x.value + THUMB / 2) }] }));

  return (
    <View style={{ gap: 8, opacity: disabled ? 0.4 : 1 }}>
      <GestureDetector gesture={gesture}>
      <View
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        style={{ height: 36, justifyContent: 'center' }}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityValue={{ min: 0, max: 100, now: value ?? 0 }}
      >
        <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface3, marginHorizontal: THUMB / 2 }} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: w, height: 6, overflow: 'hidden' }, fillClip]}>
          <Animated.View style={[{ width: w, height: 6, borderRadius: 3, backgroundColor: tint, opacity: 0.85 }, fillContent]} />
        </Animated.View>
        {/* Crans */}
        {w
          ? SNAPS.map((s) => (
              <View key={s} pointerEvents="none" style={{ position: 'absolute', left: THUMB / 2 + (s / 100) * track - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: (value ?? -1) >= s ? colors.bg : colors.textTertiary }} />
            ))
          : null}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.primary, borderWidth: 3, borderColor: tint, shadowColor: tint, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 }, thumbStyle]} />
      </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
        {SNAPS.map((s) => (
          <Text key={s} variant="micro" style={{ fontFamily: fontFamily.semibold, color: value === s ? colors.text : colors.textTertiary, width: 40, textAlign: s === 0 ? 'left' : s === 100 ? 'right' : 'center' }}>
            {s === 100 ? maxLabel : `${s} %`}
          </Text>
        ))}
      </View>
    </View>
  );
}
