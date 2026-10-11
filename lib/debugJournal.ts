/**
 * JOURNAL DE DIAGNOSTIC — tout ce qui se passe dans l'app, dans l'ordre.
 *
 * Installé en tout premier (index.js), il enregistre :
 *  - tous les messages de console (log, info, warn, error, debug) ;
 *  - les erreurs JavaScript non rattrapées et les promesses rejetées ;
 *  - les alertes (titre) et le bouton choisi ;
 *  - les passages premier plan / arrière-plan ;
 *  - (branchés depuis app/_layout.tsx) chaque écran, les appuis sur les
 *    boutons du kit, les changements d'état du coffre.
 *
 * JAMAIS la position des touchers : sur un pavé à grille fixe, une suite de
 * coordonnées redonne le code. Les lignes `touch` des anciennes versions
 * sont effacées au chargement.
 *
 * ZÉRO SECRET. Chaque ligne passe par `sanitizeLog` (phrases BIP-39, clés
 * hexadécimales et Base58, champs sensibles) AVANT d'être gardée, et n'est
 * tronquée qu'APRÈS : couper d'abord pourrait laisser passer un morceau de
 * secret que le filtre n'aurait plus reconnu.
 *
 * Gardé en mémoire (3 000 lignes) et recopié dans le stockage de l'app
 * (1 500 dernières) pour survivre à un plantage ou à un redémarrage.
 */
import { isDecoySession } from './sessionMode';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeLog } from './sanitizeLog';

export type JournalKind = 'log' | 'info' | 'warn' | 'error' | 'crash' | 'nav' | 'press' | 'alert' | 'app' | 'state';

export interface JournalLine {
  t: number;
  k: JournalKind;
  m: string;
}

const MAX_MEMORY = 3000;
const MAX_STORED = 1500;
const MAX_LINE = 1200;
const STORE_KEY = 'kalyx.debugJournal.v1';
/**
 * Copie de l'interrupteur « Journal de diagnostic » (la vérité est dans
 * settingsStore → `debugJournalEnabled`). Lue ICI au démarrage, parce que le
 * journal s'installe bien avant que les réglages soient chargés : sans elle,
 * tout le début de session serait enregistré malgré l'interrupteur coupé.
 */
const ENABLED_KEY = 'kalyx.debugJournal.enabled';

/** Interrupteur : coupé, plus rien n'est enregistré (ni en mémoire, ni sur disque). */
let enabled = true;
/** Instant d'installation : les lignes de CETTE session, si l'interrupteur se révèle coupé, sont jetées. */
let installedAt = 0;

let lines: JournalLine[] = [];
let installed = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
/*
 * Garde de RÉENTRANCE, limitée à l'exécution synchrone de `journal` : une ligne
 * produite par le journal lui-même (un abonné qui journalise…) ne boucle pas.
 * L'ancienne garde couvrait toute l'écriture disque, asynchrone : chaque
 * erreur ou plantage survenu pendant ce temps était perdu — les lignes utiles.
 */
let inJournal = false;

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
  } catch {
    return String(v);
  }
}

function scheduleSave(): void {
  if (saveTimer || !enabled) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(lines.slice(-MAX_STORED))).catch(() => {});
  }, 1500);
}

export function journal(k: JournalKind, ...parts: unknown[]): void {
  if (isDecoySession()) return; // session leurre : rien n'est consigné (le journal trahirait les deux coffres)
  if (!enabled) return; // interrupteur coupé : rien n'est consigné
  if (inJournal) return;
  inJournal = true;
  try {
    record(k, parts);
  } finally {
    inJournal = false;
  }
}

function record(k: JournalKind, parts: unknown[]): void {
  let m: string;
  try {
    m = sanitizeLog(parts.map(stringify).join(' '));
  } catch {
    m = '[ligne illisible]';
  }
  if (m.length > MAX_LINE) m = `${m.slice(0, MAX_LINE)}…`;
  lines.push({ t: Date.now(), k, m });
  if (lines.length > MAX_MEMORY) lines = lines.slice(-MAX_MEMORY);
  scheduleSave();
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* un abonné cassé ne doit pas casser le journal */
    }
  }
}

export function journalLines(): JournalLine[] {
  return lines;
}

