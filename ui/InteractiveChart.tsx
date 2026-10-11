/**
 * Graphique de prix interactif façon Revolut : on pose le doigt, un crosshair
 * suit le point le plus proche, la partie « future » de la courbe s'estompe,
 * une petite vibration marque chaque changement de point, et le parent reçoit
 * le point sous le doigt (prix + date) via onScrub pour l'afficher en gros.
 *
 * LE GLISSEMENT TOURNE SUR LE THREAD UI. Le geste (react-native-gesture-handler)
 * calcule l'index dans un worklet ; le crosshair et la découpe passé / futur
 * sont des props animées et des translations. Le thread JS n'est sollicité
 * qu'au CHANGEMENT de point (vibration + valeur affichée par le parent) — le
 * graphique lui-même ne se re-rend plus pendant le scrub.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Vibration, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from './theme';
import { useLoopActive } from './useLoopActive';
import type { ChartPoint } from '../src';

const PAD = 6;

// Éléments SVG animables (props pilotées sur le fil d'animation, sans rendu React).
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
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
  // Refs : le rappel JS lancé depuis le geste voit toujours les données à jour.
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;

  /*
   * ANIMATION DE LA COURBE. Elle se dessine de gauche à droite quand la série
   * change VRAIMENT (arrivée des données, autre période), pas à chaque
   * rafraîchissement du prix : la clé ne dépend que du nombre de points et du
   * premier instant. Un point pulse ensuite au bout — le prix actuel, et
   * seulement quand l'écran est visible. Rien de tout cela si le système
   * demande de réduire les animations.
   */
  const reduced = useReducedMotion();
  const loopActive = useLoopActive();
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
    if (reduced || !loopActive) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(pulse);
  }, [reduced, loopActive, pulse]);

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

  /** Index du point sous le doigt, sur le thread UI ; -1 hors scrub. */
  const scrubIdx = useSharedValue(-1);
  const xs = useSharedValue<number[]>([]);
  const ys = useSharedValue<number[]>([]);
  const plotWidth = useSharedValue(width);
  useEffect(() => {
    xs.value = geom ? geom.xy.map((p) => p[0]) : [];
    ys.value = geom ? geom.xy.map((p) => p[1]) : [];
  }, [geom, xs, ys]);
  useEffect(() => {
    plotWidth.value = width;
  }, [width, plotWidth]);

  /** Côté JS, seulement quand le point change : vibration et valeur pour le parent. */
  const emit = useCallback((idx: number) => {
    if (idx < 0) {
      onScrubRef.current?.(null);
      return;
    }
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    Vibration.vibrate(4); // tick haptique discret à chaque point
    onScrubRef.current?.(pts[Math.min(idx, pts.length - 1)]);
  }, []);

  const gesture = useMemo(() => {
    const track = (x: number) => {
      'worklet';
      const n = xs.value.length;
      if (n < 2) return;
      const ratio = (x - PAD) / (plotWidth.value - PAD * 2);
      const idx = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
      if (idx !== scrubIdx.value) {
        scrubIdx.value = idx;
        runOnJS(emit)(idx);
      }
    };
    return Gesture.Pan()
      .minDistance(0)
      // Le doigt peut sortir du graphique sans perdre le scrub.
      .shouldCancelWhenOutside(false)
      .onBegin((e) => track(e.x))
      .onUpdate((e) => track(e.x))
      .onFinalize(() => {
        if (scrubIdx.value === -1) return;
        scrubIdx.value = -1;
        runOnJS(emit)(-1);
      });
  }, [emit, scrubIdx, xs, plotWidth]);

  // Nouvelle série (autre période) pendant un glissement : le point montré n'existe plus — on le relâche.
  useEffect(() => {
    if (scrubIdx.value === -1) return;
    scrubIdx.value = -1;
    onScrubRef.current?.(null);
  }, [drawKey, scrubIdx]);

  const len = geom?.length ?? 1;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - progress.value) }), [len]);
  const areaProps = useAnimatedProps(() => ({ opacity: progress.value }));
  // Le point final n'apparaît qu'une fois la courbe arrivée à lui.
  const dotProps = useAnimatedProps(() => ({ opacity: progress.value >= 0.98 ? 1 : 0 }));
  const haloProps = useAnimatedProps(() => ({ r: 4.5 + pulse.value * 11, opacity: progress.value >= 0.98 ? (1 - pulse.value) * 0.45 : 0 }));

  // Position du point sous le doigt (série raccourcie : l'index est ramené dans les bornes).
  const restLayer = useAnimatedStyle(() => ({ opacity: scrubIdx.value >= 0 ? 0 : 1 }));
  const scrubLayer = useAnimatedStyle(() => ({ opacity: scrubIdx.value >= 0 ? 1 : 0 }));
  const cutX = () => {
    'worklet';
    const n = xs.value.length;
    if (scrubIdx.value < 0 || n === 0) return 0;
    return xs.value[Math.min(scrubIdx.value, n - 1)];
  };
  const cutY = () => {
    'worklet';
    const n = ys.value.length;
    if (scrubIdx.value < 0 || n === 0) return 0;
    return ys.value[Math.min(scrubIdx.value, n - 1)];
  };
  // Partie « passée » : un calque décalé à gauche et son contenu décalé d'autant à droite — seule la bande [0, x] reste visible.
  const pastClip = useAnimatedStyle(() => ({ transform: [{ translateX: cutX() - plotWidth.value }] }));
  const pastContent = useAnimatedStyle(() => ({ transform: [{ translateX: plotWidth.value - cutX() }] }));
  const crossProps = useAnimatedProps(() => {
    const x = cutX();
    return { x1: x, x2: x };
  });
  const dotHaloProps = useAnimatedProps(() => ({ cx: cutX(), cy: cutY() }));
  const dotCoreProps = useAnimatedProps(() => ({ cx: cutX(), cy: cutY() }));

  if (!geom) return <View style={{ width, height }} />;
  const { xy, area, toStr, line, length } = geom;
  const [ex, ey] = xy[xy.length - 1];
  const fullLine = toStr(xy);
  const layer = { position: 'absolute', left: 0, top: 0, width, height } as const;

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={{ width, height, overflow: 'hidden' }}>
        <Svg width={width} height={height} style={layer}>
          <Defs>
            <SvgLinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.25" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          <AnimatedPath d={area} fill="url(#chartGrad)" animatedProps={areaProps} />
        </Svg>
        {/* Courbe qui se dessine, puis le prix actuel qui pulse au bout. */}
        <Animated.View pointerEvents="none" style={[layer, restLayer]}>
          <Svg width={width} height={height}>
            <AnimatedPath d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={[length, length]} animatedProps={lineProps} />
            <AnimatedCircle cx={ex} cy={ey} fill={color} animatedProps={haloProps} />
            <AnimatedCircle cx={ex} cy={ey} r={3.5} fill={color} stroke={colors.bg} strokeWidth={1.5} animatedProps={dotProps} />
          </Svg>
        </Animated.View>
        {/* Scrub : courbe estompée, partie passée pleine, crosshair. */}
        <Animated.View pointerEvents="none" style={[layer, scrubLayer]}>
          <Svg width={width} height={height} style={layer}>
            <Polyline points={fullLine} fill="none" stroke={color} strokeOpacity={0.28} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
          <Animated.View style={[layer, { overflow: 'hidden' }, pastClip]}>
            <Animated.View style={[layer, pastContent]}>
              <Svg width={width} height={height}>
                <Polyline points={fullLine} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              </Svg>
            </Animated.View>
          </Animated.View>
          <Svg width={width} height={height} style={layer}>
            <AnimatedLine y1={PAD} y2={height - PAD} stroke={colors.textTertiary} strokeWidth={1} strokeDasharray="3 4" animatedProps={crossProps} />
            <AnimatedCircle r={9} fill={color} fillOpacity={0.22} animatedProps={dotHaloProps} />
            <AnimatedCircle r={4.5} fill={color} stroke={colors.bg} strokeWidth={2} animatedProps={dotCoreProps} />
          </Svg>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
