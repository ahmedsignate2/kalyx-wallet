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
 * pour une sauvegarde en cours : effacé après un envoi VÉRIFIÉ, une erreur
 * définitive ou un abandon, et dans tous les cas après 15 min (contrôlé aussi
 * au démarrage). Une coupure réseau ne l'efface PAS : on réessaie sans
 * redemander le mot de passe.
 *
 * GARDE D'ÉCRASEMENT — pourquoi une seconde connexion Google en cas de conflit.
 * Le contrôle (le fichier en ligne vient-il d'un autre téléphone, contient-il
 * plus de portefeuilles ?) se fait dans la session de jeton de l'envoi, juste
 * avant d'écrire : c'est le seul moment où l'état distant est sûr. En cas de
 * conflit, rien n'est écrit, le jeton est révoqué comme toujours, et la
 * confirmation relance UNE nouvelle connexion. Les alternatives ont été
 * écartées : garder le jeton vivant pendant que l'utilisateur hésite le ferait
 * survivre à l'opération (et il serait de toute façon perdu à un redémarrage) ;
 * demander la confirmation AVANT l'OAuth sur la foi d'une lecture mémorisée
 * reposerait sur un état périmé. La confirmation est liée à la version vue
 * (id + date) : si un autre appareil réécrit entre-temps, on redemande.
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
import {
  downloadBackup,
  DriveVerifyError,
  findBackup,
  isTransientError,
  readPendingSave,
  revOf,
  saveBackupGuarded,
  type ConflictInfo,
  type KnownRemote,
  type PendingSave,
} from '../src/domain/backup/drive';
import { useSettings } from './settingsStore';
import { getDeviceId } from './deviceId';

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
type DriveKind = DriveIntent['kind'];

/** Session PKCE en attente du retour de Google. Le blob n'y est plus : il vit sous SAVE_KEY. */
interface Pending {
  verifier: string;
  state: string;
  kind: DriveKind;
  createdAt: number;
}

const PENDING_KEY = 'kalyx.drive.pending';
const RESULT_KEY = 'kalyx.drive.result';
/** Blob chiffré d'une sauvegarde en cours (PendingSave) — séparé de la session PKCE pour survivre à un réessai. */
const SAVE_KEY = 'kalyx.drive.save';
/** Dernière version Drive écrite ou restaurée PAR CET APPAREIL (KnownRemote). */
const KNOWN_KEY = 'kalyx.drive.known';
const PENDING_TTL_MS = 15 * 60_000;

export type DriveStatus = 'idle' | 'auth' | 'working' | 'done' | 'error' | 'conflict';

export interface RestoreResult {
  modifiedTime: string;
  /** Enveloppe chiffrée (JSON) — inutile sans le mot de passe. */
  text: string;
  /** Fichier et révision lus : mémorisés si la restauration aboutit (garde d'écrasement). */
  fileId?: string;
  rev?: number;
}

interface DriveFlowState {
  /** Écran à ouvrir après déverrouillage (app relancée par le retour de Google, wallet verrouillé). */
  returnTo: '/cloud-backup' | null;
  setReturnTo: (r: '/cloud-backup' | null) => void;
  status: DriveStatus;
  kind: DriveKind | null;
  /** Code (`not_configured`, `denied`, `timeout`, `network`, `verify`) ou message brut. */
  error: string | null;
  /** Sauvegarde refusée faute de confirmation : ce qu'il y a en ligne. */
  conflict: ConflictInfo | null;
  /** Vrai si le blob chiffré est encore là : réessayer ne redemande pas le mot de passe. */
  canRetry: boolean;
  /** Résultat d'une restauration : sauvegarde trouvée (ou null = aucune). */
  restoreResult: RestoreResult | null | undefined;
  /** Résultat d'une vérification : date de la sauvegarde Drive (null = aucune). */
  checkResult: string | null | undefined;
  /** Lance un flux : persiste la session puis ouvre Google. */
  start: (intent: DriveIntent) => Promise<void>;
  /** Relance l'envoi du blob gardé (après une coupure réseau). */
  retrySave: () => Promise<void>;
  /** L'utilisateur accepte de remplacer la version en ligne vue lors du conflit. */
  confirmOverwrite: () => Promise<void>;
  /** À appeler pour toute URL entrante ; renvoie true si c'était un retour OAuth. */
  handleRedirect: (url: string) => Promise<boolean>;
  /** Recharge un résultat laissé par une instance précédente (démarrage) ; purge ce qui a expiré. */
  load: () => Promise<void>;
  /** Acquitte / abandonne : une sauvegarde en cours est OUBLIÉE (blob et session effacés). */
  reset: () => void;
}

