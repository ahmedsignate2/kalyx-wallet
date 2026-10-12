/**
 * Monogramme : 1 à 3 lettres centrées dans un disque (logo de repli d'une dApp,
 * d'un jeton sans image, d'un portefeuille).
 *
 * POURQUOI UN COMPOSANT : sur iOS, les lettres étaient ROGNÉES. General Sans a
 * une hauteur naturelle de 1,25 × la taille (ascendante 1,01) ; un interligne
 * plus serré (×1,2 ici, ×1,19 dans TokenIcon) coupe le haut du glyphe. Et la
 * taille de texte système (Réglages › Luminosité › Taille du texte) agrandissait
 * la lettre au-delà du disque, que son parent découpe. Un logo est une image :
 * il ne suit pas la taille de texte, et son interligne couvre la police entière.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { fontWeight, radii } from '../tokens';

/** Interligne sûr pour General Sans (hauteur naturelle 1,25 + marge). */
const SAFE_LINE = 1.35;

export function Monogram({
  label,
  size,
  bg,
  fg,
  radius = radii.full,
  style,
}: {
  label: string;
  size: number;
  bg: string;
  fg: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const text = label || '?';
  const fontSize = Math.max(8, Math.round(size * (text.length > 2 ? 0.3 : text.length > 1 ? 0.36 : 0.44)));
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={{ fontSize, lineHeight: Math.ceil(fontSize * SAFE_LINE), fontFamily: fontWeight.semibold, color: fg, textAlign: 'center', includeFontPadding: false }}
      >
        {text}
      </Text>
    </View>
  );
}
