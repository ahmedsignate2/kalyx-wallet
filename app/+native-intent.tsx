/**
 * LIENS EXTERNES : aucun ne mène directement à un écran.
 *
 * Sans ce fichier, expo-router ouvrait tel quel tout `kalyx://<écran>?…` reçu
 * d'un site, d'un message ou d'un QR : `kalyx://send?to=…&contract=…&symbol=USDC
 * &decimals=…` arrivait sur l'écran d'envoi avec un jeton, un nom et des
 * décimales choisis par l'auteur du lien — sans la vérification on-chain que
 * fait `lib/paymentIntent`. Un lien vers l'accueil (`kalyx://?v=2…` de TON
 * Connect, `kalyx://wc`) remplaçait aussi l'écran en cours.
 *
 * Tous les liens sont lus par `ui/DeepLinks`, qui les analyse et les mène à un
 * écran de confirmation vérifié. Le routeur, lui, n'en suit aucun : au
 * démarrage à froid on part de `/` (qui décide accueil / déverrouillage),
 * ensuite on reste où l'on est.
 */
export function redirectSystemPath({ initial }: { path: string; initial: boolean }): string | null {
  return initial ? '/' : null;
}
