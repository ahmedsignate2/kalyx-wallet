/**
 * Graphique de prix interactif façon Revolut : on pose le doigt, un crosshair
 * suit le point le plus proche, la partie « future » de la courbe s'estompe,
 * une petite vibration marque chaque changement de point, et le parent reçoit
 * le point sous le doigt (prix + date) via onScrub pour l'afficher en gros.
 *
 * Zéro dépendance native nouvelle : SVG (déjà installé) + PanResponder +
 * Vibration de React Native. Fonctionne sans rebuild.
 */
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Vibration, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import { useTheme } from './theme';
import type { ChartPoint } from '../src';

const PAD = 6;

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
    return { xy, area, toStr };
  }, [points, width, height]);

  if (!geom) return <View style={{ width, height }} />;
  const { xy, area, toStr } = geom;

  const scrubbing = scrubIdx != null;
  const cut = scrubbing ? scrubIdx : xy.length - 1;
  const left = xy.slice(0, cut + 1);
  const right = xy.slice(cut);
  const sx = scrubbing ? xy[scrubIdx][0] : 0;
  const sy = scrubbing ? xy[scrubIdx][1] : 0;

  return (
    <View {...pan.panHandlers} collapsable={false}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d={area} fill="url(#chartGrad)" />
        {/* Courbe : partie « passée » pleine, partie après le doigt estompée. */}
        <Polyline points={toStr(left)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {right.length > 1 ? (
          <Polyline points={toStr(right)} fill="none" stroke={color} strokeOpacity={scrubbing ? 0.28 : 1} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
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
