/**
 * Conteneur qui laisse la place au CLAVIER, sur les deux plateformes.
 *
 * Android 15 impose l'affichage bord à bord : `adjustResize` ne redimensionne
 * plus la fenêtre, et les écrans utilisaient `KeyboardAvoidingView` avec un
 * `behavior` `undefined` sur Android — c'est-à-dire rien. Le clavier recouvrait
 * les champs du bas, les boutons « Continuer », le mémo, la confirmation du
 * mot de passe… Seul le navigateur avait été corrigé (cf. useKeyboardHeight).
 *
 * Ici : iOS garde `KeyboardAvoidingView` (« padding »), Android réserve en bas
 * la hauteur du clavier. Le contenu rétrécit au-dessus ; un ScrollView à
 * l'intérieur fait alors défiler le champ touché dans la partie visible.
 */
import React from 'react';
import { KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useKeyboardHeight } from './useKeyboardHeight';

export function KeyboardAvoid({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const kb = useKeyboardHeight();
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={style} behavior="padding">
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={[style, { paddingBottom: kb }]}>{children}</View>;
}
