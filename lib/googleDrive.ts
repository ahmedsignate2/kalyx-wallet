/**
 * Google Drive comme coffre PASSIF — flux OAuth qui survit à un redémarrage.
 *
 * Pourquoi un flux en deux temps : au retour de Google, Android peut relancer
 * l'app (nouvelle instance) ; une promesse « en attente » dans l'écran serait
 * perdue. On persiste donc la session PKCE + l'intention (sauvegarder tel blob
 * chiffré / restaurer) AVANT d'ouvrir le navigateur, et `handleRedirect(url)`
 * — appelé par ui/DeepLinks.tsx pour toute URL entrante — reprend le travail,
 * que l'instance ait survécu ou non.
 *
 * Confidentialité inchangée : portée drive.appdata seule, pas de refresh_token,
 * jeton en variable locale révoqué en `finally`, jamais persisté. Le seul
 * élément persisté temporairement est le blob DÉJÀ CHIFFRÉ (scrypt + AES-GCM)
 * pour une sauvegarde en cours, effacé dès l'envoi ou après 10 min.
 *
 * Prérequis : EXPO_PUBLIC_GOOGLE_CLIENT_ID (client OAuth Android/iOS, .env.example)
 * + schéma inversé déclaré dans app.config.ts + « Activer le schéma d'URI
 * personnalisé » coché sur le client dans la console Google.
 */
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  buildAuthUrl,
  createPkceSession,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  parseRedirect,
  tokenRequestBody,
} from '../src/domain/backup/oauthPkce';
import { downloadBackup, findBackup, uploadBackup } from '../src/domain/backup/drive';
import { useSettings } from './settingsStore';

export const GOOGLE_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();

/** Vrai si l'app a été configurée (et donc construite) avec un client Google. */
export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
}

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'cancelled' | 'timeout' | 'denied' | 'exchange_failed',
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

/* ------------------------------------------------------------------ */
/* Jeton éphémère                                                      */
/* ------------------------------------------------------------------ */

async function exchangeCode(clientId: string, code: string, verifier: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenRequestBody(clientId, code, verifier),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleAuthError(`Échange du code impossible (${data.error ?? res.status}).`, 'exchange_failed');
  }
  return data.access_token;
}

/** Révocation côté Google : le jeton ne vaut plus rien, même s'il fuitait. Jamais bloquant. */
async function revoke(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    /* hors ligne : le jeton expire seul en ~1 h ; il n'a été conservé nulle part */
  }
}

/** Exécute `fn` avec un jeton éphémère, puis le révoque et l'oublie. */
async function withToken<T>(code: string, verifier: string, fn: (token: string) => Promise<T>): Promise<T> {
  let token: string | null = await exchangeCode(GOOGLE_CLIENT_ID, code, verifier);
  try {
    return await fn(token);
  } finally {
    const t = token;
    token = null;
    await revoke(t);
  }
}

/* ------------------------------------------------------------------ */
/* Flux persistant                                                     */
/* ------------------------------------------------------------------ */

export type DriveIntent = { kind: 'save'; blob: string } | { kind: 'restore' } | { kind: 'check' };

interface Pending {
  verifier: string;
  state: string;
  intent: DriveIntent;
  createdAt: number;
}

const PENDING_KEY = 'kalyx.drive.pending';
const RESULT_KEY = 'kalyx.drive.result';
const PENDING_TTL_MS = 10 * 60_000;

export type DriveStatus = 'idle' | 'auth' | 'working' | 'done' | 'error';

export interface RestoreResult {
  modifiedTime: string;
  /** Enveloppe chiffrée (JSON) — inutile sans le mot de passe. */
  text: string;
}

interface DriveFlowState {
  /** Écran à ouvrir après déverrouillage (app relancée par le retour de Google, wallet verrouillé). */
  returnTo: '/cloud-backup' | null;
  setReturnTo: (r: '/cloud-backup' | null) => void;
  status: DriveStatus;
  kind: DriveIntent['kind'] | null;
  error: string | null;
  /** Résultat d'une restauration : sauvegarde trouvée (ou null = aucune). */
  restoreResult: RestoreResult | null | undefined;
  /** Résultat d'une vérification : date de la sauvegarde Drive (null = aucune). */
  checkResult: string | null | undefined;
  /** Lance un flux : persiste la session puis ouvre Google. */
  start: (intent: DriveIntent) => Promise<void>;
  /** À appeler pour toute URL entrante ; renvoie true si c'était un retour OAuth. */
  handleRedirect: (url: string) => Promise<boolean>;
  /** Recharge un résultat laissé par une instance précédente (démarrage). */
  load: () => Promise<void>;
  reset: () => void;
}

