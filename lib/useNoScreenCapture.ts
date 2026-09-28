/**
 * Interdit captures et enregistrements d'écran tant que l'écran est affiché
 * (FLAG_SECURE sur Android). Les écrans qui AFFICHENT la phrase le faisaient ;
 * ceux où on la TAPE (import, vérification) et ceux des mots de passe de
 * sauvegarde, non — un enregistreur d'écran la captait à la saisie.
 */
import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

export function useNoScreenCapture(tag: string): void {
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync(tag).catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(tag).catch(() => {});
    };
  }, [tag]);
}
