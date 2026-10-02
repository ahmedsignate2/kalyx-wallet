/**
 * Graphique de prix interactif façon Revolut : on pose le doigt, un crosshair
 * suit le point le plus proche, la partie « future » de la courbe s'estompe,
 * une petite vibration marque chaque changement de point, et le parent reçoit
 * le point sous le doigt (prix + date) via onScrub pour l'afficher en gros.
 *
 * Zéro dépendance native nouvelle : SVG (déjà installé) + PanResponder +
 * Vibration de React Native. Fonctionne sans rebuild.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Vibration, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from './theme';
import type { ChartPoint } from '../src';

const PAD = 6;

// Éléments SVG animables (props pilotées sur le fil d'animation, sans rendu React).
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
/** Durée du tracé de la courbe. */
const DRAW_MS = 900;

export function InteractiveChart({
  points,
  color,
  width,
  height = 190,
  onScrub,
}: {
  points: ChartPoint[];
  color: string;
  width: number;
  height?: number;
  /** Appelé avec le point sous le doigt pendant le scrub, puis null au relâchement. */
  onScrub?: (p: ChartPoint | null) => void;
}) {
  const { colors } = useTheme();
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  // Refs pour que le PanResponder (créé une fois) voie toujours les données à jour.
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const widthRef = useRef(width);
  widthRef.current = width;
  const lastIdx = useRef<number | null>(null);

  /*
   * ANIMATION DE LA COURBE. Elle se dessine de gauche à droite quand la série
   * change VRAIMENT (arrivée des données, autre période), pas à chaque
   * rafraîchissement du prix : la clé ne dépend que du nombre de points et du
   * premier instant. Un point pulse ensuite au bout — le prix actuel. Rien de
   * tout cela si le système demande de réduire les animations.
   */
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const pulse = useSharedValue(0);
  const drawKey = points.length > 1 ? `${points.length}:${points[0].t}` : '';
  useEffect(() => {
    if (!drawKey) return;
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) });
  }, [drawKey, reduced, progress]);
  useEffect(() => {
    if (reduced) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduced, pulse]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Ne pas laisser le ScrollView parent voler le geste en plein scrub.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => update(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => update(evt.nativeEvent.locationX),
      onPanResponderRelease: () => end(),
      onPanResponderTerminate: () => end(),
    }),
  ).current;

  function update(x: number) {
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    const w = widthRef.current;
    const ratio = (x - PAD) / (w - PAD * 2);
    const idx = Math.min(pts.length - 1, Math.max(0, Math.round(ratio * (pts.length - 1))));
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      Vibration.vibrate(4); // tick haptique discret à chaque point
      setScrubIdx(idx);
      onScrubRef.current?.(pts[idx]);
    }
  }
  function end() {
    lastIdx.current = null;
    setScrubIdx(null);
    onScrubRef.current?.(null);
  }

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const xy = points.map((p, i) => {
      const x = (i / (points.length - 1)) * (width - PAD * 2) + PAD;
      const y = height - PAD - ((p.v - min) / range) * (height - PAD * 2);
      return [x, y] as const;
    });
    const toStr = (pts: (readonly [number, number])[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area =
      `M ${xy[0][0].toFixed(1)},${height} ` +
      xy.map((p) => `L ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
      ` L ${xy[xy.length - 1][0].toFixed(1)},${height} Z`;
    // Tracé de la courbe seule, et sa longueur : le trait « se dessine » en découvrant ses tirets.
    const line = xy.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    let length = 0;
    for (let i = 1; i < xy.length; i++) length += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    return { xy, area, toStr, line, length: Math.ceil(length) + 1 };
  }, [points, width, height]);

  const len = geom?.length ?? 1;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - progress.value) }), [len]);
  const areaProps = useAnimatedProps(() => ({ opacity: progress.value }));
  // Le point final n'apparaît qu'une fois la courbe arrivée à lui.
  const dotProps = useAnimatedProps(() => ({ opacity: progress.value >= 0.98 ? 1 : 0 }));
  const haloProps = useAnimatedProps(() => ({ r: 4.5 + pulse.value * 11, opacity: progress.value >= 0.98 ? (1 - pulse.value) * 0.45 : 0 }));

  if (!geom) return <View style={{ width, height }} />;
  const { xy, area, toStr, line, length } = geom;
  const [ex, ey] = xy[xy.length - 1];

  // Série raccourcie pendant un glissement (nouvelle période) : l'index est ramené dans les bornes.
  const idx = scrubIdx != null ? Math.min(scrubIdx, xy.length - 1) : null;
  const scrubbing = idx != null && idx >= 0;
  const cut = scrubbing ? idx : xy.length - 1;
  const left = xy.slice(0, cut + 1);
  const right = xy.slice(cut);
  const sx = scrubbing ? xy[idx][0] : 0;
  const sy = scrubbing ? xy[idx][1] : 0;

  return (
    <View {...pan.panHandlers} collapsable={false}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <AnimatedPath d={area} fill="url(#chartGrad)" animatedProps={areaProps} />
        {scrubbing ? (
          <>
            {/* Courbe : partie « passée » pleine, partie après le doigt estompée. */}
            <Polyline points={toStr(left)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {right.length > 1 ? (
              <Polyline points={toStr(right)} fill="none" stroke={color} strokeOpacity={0.28} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
          </>
        ) : (
          <>
            {/* Courbe qui se dessine, puis le prix actuel qui pulse au bout. */}
            <AnimatedPath d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={[length, length]} animatedProps={lineProps} />
            <AnimatedCircle cx={ex} cy={ey} fill={color} animatedProps={haloProps} />
            <AnimatedCircle cx={ex} cy={ey} r={3.5} fill={color} stroke={colors.bg} strokeWidth={1.5} animatedProps={dotProps} />
          </>
        )}
        {scrubbing ? (
          <>
            <Line x1={sx} y1={PAD} x2={sx} y2={height - PAD} stroke={colors.textTertiary} strokeWidth={1} strokeDasharray="3 4" />
            <Circle cx={sx} cy={sy} r={9} fill={color} fillOpacity={0.22} />
            <Circle cx={sx} cy={sy} r={4.5} fill={color} stroke={colors.bg} strokeWidth={2} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
