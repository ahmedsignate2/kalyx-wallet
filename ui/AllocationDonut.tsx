/**
 * Donut de répartition du portefeuille (SVG pur, zéro dépendance nouvelle).
 *
 * Règles dataviz appliquées :
 * - palette catégorielle FIXE validée (bande de luminosité sombre, chroma,
 *   séparation daltonisme ΔE 22, contraste ≥ 3:1) — jamais de couleur cyclée ;
 * - au-delà de 4 actifs, le reste est replié dans « Autres » (5e slot) ;
 * - écart de 2 px entre segments (l'identité ne repose pas que sur la couleur) ;
 * - le texte (légende, valeurs) reste en tokens texte, jamais en couleur de série ;
 * - centre du donut = valeur totale (chiffres tabulaires).
 */
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { fonts, colors, spacing, typography } from './theme';

/** Ordre fixe — validé par scripts/validate_palette.js (mode sombre). */
export const ALLOCATION_COLORS = ['#7C5CFF', '#3390EC', '#1FA96E', '#C9831C', '#B85F8F'] as const;

export interface AllocationSlice {
  label: string;
  value: number;
}

/** Replie les tranches au-delà de `max − 1` dans « Autres » (dernier slot). */
export function foldSlices(slices: AllocationSlice[], max = ALLOCATION_COLORS.length): AllocationSlice[] {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((s, x) => s + x.value, 0);
  return [...head, { label: 'Autres', value: rest }];
}

/** Arc SVG (donut) entre deux angles (radians, 0 = midi, sens horaire). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x = (a: number) => cx + r * Math.sin(a);
  const y = (a: number) => cy - r * Math.cos(a);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x(a0).toFixed(2)} ${y(a0).toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x(a1).toFixed(2)} ${y(a1).toFixed(2)}`;
}

export function AllocationDonut({
  slices,
  size = 132,
  thickness = 14,
  centerTitle,
  centerValue,
  formatValue,
}: {
  /** Tranches déjà repliées (voir foldSlices) ; l'ordre donne la couleur. */
  slices: AllocationSlice[];
  size?: number;
  thickness?: number;
  centerTitle?: string;
  /** Valeur affichée au centre (déjà formatée, ex. « 1 234 € »). */
  centerValue?: string;
  /** Formate la valeur d'une ligne de légende ; absent = valeur masquée. */
  formatValue?: (v: number) => string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0 || slices.length === 0) return null;

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Écart de 2 px convertis en angle ; sans écart si une seule tranche.
  const gap = slices.length > 1 ? 2 / r : 0;

  let angle = 0;
  const arcs = slices.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle + gap / 2;
    const a1 = angle + Math.max(sweep - gap / 2, gap); // jamais négatif
    angle += sweep;
    return { d: arcPath(cx, cy, r, a0, a1), color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] };
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          {slices.length === 1 ? (
            // Un arc SVG de 360° ne se dessine pas : cercle complet à la place.
            <Circle cx={cx} cy={cy} r={r} stroke={ALLOCATION_COLORS[0]} strokeWidth={thickness} fill="none" />
          ) : (
            arcs.map((a, i) => (
              <Path key={i} d={a.d} stroke={a.color} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
            ))
          )}
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          {centerTitle ? <Text style={{ fontSize: 11, fontFamily: fonts.medium, color: colors.textMuted }}>{centerTitle}</Text> : null}
          {centerValue ? (
            <Text
              style={{ fontSize: 15, fontFamily: fonts.bold, color: colors.text, fontVariant: ['tabular-nums'], maxWidth: size - thickness * 2 - 12 }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {centerValue}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Légende : pastille couleur + libellé + % (+ valeur), texte en tokens. */}
      <View style={{ flex: 1, gap: spacing(1) }}>
        {slices.map((s, i) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} />
            <Text style={[typography.bodyStrong, { fontSize: 14, flex: 1 }]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.semibold, color: colors.text, fontVariant: ['tabular-nums'] }}>
              {((s.value / total) * 100).toFixed(1).replace('.', ',')} %
            </Text>
            {formatValue ? (
              <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'right' }}>
                {formatValue(s.value)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
