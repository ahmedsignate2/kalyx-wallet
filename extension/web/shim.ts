/**
 * WEBAPP : le strict nécessaire de l'API `browser` des extensions, pour faire
 * tourner l'interface de l'extension dans une page web (app.kalyxwallet.com).
 *
 * Ici, pas de service worker : le « cerveau » (web/host.ts) vit dans la page,
 * et `runtime.sendMessage` l'appelle directement. Le stockage est celui du site
 * (localStorage, sessionStorage), les alarmes des minuteries. Rien de ce qui
 * n'existe que dans une extension (onglets, panneau latéral, scripts de page)
 * n'est simulé : ces gestes sont soit retirés de l'interface web, soit
 * ramenés à leur équivalent web (ouvrir un lien).
 *
 * Doit être importé AVANT tout autre module de l'interface.
 */
type Handler = (msg: unknown) => Promise<unknown>;
let handler: Handler = async () => ({ ok: false, error: 'INTERNAL' });
/** Branché par web/main.ts une fois l'hôte prêt. */
export function setMessageHandler(fn: Handler) {
  handler = fn;
}

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
const changeListeners: ((changes: Changes, area: string) => void)[] = [];

/** Une zone de stockage `browser.storage.*` au-dessus d'un `Storage` du navigateur (valeurs en JSON). */
function area(name: 'local' | 'session', backing: () => Storage | null) {
  const P = 'kx:';
  const mem = new Map<string, string>();
  // Navigation privée stricte, stockage bloqué : la page marche quand même, en mémoire.
  const read = (k: string): string | null => {
    try {
      return backing()?.getItem(P + k) ?? null;
    } catch {
      return mem.get(k) ?? null;
    }
  };
  const write = (k: string, v: string | null) => {
    try {
      const s = backing();
      if (!s) throw new Error('no storage');
      if (v === null) s.removeItem(P + k);
      else s.setItem(P + k, v);
    } catch {
      if (v === null) mem.delete(k);
      else mem.set(k, v);
    }
  };
  const allKeys = (): string[] => {
    const keys = new Set(mem.keys());
    try {
      const s = backing();
      for (let i = 0; s && i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(P)) keys.add(k.slice(P.length));
      }
    } catch {
      /* mémoire seulement */
    }
    return [...keys];
  };
  const parse = (raw: string | null): unknown => {
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const emit = (changes: Changes) => {
    if (Object.keys(changes).length) for (const fn of changeListeners) fn(changes, name);
  };
  return {
    async get(keys?: string | string[] | null | Record<string, unknown>): Promise<Record<string, unknown>> {
      const list = keys == null ? allKeys() : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out: Record<string, unknown> = {};
      for (const k of list) {
        const v = parse(read(k));
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
    async set(items: Record<string, unknown>) {
      const changes: Changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: parse(read(k)), newValue: v };
        write(k, JSON.stringify(v));
      }
      emit(changes);
    },
    async remove(keys: string | string[]) {
      const changes: Changes = {};
      for (const k of typeof keys === 'string' ? [keys] : keys) {
        changes[k] = { oldValue: parse(read(k)) };
        write(k, null);
      }
      emit(changes);
    },
    async clear() {
      const changes: Changes = {};
      for (const k of allKeys()) {
        changes[k] = { oldValue: parse(read(k)) };
        write(k, null);
      }
      emit(changes);
    },
    // Ni quota ni restriction d'accès : sans objet dans une page.
    async setAccessLevel() {},
  };
}

/* ── Alarmes : des minuteries de la page (elles s'arrêtent avec l'onglet, comme la session). ── */
type Alarm = { name: string; scheduledTime: number; periodInMinutes?: number };
const alarms = new Map<string, { alarm: Alarm; timer: ReturnType<typeof setTimeout> }>();
const alarmListeners: ((a: Alarm) => void)[] = [];
function fire(name: string) {
  const cur = alarms.get(name);
  if (!cur) return;
  const { alarm } = cur;
  if (alarm.periodInMinutes) {
    const next = Date.now() + alarm.periodInMinutes * 60_000;
    alarms.set(name, { alarm: { ...alarm, scheduledTime: next }, timer: setTimeout(() => fire(name), next - Date.now()) });
  } else alarms.delete(name);
  for (const fn of alarmListeners) fn(alarm);
}

declare const __KALYX_VERSION__: string;
const VERSION = typeof __KALYX_VERSION__ === 'string' ? __KALYX_VERSION__ : '0.0.0';

const browserShim = {
  runtime: {
    id: 'kalyx-web',
    sendMessage: (msg: unknown) => handler(msg),
    getURL: (p: string) => (p.startsWith('/') ? p : `/${p}`),
    getManifest: () => ({ version: VERSION, version_name: `${VERSION} web` }),
    getPlatformInfo: async () => ({ os: 'web' }),
    onMessage: { addListener() {} },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
  },
  storage: {
    local: area('local', () => globalThis.localStorage ?? null),
    session: area('session', () => globalThis.sessionStorage ?? null),
    onChanged: { addListener: (fn: (changes: Changes, area: string) => void) => void changeListeners.push(fn) },
  },
  alarms: {
    async create(name: string, info: { when?: number; delayInMinutes?: number; periodInMinutes?: number }) {
      const prev = alarms.get(name);
      if (prev) clearTimeout(prev.timer);
      const at = info.when ?? Date.now() + (info.delayInMinutes ?? info.periodInMinutes ?? 0) * 60_000;
      alarms.set(name, { alarm: { name, scheduledTime: at, periodInMinutes: info.periodInMinutes }, timer: setTimeout(() => fire(name), Math.max(0, at - Date.now())) });
    },
    async clear(name: string) {
      const cur = alarms.get(name);
      if (cur) clearTimeout(cur.timer);
      return alarms.delete(name);
    },
    async clearAll() {
      for (const { timer } of alarms.values()) clearTimeout(timer);
      alarms.clear();
      return true;
    },
    async get(name: string) {
      return alarms.get(name)?.alarm;
    },
    onAlarm: { addListener: (fn: (a: Alarm) => void) => void alarmListeners.push(fn) },
  },
  tabs: {
    /** Lien externe : un nouvel onglet. Page interne (installation, vérification) : sans objet sur le web. */
    async create({ url }: { url: string }) {
      if (/^(https:\/\/|mailto:)/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      return {};
    },
    async query() {
      return [];
    },
    async reload() {},
  },
  windows: { async getCurrent() { return {}; } },
  sidePanel: { async open() {} },
  notifications: { async create() { return ''; }, async clear() { return true; }, onClicked: { addListener() {} } },
};

(globalThis as unknown as { browser: typeof browserShim }).browser = browserShim;

export {};
