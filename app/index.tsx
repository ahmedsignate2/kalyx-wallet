/**
 * Écran de routage : redirige selon l'état (wallet ? verrouillé ?).
 *
 * Il n'affiche PLUS de roue générique. C'était le trou de la séquence de
 * lancement : le splash allumait le logo, puis un spinner système apparaissait,
 * puis Welcome rallumait le logo. Trois moments, dont un mort.
 *
 * Désormais cet écran pose le logo DÉJÀ ALLUMÉ, à la taille et à la position
 * exactes qu'il occupe sur le splash (constantes partagées avec ui/Splash.tsx).
 * Le splash s'efface par-dessus et ne révèle rien d'autre que lui-même : la
 * marque ne bouge pas d'un pixel pendant toute l'attente du déverrouillage du
 * coffre. Aucune animation ici — l'allumage a déjà eu lieu, le rejouer serait
 * un tic (doctrine §1 : une animation répond à une action).
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useWallet } from '../lib/walletStore';
import { useTheme } from '../ui/theme';
import { KalyxLogo } from '../ui/KalyxLogo';
import { SPLASH_LOGO_SIZE, SPLASH_LOGO_LIFT } from '../ui/Splash';

export default function Index() {
  const { colors } = useTheme();
  const ready = useWallet((s) => s.ready);
  const hasWallet = useWallet((s) => s.hasWallet);
  const isUnlocked = useWallet((s) => s.isUnlocked);

  useEffect(() => {
    if (!ready) return;
    if (!hasWallet) router.replace('/welcome');
    else if (!isUnlocked) router.replace('/unlock');
    else router.replace('/home');
  }, [ready, hasWallet, isUnlocked]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ marginBottom: SPLASH_LOGO_LIFT * 2 }}>
        <KalyxLogo size={SPLASH_LOGO_SIZE} />
      </View>
    </View>
  );
}