async function readSave(): Promise<PendingSave | null> {
  const rec = readPendingSave(await AsyncStorage.getItem(SAVE_KEY), Date.now());
  if (!rec) await AsyncStorage.removeItem(SAVE_KEY); // expiré ou illisible : purgé tout de suite
  return rec;
}

async function writeSave(rec: PendingSave): Promise<void> {
  await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(rec));
}

async function readKnown(): Promise<KnownRemote | null> {
  try {
    const k = JSON.parse((await AsyncStorage.getItem(KNOWN_KEY)) ?? 'null') as KnownRemote | null;
    return k && typeof k.id === 'string' && typeof k.rev === 'number' ? k : null;
  } catch {
    return null;
  }
}

/**
 * À appeler quand une sauvegarde Drive a été DÉCHIFFRÉE ici : cet appareil en
 * connaît désormais le contenu, la remplacer plus tard n'exige plus de
 * confirmation (tant qu'elle ne contient pas plus de portefeuilles qu'ici).
 */
export function rememberRestored(result: RestoreResult | null | undefined): void {
  if (!result?.fileId || result.rev === undefined) return;
  AsyncStorage.setItem(KNOWN_KEY, JSON.stringify({ id: result.fileId, rev: result.rev })).catch(() => {});
}

export const useDriveFlow = create<DriveFlowState>((set, get) => {
  /** Nouvelle session PKCE, persistée AVANT d'ouvrir le navigateur. */
  const openAuth = async (kind: DriveKind) => {
    const session = createPkceSession();
    const pending: Pending = { verifier: session.verifier, state: session.state, kind, createdAt: Date.now() };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    set({ status: 'auth', kind, error: null, conflict: null, canRetry: false, restoreResult: undefined, checkResult: undefined });
    await Linking.openURL(buildAuthUrl(GOOGLE_CLIENT_ID, session));
  };

  /** Envoi gardé + vérifié. Le blob n'est effacé qu'après succès ou erreur définitive. */
  const runSave = async (code: string, verifier: string) => {
    const rec = await readSave();
    if (!rec) {
      set({ status: 'error', error: 'timeout', canRetry: false });
      return;
    }
    try {
      const deviceId = await getDeviceId();
      const known = await readKnown();
      const r = await withToken(code, verifier, (token) =>
        saveBackupGuarded(token, { content: rec.blob, deviceId, known, accept: rec.accept }),
      );
      if (r.kind === 'conflict') {
        // Rien n'a été écrit. Le blob reste (dans sa limite de 15 min) pour la confirmation.
        await writeSave({ blob: rec.blob, createdAt: rec.createdAt, conflict: r.conflict });
        set({ status: 'conflict', conflict: r.conflict, canRetry: true });
        return;
      }
      await AsyncStorage.removeItem(SAVE_KEY);
      await AsyncStorage.setItem(KNOWN_KEY, JSON.stringify({ id: r.id, rev: r.rev } satisfies KnownRemote));
      // Source de vérité locale (centre de sécurité, Copilot, écran de sauvegarde) : posée ICI,
      // une fois le fichier VÉRIFIÉ sur Drive — pas dans un écran qui peut ne plus exister.
      useSettings.getState().markEncryptedBackup('drive');
      set({ status: 'done', canRetry: false });
    } catch (e) {
      if (isTransientError(e)) {
        // Coupure réseau : le blob est gardé, l'utilisateur réessaie sans ressaisir son mot de passe.
        await writeSave({ blob: rec.blob, createdAt: rec.createdAt, accept: rec.accept, failed: 'network' }).catch(() => {});
        set({ status: 'error', error: 'network', canRetry: true });
        return;
      }
      await AsyncStorage.removeItem(SAVE_KEY).catch(() => {});
      set({ status: 'error', error: e instanceof DriveVerifyError ? 'verify' : e instanceof Error ? e.message : String(e), canRetry: false });
    }
  };

  /** Relance l'OAuth pour le blob gardé, avec un éventuel changement (acceptation). */
  const resumeSave = async (patch: (rec: PendingSave) => PendingSave) => {
    if (!isDriveConfigured()) {
      set({ status: 'error', kind: 'save', error: 'not_configured', canRetry: false });
      return;
    }
    const rec = await readSave();
    if (!rec) {
      set({ status: 'error', kind: 'save', error: 'timeout', conflict: null, canRetry: false });
      return;
    }
    await writeSave(patch(rec));
    await openAuth('save');
  };

  return {
    returnTo: null,
    setReturnTo: (returnTo) => set({ returnTo }),
    status: 'idle',
    kind: null,
    error: null,
    conflict: null,
    canRetry: false,
    restoreResult: undefined,
    checkResult: undefined,

    start: async (intent) => {
      if (!isDriveConfigured()) {
        set({ status: 'error', kind: intent.kind, error: 'not_configured' });
        return;
      }
      if (intent.kind === 'save') await writeSave({ blob: intent.blob, createdAt: Date.now() });
      await openAuth(intent.kind);
    },

    retrySave: () => resumeSave((rec) => ({ blob: rec.blob, createdAt: rec.createdAt, accept: rec.accept })),

    confirmOverwrite: () =>
      resumeSave((rec) => ({ blob: rec.blob, createdAt: rec.createdAt, accept: rec.conflict?.accept ?? get().conflict?.accept })),

    handleRedirect: async (url) => {
      if (!isDriveConfigured()) return false;
      const raw = await AsyncStorage.getItem(PENDING_KEY);
      if (!raw) return false;
      let pending: Pending;
      try {
        pending = JSON.parse(raw) as Pending;
        if (pending.kind !== 'save' && pending.kind !== 'restore' && pending.kind !== 'check') throw new Error('format');
      } catch {
        await AsyncStorage.removeItem(PENDING_KEY);
        return false;
      }
      const parsed = parseRedirect(url, { clientId: GOOGLE_CLIENT_ID, state: pending.state });
      if (!parsed) return false; // pas un retour OAuth (autre deep link)
      // État inattendu : lien forgé ou retour d'une ancienne tentative. Ignoré, et SURTOUT
      // sans effacer la session : le vrai retour de Google doit encore pouvoir aboutir.
      if ('error' in parsed && parsed.error === 'state_mismatch') return true;
      await AsyncStorage.removeItem(PENDING_KEY); // le code est à usage unique
      const { kind } = pending;
      if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
        if (kind === 'save') await AsyncStorage.removeItem(SAVE_KEY);
        set({ status: 'error', kind, error: 'timeout', canRetry: false });
        return true;
      }
      if ('error' in parsed) {
        // Refus ou annulation chez Google : abandon explicite, le blob n'a plus de raison d'être.
        if (kind === 'save') await AsyncStorage.removeItem(SAVE_KEY);
        set({ status: 'error', kind, error: parsed.error === 'access_denied' ? 'denied' : parsed.error, canRetry: false });
        return true;
      }
      set({ status: 'working', kind, error: null });
      if (kind === 'save') {
        await runSave(parsed.code, pending.verifier);
        return true;
      }
      try {
        if (kind === 'restore') {
          const result = await withToken(parsed.code, pending.verifier, async (token) => {
            const info = await findBackup(token);
            if (!info) return null;
            const text = await downloadBackup(token, info.id);
            return { modifiedTime: info.modifiedTime, text, fileId: info.id, rev: revOf(info) } as RestoreResult;
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
      // Session PKCE expirée (OAuth abandonné, app tuée) : purgée, avec le blob qu'elle attendait.
      const rawPending = await AsyncStorage.getItem(PENDING_KEY);
      if (rawPending) {
        let stale = true;
        try {
          stale = Date.now() - (JSON.parse(rawPending) as Pending).createdAt > PENDING_TTL_MS;
        } catch {
          /* illisible : purgé */
        }
        if (stale) await AsyncStorage.removeItem(PENDING_KEY);
      }
      // Blob expiré : purgé. Encore valide après un conflit ou une coupure : on rend la main à l'écran.
      const rec = await readSave();
      if (rec?.conflict) set({ status: 'conflict', kind: 'save', conflict: rec.conflict, canRetry: true });
      else if (rec?.failed === 'network') set({ status: 'error', kind: 'save', error: 'network', canRetry: true });

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
      const { kind, status } = get();
      set({ status: 'idle', kind: null, error: null, conflict: null, canRetry: false, restoreResult: undefined, checkResult: undefined });
      AsyncStorage.removeItem(RESULT_KEY).catch(() => {});
      // Abandon pendant la connexion : la session ne doit plus pouvoir aboutir derrière le dos de l'utilisateur.
      if (status === 'auth') AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
      if (kind === 'save') AsyncStorage.removeItem(SAVE_KEY).catch(() => {});
    },
  };
});
