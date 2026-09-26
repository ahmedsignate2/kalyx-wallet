/**
 * Hauteur du clavier logiciel, en points, ou 0 s'il est fermé.
 *
 * POURQUOI CE CROCHET EXISTE. Depuis Android 15 — donc depuis Expo SDK 54 —
 * l'affichage bord à bord est imposé et ne peut plus être désactivé. Or dans ce
 * mode `android:windowSoftInputMode="adjustResize"` ne redimensionne PLUS la
 * fenêtre : une barre ancrée en bas reste sous le clavier, quoi qu'on ait mis
 * dans `softwareKeyboardLayoutMode`. C'est ce qui cachait la barre d'adresse du
 * navigateur dès qu'on la touchait.
 *
 * `KeyboardAvoidingView` ne réglait rien non plus : son `behavior` valait
 * `undefined` sur Android, c'est-à-dire aucun comportement.
 *
 * On écoute donc les événements du clavier et on laisse l'appelant décider quoi
 * décaler — c'est lui qui sait s'il doit aussi renoncer à la marge de sécurité
 * du bas, qui n'a plus de sens quand le clavier occupe la place.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    /*
     * `will*` sur iOS, `did*` sur Android : iOS annonce le clavier avant de
     * l'animer, ce qui permet de suivre le mouvement ; Android n'émet
     * `willShow` que de façon inconstante, et s'y fier y produirait des sauts.
     */
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
