/**
 * Kalyx — Wrapper audio unifié.
 *
 * Joue les sons d'état (succès, envoi) via `expo-audio` (SDK 57+).
 * Respecte :
 * 1. Le mode silencieux du téléphone.
 * 2. Un futur réglage "Sons" dans l'app (flag `shouldPlaySound`).
 */

import { useSettings } from './settingsStore';
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let audioInitialized = false;
const players: Record<string, any> = {};

async function initAudio() {
  if (audioInitialized) return;
  audioInitialized = true;
  try {
    await setAudioModeAsync({
      // iOS : le commutateur silencieux est respecté (un wallet ne sonne pas en réunion).
      // Android n'a pas d'équivalent : comportement inchangé.
      playsInSilentMode: Platform.OS !== 'ios',
      // Un son d'état ne coupe jamais la musique ou un podcast en cours.
      interruptionMode: 'mixWithOthers',
    });
  } catch {}
}

void initAudio();

/**
 * Joue un fichier audio (fire-and-forget).
 * Le son est chargé une seule fois puis réutilisé.
 */
async function play(source: any, key: string) {
  if (!useSettings.getState().soundEnabled) return;

  try {
    if (!players[key]) {
      const player = createAudioPlayer(source);
      players[key] = player;
    }
    
    // Rembobiner au début puis jouer
    const p = players[key];
    p.seekTo(0);
    p.play();
  } catch (e) {
    // Echec silencieux (pas critique pour l'UX).
  }
}

export const sound = {
  /** Transaction confirmée — triptyque succès. */
  success: () => void play(require('../assets/sounds/success.mp3'), 'success'),

  /** Envoi lancé (redirigé vers success.mp3 selon la demande de l'utilisateur). */
  send: () => void play(require('../assets/sounds/success.mp3'), 'success'),
} as const;