export const useDriveFlow = create<DriveFlowState>((set, get) => ({
  returnTo: null,
  setReturnTo: (returnTo) => set({ returnTo }),
  status: 'idle',
  kind: null,
  error: null,
  restoreResult: undefined,
  checkResult: undefined,

  start: async (intent) => {
    if (!isDriveConfigured()) {
      set({ status: 'error', kind: intent.kind, error: 'not_configured' });
      return;
    }
    const session = createPkceSession();
    const pending: Pending = { verifier: session.verifier, state: session.state, intent, createdAt: Date.now() };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    set({ status: 'auth', kind: intent.kind, error: null, restoreResult: undefined, checkResult: undefined });
    await Linking.openURL(buildAuthUrl(GOOGLE_CLIENT_ID, session));
  },

  handleRedirect: async (url) => {
    if (!isDriveConfigured()) return false;
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return false;
    let pending: Pending;
    try {
      pending = JSON.parse(raw) as Pending;
    } catch {
      await AsyncStorage.removeItem(PENDING_KEY);
      return false;
    }
    const parsed = parseRedirect(url, { clientId: GOOGLE_CLIENT_ID, state: pending.state });
    if (!parsed) return false; // pas un retour OAuth (autre deep link)
    await AsyncStorage.removeItem(PENDING_KEY);
    const { intent } = pending;
    if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
      set({ status: 'error', kind: intent.kind, error: 'timeout' });
      return true;
    }
    if ('error' in parsed) {
      set({ status: 'error', kind: intent.kind, error: parsed.error === 'access_denied' ? 'denied' : parsed.error });
      return true;
    }
    set({ status: 'working', kind: intent.kind, error: null });
    try {
      if (intent.kind === 'save') {
        await withToken(parsed.code, pending.verifier, async (token) => {
          const existing = await findBackup(token);
          await uploadBackup(token, intent.blob, existing?.id ?? null);
        });
        // Source de vérité locale (centre de sécurité, Copilot, écran de sauvegarde) : posée ICI,
        // dès que Drive a accepté le fichier — pas dans un écran qui peut ne plus exister.
        useSettings.getState().markEncryptedBackup('drive');
        set({ status: 'done' });
      } else if (intent.kind === 'restore') {
        const result = await withToken(parsed.code, pending.verifier, async (token) => {
          const info = await findBackup(token);
          if (!info) return null;
          const text = await downloadBackup(token, info.id);
          return { modifiedTime: info.modifiedTime, text } as RestoreResult;
        });
        // Persisté (chiffré) pour survivre à un redémarrage jusqu'à l'écran de restauration.
        await AsyncStorage.setItem(RESULT_KEY, JSON.stringify({ kind: 'restore', result, at: Date.now() }));
        set({ status: 'done', restoreResult: result });
      } else {
        const info = await withToken(parsed.code, pending.verifier, (token) => findBackup(token));
        if (info?.modifiedTime) useSettings.getState().setDriveBackupAt(info.modifiedTime);
        set({ status: 'done', checkResult: info?.modifiedTime ?? null });
      }
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  },

  load: async () => {
    const raw = await AsyncStorage.getItem(RESULT_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { kind: 'restore'; result: RestoreResult | null; at: number };
      if (Date.now() - saved.at < PENDING_TTL_MS) set({ status: 'done', kind: 'restore', restoreResult: saved.result });
    } catch {
      /* ignore */
    }
    await AsyncStorage.removeItem(RESULT_KEY);
  },

  reset: () => {
    set({ status: 'idle', kind: null, error: null, restoreResult: undefined, checkResult: undefined });
    AsyncStorage.removeItem(RESULT_KEY).catch(() => {});
  },
}));
