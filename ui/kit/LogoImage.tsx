/**
 * LogoImage — image ronde d'un logo : le SVG embarqué d'un réseau si `uri`
 * en désigne un (`chainIconUrl` → « kalyx-chain:… »), sinon l'image distante.
 *
 * Tout écran qui affiche une URL susceptible de venir de `chainIconUrl` passe
 * par ici : un <Image> nu ne sait pas lire « kalyx-chain:… » et resterait vide.
 */
import React, { memo } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { embeddedChainLogo } from '../../src';

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
  const source = { uri };
  return <Image source={source} onError={onError} style={[box, style]} accessibilityIgnoresInvertColors />;
});
