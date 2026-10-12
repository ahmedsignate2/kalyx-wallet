/**
 * BIOMÉTRIE : UNE seule entrée par appareil — le PIN de l'app, gardé par l'OS.
 *
 * Avant, chaque portefeuille avait SA copie biométrique de la phrase (et en
 * pratique seul le portefeuille d'activation en avait une) : exporter trois
 * portefeuilles demandait jusqu'à quatre gestes puis échouait, et changer de
 * portefeuille actif rendait la biométrie « non activée ». Désormais un geste
 * rend le PIN, et le PIN ouvre TOUS les coffres par le chemin ordinaire
 * (`decryptSecret(vault, pin)`).
 *
 * Mêmes protections que l'ancienne copie (lib/secureStore.ts, `gatedOpts`) :
 * `requireAuthentication` (empreinte ou visage exigés par le système avant de
 * rendre la valeur ; clé Keystore / Secure Enclave invalidée à l'ajout d'une
 * biométrie), lisible seulement sur CET appareil déverrouillé, jamais dans une
 * sauvegarde iCloud/Google. Le témoin, lui, se lit SANS invite : il dit s'il y a
 * quelque chose à demander.
 *
 * Session leurre (code de contrainte) : rien n'est lu ni écrit ici — en plus du
 * pare-feu de lib/kv.ts, qui bloque déjà ces deux clés (sessionMode).
 *
 * Le PIN n'est JAMAIS journalisé.
 */
import { KV_DEVICE_ONLY, kvDel, kvGet, kvSet } from './kv';
import { isDecoySession } from './sessionMode';

// Préfixe `nova.` comme les autres clés du trousseau (identifiants internes, jamais affichés).
const K_BIO_PIN = 'nova.bioPinG';
const K_BIO_PIN_FLAG = 'nova.bioPinFlag';

/** Options de l'entrée protégée — identiques à `gatedOpts` de la copie par portefeuille. */
const gatedOpts = (prompt?: string) => ({
  ...KV_DEVICE_ONLY,
  requireAuthentication: true,
  ...(prompt ? { authenticationPrompt: prompt } : {}),
});

/** Le PIN biométrique est-il enregistré ? Sans invite ; toujours faux en session leurre. */
export async function hasBiometricPin(): Promise<boolean> {
  if (isDecoySession()) return false;
  try {
    return (await kvGet(K_BIO_PIN_FLAG, KV_DEVICE_ONLY)) === '1';
  } catch {
    return false;
  }
}

/**
 * Écrit le PIN sous protection biométrique, puis le témoin. Android demande le
 * geste à l'écriture ; iOS non. LÈVE si l'OS refuse : rien n'est alors activé
 * (le témoin n'est écrit qu'après l'entrée).
 */
export async function writeBiometricPin(pin: string, prompt?: string): Promise<void> {
  if (isDecoySession()) return;
  await kvSet(K_BIO_PIN, pin, gatedOpts(prompt));
  await kvSet(K_BIO_PIN_FLAG, '1', KV_DEVICE_ONLY);
}

/**
 * Lit le PIN : UNE invite du système.
 *  - `null` : clé invalidée (empreinte ajoutée, nouveau build) ou entrée absente
 *    → le témoin est effacé ; `healBiometric` la réécrira au prochain PIN.
 *  - LÈVE si l'utilisateur annule : l'entrée reste intacte.
 */
export async function readBiometricPinRaw(prompt?: string): Promise<string | null> {
  if (isDecoySession()) return null;
  const pin = await kvGet(K_BIO_PIN, gatedOpts(prompt));
  if (pin == null) await kvDel(K_BIO_PIN_FLAG, KV_DEVICE_ONLY).catch(() => {});
  return pin;
}

/** Efface l'entrée et son témoin (témoin d'abord : plus rien ne sera demandé). */
export async function clearBiometricPin(): Promise<void> {
  if (isDecoySession()) return;
  await kvDel(K_BIO_PIN_FLAG, KV_DEVICE_ONLY).catch(() => {});
  await kvDel(K_BIO_PIN, gatedOpts()).catch(() => {});
}

/**
 * L'écriture protégée se fait-elle SANS geste ? Vrai sur iOS seulement
 * (Android demande l'empreinte pour chiffrer avec la clé du Keystore). En cas
 * de doute : faux — on n'affiche jamais une invite inattendue.
 */
export function biometricWriteIsSilent(): boolean {
  try {
    const rn = require('react-native') as { Platform?: { OS?: string } };
    return rn.Platform?.OS === 'ios';
  } catch {
    return false;
  }
}
