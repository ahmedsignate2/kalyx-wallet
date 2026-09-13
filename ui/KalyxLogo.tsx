/**
 * Logo Kalyx — marque annulaire (étoile).
 * 
 * Un cercle central (le noyau) et un anneau externe de segments
 * disposés radialement avec des longueurs asymétriques (effet d'explosion,
 * énergie dirigée vers le haut).
 */
import React from 'react';
import Svg, { Defs, LinearGradient, Stop, G, Rect, Circle } from 'react-native-svg';

export function KalyxLogo({ size = 96, faceColor }: { size?: number; faceColor?: string }) {
  // Anneau de 16 segments
  const segments = Array.from({ length: 16 }).map((_, i) => {
    const angle = (360 / 16) * i;
    // Longueur asymétrique : plus longs en haut (proche de 0°) qu'en bas (proche de 180°)
    const rad = (angle * Math.PI) / 180;
    const outer = 38 + 6 * Math.cos(rad); // max 44 (top), min 32 (bottom)
    const inner = 20;
    const width = 5.5; // 5-6 units
    const h = outer - inner;
    
    return (
      <Rect
        key={i}
        x={-width / 2}
        y={-outer}
        width={width}
        height={h}
        rx={width / 2}
        fill="url(#kalyxGold)"
        transform={`rotate(${angle} 0 0)`}
      />
    );
  });

  return (
    <Svg width={size} height={size} viewBox="-50 -50 100 100">
      <Defs>
        <LinearGradient id="kalyxGold" x1="0" y1="-1" x2="0" y2="1">
          <Stop offset="0" stopColor="#DDB565" />
          <Stop offset="1" stopColor="#B8863A" />
        </LinearGradient>
      </Defs>
      
      <G>
        {segments}
      </G>
      <Circle cx={0} cy={0} r={8} fill="url(#kalyxGold)" />
    </Svg>
  );
}
