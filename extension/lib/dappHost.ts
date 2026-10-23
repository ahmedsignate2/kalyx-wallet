/**
 * Côté NAVIGATEUR du pont : ports des pages, script de page enregistré,
 * fenêtres d'approbation. La logique (qui a droit à quoi) est dans lib/dapp.
 */
import { webOrigin } from './sites';
import { toRpcError } from './rpcError';
import type { Dapp } from './dapp';

type Port = ReturnType<typeof browser.runtime.connect>;

const INPAGE_ID = 'kalyx-inpage';
const RELAY_ID = 'kalyx-relay';
/** Au-delà, un site qui mitraille les demandes est mis en attente (fenêtre glissante). */
const RATE = { max: 120, windowMs: 10_000 };

/**
 * (Ré)enregistre le script de page (monde de la page, seul ou précédé du
 * drapeau « Kalyx par défaut ») et le relais (monde isolé), sur ces motifs
 * seulement (lib/siteAccess) ; aucun motif : Kalyx absent de tous les sites.
 * Page principale uniquement : jamais dans un cadre.
 */
async function doRegister(asDefault: boolean, matches: string[]): Promise<void> {
  // Un id inconnu fait échouer tout l'appel : un par un.
  for (const id of [INPAGE_ID, RELAY_ID]) await browser.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
  if (!matches.length) return;
  const common = { matches, runAt: 'document_start' as const, allFrames: false, persistAcrossSessions: true };
  await browser.scripting.registerContentScripts([
    { id: INPAGE_ID, js: asDefault ? ['inpage-flag.js', 'inpage.js'] : ['inpage.js'], world: 'MAIN', ...common },
    { id: RELAY_ID, js: ['content-scripts/relay.js'], world: 'ISOLATED', ...common },
  ]);
}

/*
 * Un enregistrement à la fois : l'installation, le démarrage et un réglage
 * peuvent en demander en même temps ; entrelacés, l'un retirerait les
 * scripts que l'autre vient de poser (un site chargé à cet instant n'aurait
 * plus de relais).
 */
let registering: Promise<void> = Promise.resolve();
export function registerInpage(asDefault: boolean, matches: string[]): Promise<void> {
  const run = registering.then(() => doRegister(asDefault, matches));
  registering = run.catch(() => {});
  return run;
}

/** Scripts enregistrés, et sur quels motifs (pour savoir s'il faut les réenregistrer). */
export async function registeredMatches(): Promise<string[] | null> {
  const list = await browser.scripting.getRegisteredContentScripts({ ids: [INPAGE_ID, RELAY_ID] }).catch(() => []);
  if (list.length !== 2) return null;
  return [...(list[0].matches ?? [])].sort();
}

export function makeDappHost(getDapp: () => Dapp, onOriginGone: (origin: string) => void) {
  const ports = new Map<string, Set<Port>>();

  function emit(origin: string, event: string, data: unknown) {
    for (const p of ports.get(origin) ?? []) {
      try {
        p.postMessage({ event, data });
      } catch {
        /* port fermé entre-temps */
      }
    }
  }

  function accept(port: Port) {
    if (port.name !== 'kalyx-dapp') return;
    const sender = port.sender;
    // L'origine vient de CHROME. Page principale seulement ; http(s) seulement.
    const origin = webOrigin(sender?.origin ?? sender?.url);
    if (!origin || sender?.frameId !== 0 || !sender?.tab) {
      port.disconnect();
      return;
    }
    const set = ports.get(origin) ?? ports.set(origin, new Set()).get(origin)!;
    set.add(port);
    const stamps: number[] = [];

    port.onMessage.addListener(async (m: { hello?: boolean; id?: number; family?: 'evm' | 'solana'; method?: string; params?: unknown[] }) => {
      const dapp = getDapp();
      if (m?.hello) {
        port.postMessage({ event: 'hello', data: await dapp.hello(origin).catch(() => null) });
        return;
      }
      if (typeof m?.id !== 'number' || (m.family !== 'evm' && m.family !== 'solana') || typeof m.method !== 'string') return;
      const now = Date.now();
      while (stamps.length && now - stamps[0] > RATE.windowMs) stamps.shift();
      if (stamps.length >= RATE.max) {
        port.postMessage({ id: m.id, error: { code: -32005, message: 'Trop de demandes : ralentis' } });
        return;
      }
      stamps.push(now);
      try {
        const result = await dapp.handle(origin, m.family, m.method, Array.isArray(m.params) ? m.params : []);
        port.postMessage({ id: m.id, result: result === undefined ? null : result });
      } catch (e) {
        port.postMessage({ id: m.id, error: toRpcError(e) });
      }
    });

    port.onDisconnect.addListener(() => {
      set.delete(port);
      if (!set.size) {
        ports.delete(origin);
        onOriginGone(origin);
      }
    });
  }

  return { accept, emit, origins: () => [...ports.keys()] };
}
