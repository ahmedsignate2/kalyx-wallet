/**
 * LogoImage — image d'un logo : le SVG embarqué d'un réseau si `uri` en
 * désigne un (`chainIconUrl` → « kalyx-chain:… »), sinon l'image distante.
 *
 * Tout écran qui affiche une URL susceptible de venir de `chainIconUrl` passe
 * par ici : un <Image> nu ne sait pas lire « kalyx-chain:… » et resterait vide.
 *
 * LOGOS DISTANTS SUR iOS — ils restaient vides ou incomplets :
 *  - un <Image> ne lit PAS le SVG (format courant des icônes de dApp et de
 *    certaines listes de jetons) → rendu par react-native-svg, feuilles de
 *    style comprises (SvgCssUri : SvgUri ignorait les <style>, d'où des
 *    logos à moitié dessinés) ;
 *  - App Transport Security bloque le `http://` → passé en `https://` ;
 *  - `ipfs://` n'est pas une URL chargeable → passerelle publique.
 */
import { memo } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { SvgCssUri } from 'react-native-svg/css';
import { embeddedChainLogo } from '../../src';
import { displayableLogoUri, isSvgUri } from '../../lib/logoUri';

export { displayableLogoUri, isSvgUri };

export const LogoImage = memo(function LogoImage({
  uri,
  size,
  radius = size / 2,
  style,
  onError,
}: {
  uri: string;
  size: number;
  radius?: number;
  style?: StyleProp<ImageStyle>;
  onError?: () => void;
}) {
  const svg = embeddedChainLogo(uri);
  const box = { width: size, height: size, borderRadius: radius, overflow: 'hidden' as const };
  /*
   * SvgXml PARTOUT, web compris. Sur le web, l'<Image> en data-URI restait
   * vide (le chargement d'image de react-native-web échouait) : la pastille
   * du réseau et les logos natifs du tableau de bord web n'apparaissaient pas.
   */
  if (svg) {
    return (
      <View style={[box, style as never]} accessibilityIgnoresInvertColors>
        <SvgXml xml={svg} width={size} height={size} />
      </View>
    );
  }
  const src = displayableLogoUri(uri);
  if (isSvgUri(src)) {
    return (
      <View style={[box, style as never]} accessibilityIgnoresInvertColors>
        <SvgCssUri uri={src} width={size} height={size} onError={onError} />
      </View>
    );
  }
  const source = { uri: src };
  return <Image source={source} onError={onError} resizeMode="cover" style={[box, style]} accessibilityIgnoresInvertColors />;
});
