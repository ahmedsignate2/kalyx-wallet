/**
 * Logo Nova — tête de lion géométrique (le lion = emblème de la marque).
 * SVG pur (aucun asset raster) : net à toutes les tailles, dégradé violet→bleu.
 *
 * Construction : une crinière = anneau de « rayons » arrondis (deux couronnes
 * décalées pour la densité), une face claire au centre, oreilles, yeux, museau.
 * Paramétrique → symétrique et propre par construction.
 *
 * NB : c'est le logo AFFICHÉ dans l'app (splash, déverrouillage, onboarding).
 * L'icône du store (PNG) doit être générée à part depuis ce dessin.
 */
import React from 'react';
import Svg, { Defs, LinearGradient, Stop, G, Rect, Circle, Path, Ellipse } from 'react-native-svg';

/** Un anneau de `count` rayons arrondis, extrémité au rayon `outer`. */
function Mane({ count, outer, inner, width, rotate = 0, fill }: { count: number; outer: number; inner: number; width: number; rotate?: number; fill: string }) {
  const rays = [];
  const h = outer - inner;
  for (let i = 0; i < count; i++) {
    const angle = rotate + (360 / count) * i;
    // Rayon centré à mi-hauteur, pointant vers le haut puis tourné.
    rays.push(
      <Rect
        key={i}
        x={-width / 2}
        y={-(outer)}
        width={width}
        height={h}
        rx={width / 2}
        fill={fill}
        transform={`rotate(${angle} 0 0)`}
      />,
    );
  }
  return <G>{rays}</G>;
}

export function NovaLogo({ size = 96, faceColor = '#F3F0FF' }: { size?: number; faceColor?: string }) {
  // Repère centré (−50..50).
  return (
    <Svg width={size} height={size} viewBox="-50 -50 100 100">
      <Defs>
        <LinearGradient id="novaMane" x1="0" y1="-1" x2="0" y2="1">
          <Stop offset="0" stopColor="#8E6BFF" />
          <Stop offset="1" stopColor="#4AA8FF" />
        </LinearGradient>
        <LinearGradient id="novaManeBack" x1="0" y1="-1" x2="0" y2="1">
          <Stop offset="0" stopColor="#6A4DFF" />
          <Stop offset="1" stopColor="#3A86E0" />
        </LinearGradient>
      </Defs>

      {/* Crinière : couronne arrière (foncée) décalée + couronne avant */}
      <Mane count={11} outer={48} inner={20} width={15} rotate={360 / 22} fill="url(#novaManeBack)" />
      <Mane count={11} outer={45} inner={16} width={17} fill="url(#novaMane)" />

      {/* Oreilles */}
      <Circle cx={-17} cy={-19} r={8} fill="url(#novaMane)" />
      <Circle cx={17} cy={-19} r={8} fill="url(#novaMane)" />

      {/* Face */}
      <Circle cx={0} cy={2} r={24} fill={faceColor} />

      {/* Yeux */}
      <Ellipse cx={-9} cy={-3} rx={2.6} ry={3.6} fill="#3A2E6B" />
      <Ellipse cx={9} cy={-3} rx={2.6} ry={3.6} fill="#3A2E6B" />

      {/* Museau : nez + bouche stylisés */}
      <Path d="M-5 8 L5 8 L0 13 Z" fill="#6A4DFF" />
      <Path
        d="M0 13 L0 17 M0 17 C0 20 -4 20 -6 18 M0 17 C0 20 4 20 6 18"
        stroke="#3A2E6B"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
