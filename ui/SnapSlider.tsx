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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './kit';
import { useTheme } from './theme';
import { BRAND_GOLD, fontFamily } from './tokens';
import { haptic } from '../lib/haptics';

const SNAPS = [0, 25, 50, 75, 100];
const THUMB = 26;

export function SnapSlider({ value, onChange, accent, maxLabel, disabled }: { value: number | null; onChange: (pct: number) => void; accent?: string | null; maxLabel: string; /** Inactif (solde pas encore connu) : visible, atténué, sans effet. */ disabled?: boolean }) {
  const { colors } = useTheme();
  const tint = accent ?? BRAND_GOLD.light;
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const idxRef = useRef(-1);
  const startX = useRef(0);
  const dragging = useRef(false);
  const track = Math.max(1, w - THUMB);
  /*
   * RÉFÉRENCES TOUJOURS À JOUR. Le geste est créé une seule fois : sans ces
   * refs il gardait le `onChange` du PREMIER rendu — d'avant le chargement du
   * solde — et le curseur fixait toujours 0 % de 0 (« Tu donnes » restait à 0).
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(!!disabled);
  disabledRef.current = !!disabled;
  const trackRef = useRef(track);
  trackRef.current = track;
  /** Position du doigt (px depuis le bord du trait), bornée au trait. */
  const clampPx = (v: number) => Math.min(trackRef.current, Math.max(0, v));
  const snapIndex = (px: number) => Math.round((px / trackRef.current) * (SNAPS.length - 1));
  const settleOn = (i: number) => {
    x.value = withSpring((SNAPS[i] / 100) * trackRef.current, { damping: 18, stiffness: 260 });
  };

  // Position du pouce quand la valeur change d'ailleurs (clavier → aucun cran, bouton Max…).
  const shownIdx = value == null ? -1 : SNAPS.indexOf(value);
  useEffect(() => {
    if (!w) return;
    // Aucun cran (montant tapé au clavier) : -1, pour que toucher « 0 % » agisse quand même.
    // Mis à jour même pendant un geste : le relâchement se posera sur la valeur du parent.
    idxRef.current = shownIdx;
    if (!dragging.current) settleOn(Math.max(0, shownIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIdx, w, track]);

  /** Pendant le geste : vibration et mise à jour à chaque NOUVEAU cran. */
  const crossNotch = (px: number) => {
    if (disabledRef.current) return; // devenu inactif pendant le geste : on n'annonce plus rien
    const i = snapIndex(px);
    if (i !== idxRef.current) {
      idxRef.current = i;
      haptic.selection();
      onChangeRef.current(SNAPS[i]);
    }
  };
  /**
   * À la fin : le pouce se pose sur le cran DÉJÀ annoncé pendant le geste.
   * Aucun nouvel appel à `onChange` : relâcher sur le même cran ne doit pas
   * effacer un devis en cours (le parent invalide le devis à chaque changement).
   */
  const finish = () => {
    settleOn(Math.max(0, idxRef.current));
    dragging.current = false;
  };
  /*
   * Le trait, le remplissage, les crans et le pouce ont tous
   * pointerEvents="none" : la boîte est la SEULE cible du toucher, donc
   * `locationX` est toujours mesuré depuis son bord. (Avant, l'élément touché
   * changeait — pouce, trait — et le pouce sautait.)
   */
  /*
   * Glisser HORIZONTAL ou toucher franc seulement. Un geste vertical (on fait
   * défiler l'écran et on frôle le curseur) est rendu au défilement et ne
   * change rien : il effaçait un montant tapé au clavier.
   */
  const horizontal = useRef(false);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: (_e, g) => !disabledRef.current && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        // Tant que le geste n'est pas reconnu comme horizontal, le défilement peut le reprendre.
        onPanResponderTerminationRequest: () => !horizontal.current,
        onPanResponderGrant: (e) => {
          dragging.current = true;
          horizontal.current = false;
          startX.current = clampPx(e.nativeEvent.locationX - THUMB / 2);
        },
        onPanResponderMove: (_e, g) => {
          if (!horizontal.current && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy)) horizontal.current = true;
          if (!horizontal.current) return;
          const px = clampPx(startX.current + g.dx);
          x.value = px;
          crossNotch(px);
        },
        onPanResponderRelease: (_e, g) => {
          // Toucher franc (sans glisser) : le cran touché est choisi.
          if (!horizontal.current && Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) crossNotch(startX.current);
          horizontal.current = false;
          finish();
        },
        onPanResponderTerminate: () => {
          horizontal.current = false;
          finish();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + THUMB / 2 }));

  return (
    <View style={{ gap: 8, opacity: disabled ? 0.4 : 1 }}>
      <View
        {...pan.panHandlers}
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        style={{ height: 36, justifyContent: 'center' }}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityValue={{ min: 0, max: 100, now: value ?? 0 }}
      >
        <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface3, marginHorizontal: THUMB / 2 }} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: tint, opacity: 0.85 }, fillStyle]} />
        {/* Crans */}
        {w
          ? SNAPS.map((s) => (
              <View key={s} pointerEvents="none" style={{ position: 'absolute', left: THUMB / 2 + (s / 100) * track - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: (value ?? -1) >= s ? colors.bg : colors.textTertiary }} />
            ))
          : null}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.primary, borderWidth: 3, borderColor: tint, shadowColor: tint, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 }, thumbStyle]} />
      </View>
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
