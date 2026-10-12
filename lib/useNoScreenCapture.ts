/**
 * Interdit captures et enregistrements d'écran tant que l'écran est affiché
 * (FLAG_SECURE sur Android). Les écrans qui AFFICHENT la phrase le faisaient ;
 * ceux où on la TAPE (import, vérification) et ceux des mots de passe de
 * sauvegarde, non — un enregistreur d'écran la captait à la saisie.
 *
 * iOS : AUCUN appel natif. expo-screen-capture y « bloque » les captures en
 * détachant la couche de la fenêtre principale pour la ré-accrocher sous un
 * UITextField sécurisé ; sur les iOS récents, l'app entière devient alors
 * noire (constaté dès l'écran de sauvegarde, juste après « Créer un wallet »).
 * Le sélecteur d'apps reste masqué par la protection posée dans PrivacyScreen.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

const SUPPORTED = Platform.OS === 'android';

export function preventCapture(tag: string): void {
  if (SUPPORTED) ScreenCapture.preventScreenCaptureAsync(tag).catch(() => {});
}

export function allowCapture(tag: string): void {
  if (SUPPORTED) ScreenCapture.allowScreenCaptureAsync(tag).catch(() => {});
}

export function useNoScreenCapture(tag: string, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    preventCapture(tag);
    return () => allowCapture(tag);
  }, [tag, enabled]);
}
