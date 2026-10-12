/**
 * Interdit captures et enregistrements d'écran tant que l'écran est affiché
 * (FLAG_SECURE sur Android). Les écrans qui AFFICHENT la phrase le faisaient ;
 * ceux où on la TAPE (import, vérification) et ceux des mots de passe de
 * sauvegarde, non — un enregistreur d'écran la captait à la saisie.
 *
 * iOS : JAMAIS `preventScreenCaptureAsync`. expo-screen-capture y « bloque » les
 * captures en détachant la couche de la fenêtre principale pour la ré-accrocher
 * sous un UITextField sécurisé ; sur les iOS récents, l'app entière devient
 * alors noire (constaté dès l'écran de sauvegarde, juste après « Créer un
 * wallet »). iOS ne sait donc PAS bloquer ici ; on y fait ce qui est possible :
 *  - flou du sélecteur d'apps tant que l'écran est monté, MÊME si l'écran de
 *    confidentialité est coupé dans les réglages (sinon la vignette montrait la
 *    phrase en clair) — compteur partagé avec ui/PrivacyScreen ;
 *  - avertissement après une capture (`screenshotWarning`), que le système
 *    signale sans permission : on ne peut pas l'empêcher, mais on peut dire
 *    tout de suite qu'il faut la supprimer.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { toast } from './toast';
import { translate } from './i18n';
import { useSettings } from './settingsStore';

const SUPPORTED = Platform.OS === 'android';
const IOS = Platform.OS === 'ios';

export function preventCapture(tag: string): void {
  if (SUPPORTED) ScreenCapture.preventScreenCaptureAsync(tag).catch(() => {});
}

export function allowCapture(tag: string): void {
  if (SUPPORTED) ScreenCapture.allowScreenCaptureAsync(tag).catch(() => {});
}

/*
 * Flou du sélecteur d'apps iOS : UN interrupteur natif pour plusieurs
 * demandeurs (l'écran de confidentialité global, chaque écran de secret). Sans
 * compteur, quitter l'écran de la phrase coupait la protection posée par les
 * réglages — et couper la garde dans les réglages pendant qu'une phrase est
 * affichée la découvrait.
 */
let switcherHolds = 0;

/** Demande le flou iOS du sélecteur d'apps ; rend la fonction qui le relâche (idempotente). */
export function holdAppSwitcherProtection(): () => void {
  if (!IOS) return () => {};
  if (switcherHolds++ === 0) ScreenCapture.enableAppSwitcherProtectionAsync(0.9).catch(() => {});
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--switcherHolds === 0) ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
  };
}

export function useNoScreenCapture(
  tag: string,
  enabled = true,
  opts?: { /** iOS : avertir après une capture (écrans qui AFFICHENT un secret). */ screenshotWarning?: boolean },
): void {
  const warn = !!opts?.screenshotWarning;
  useEffect(() => {
    if (!enabled) return;
    preventCapture(tag);
    const release = holdAppSwitcherProtection();
    let sub: { remove: () => void } | null = null;
    if (IOS && warn) {
      try {
        sub = ScreenCapture.addScreenshotListener(() => {
          const lang = useSettings.getState().language;
          toast.warning(translate(lang, 'screenshotDetectedTitle'), translate(lang, 'screenshotDetectedBody'));
        });
      } catch {
        sub = null; // module natif absent (ancien build) : le flou reste, sans l'avertissement
      }
    }
    return () => {
      sub?.remove();
      release();
      allowCapture(tag);
    };
  }, [tag, enabled, warn]);
}