export function subscribeJournal(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearJournal(): void {
  lines = [];
  void AsyncStorage.removeItem(STORE_KEY).catch(() => {});
  for (const l of listeners) l();
}

export function isJournalEnabled(): boolean {
  return enabled;
}

/**
 * Active ou coupe le journal. Coupé : aucune ligne n'est plus enregistrée, la
 * sauvegarde en attente est annulée. Les lignes déjà présentes restent
 * lisibles (et effaçables) dans l'écran Journal.
 * `persist` : recopie l'état pour le prochain démarrage (jamais en session leurre).
 */
export function setJournalEnabled(on: boolean, persist = true): void {
  if (!on && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (on && !enabled) {
    enabled = true;
    journal('app', 'journal activé');
  } else if (!on && enabled) {
    enabled = false;
  }
  if (persist && !isDecoySession()) void AsyncStorage.setItem(ENABLED_KEY, on ? '1' : '0').catch(() => {});
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignoré */
    }
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export function formatLine(l: JournalLine): string {
  const d = new Date(l.t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} [${l.k}] ${l.m}`;
}

export function journalText(): string {
  return lines.map(formatLine).join('\n');
}

/** Installe les captures globales. À appeler une fois, le plus tôt possible. */
export function installJournal(): void {
  if (installed) return;
  installed = true;
  installedAt = Date.now();

  // Interrupteur coupé lors d'une session précédente : les lignes déjà prises
  // depuis l'installation (quelques millisecondes) sont jetées, rien n'est écrit.
  AsyncStorage.getItem(ENABLED_KEY)
    .then((v) => {
      if (v !== '0') return;
      enabled = false;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      lines = lines.filter((l) => l.t < installedAt);
      for (const l of listeners) l();
    })
    .catch(() => {});

  // Lignes de la session précédente (plantage, redémarrage) : remises en tête.
  AsyncStorage.getItem(STORE_KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as JournalLine[];
      if (!Array.isArray(parsed)) return;
      // Anciennes versions : coordonnées des touchers (pavé du code compris) — supprimées, disque compris.
      const prev = parsed.filter((l) => l && (l.k as string) !== 'touch');
      if (prev.length !== parsed.length) {
        AsyncStorage.setItem(STORE_KEY, JSON.stringify(prev.slice(-MAX_STORED))).catch(() => {});
      }
      if (prev.length === 0) return;
      const mark: JournalLine = { t: Date.now(), k: 'app', m: '——— nouvelle session (lignes ci-dessus : session précédente) ———' };
      lines = [...prev, ...(enabled ? [mark] : []), ...lines].slice(-MAX_MEMORY);
      for (const l of listeners) l();
    })
    .catch(() => {});

  // Console : on garde l'affichage d'origine (logcat) ET on recopie.
  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  const map: [string, JournalKind][] = [['log', 'log'], ['info', 'info'], ['debug', 'log'], ['warn', 'warn'], ['error', 'error']];
  for (const [name, kind] of map) {
    const original = c[name]?.bind(console);
    if (!original) continue;
    c[name] = (...args: unknown[]) => {
      journal(kind, ...args);
      original(...args);
    };
  }

  // Erreurs JS non rattrapées.
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler?: () => ((e: unknown, fatal?: boolean) => void) | null; setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void };
    HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void }) => void };
  };
  if (g.ErrorUtils?.setGlobalHandler) {
    const previous = g.ErrorUtils.getGlobalHandler?.() ?? null;
    g.ErrorUtils.setGlobalHandler((e, fatal) => {
      journal('crash', fatal ? 'ERREUR FATALE' : 'Erreur non rattrapée', e);
      // Écriture immédiate : après une erreur fatale, il n'y aura pas de minuterie.
      void AsyncStorage.setItem(STORE_KEY, JSON.stringify(lines.slice(-MAX_STORED))).catch(() => {});
      previous?.(e, fatal);
    });
  }
  // Promesses rejetées sans `catch` (Hermes).
  try {
    g.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, e) => journal('crash', 'Promesse rejetée non gérée', e),
    });
  } catch {
    /* moteur sans suivi des rejets */
  }

  // Alertes : le titre, puis le bouton choisi (ou la fermeture).
  const originalAlert = Alert.alert.bind(Alert);
  Alert.alert = ((title: string, message?: string, buttons?: { text?: string; onPress?: (v?: string) => void }[], options?: unknown) => {
    journal('alert', `ouverte : « ${title} »`);
    const wrapped = buttons?.map((b) => ({
      ...b,
      onPress: (v?: string) => {
        journal('alert', `« ${title} » → ${b.text ?? '(bouton)'}`);
        b.onPress?.(v);
      },
    }));
    return originalAlert(title, message, wrapped as never, options as never);
  }) as typeof Alert.alert;

  // Premier plan / arrière-plan.
  AppState.addEventListener('change', (s) => journal('app', `état de l'app : ${s}`));
  journal('app', 'journal installé');
}
