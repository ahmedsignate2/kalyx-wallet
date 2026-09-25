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
import { clearPendingIntent, flushPendingIntent } from '../lib/paymentIntent';
import { SPLASH_LOGO_SIZE, SPLASH_LOGO_LIFT } from '../ui/Splash';

export default function Index() {
  const { colors } = useTheme();
  const ready = useWallet((s) => s.ready);
  const hasWallet = useWallet((s) => s.hasWallet);
  const isUnlocked = useWallet((s) => s.isUnlocked);

  useEffect(() => {
    if (!ready) return;
    /*
     * Sort de l'attente une intention de paiement arrivée pendant le démarrage
     * (cf. lib/paymentIntent). Ici seulement, car c'est le premier endroit où
     * l'état du coffre est vraiment connu : sans portefeuille on l'oublie, déjà
     * déverrouillé on la joue, sinon `app/unlock.tsx` s'en charge après le PIN.
     */
    if (!hasWallet) {
      clearPendingIntent();
      router.replace('/welcome');
    } else if (!isUnlocked) router.replace('/unlock');
    else {
      router.replace('/home');
      flushPendingIntent();
    }
  }, [ready, hasWallet, isUnlocked]);

  /*
   * On ne prolonge le logo du splash QUE si un splash a effectivement joué —
   * c'est-à-dire pour un utilisateur qui revient. Au premier lancement il n'y
   * en a pas eu (app/_layout.tsx) et c'est l'écran de bienvenue qui allume le
   * logo : en poser un ici, à une autre position, ferait clignoter la marque.
   */
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      {ready && hasWallet ? (
        <View style={{ marginBottom: SPLASH_LOGO_LIFT * 2 }}>
          <KalyxLogo size={SPLASH_LOGO_SIZE} />
        </View>
      ) : null}
    </View>
  );
}
