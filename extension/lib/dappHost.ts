/**
 * Côté NAVIGATEUR du pont : ports des pages, script de page enregistré,
 * fenêtres d'approbation. La logique (qui a droit à quoi) est dans lib/dapp.
 */
import { webOrigin } from './sites';
import { toRpcError } from './rpcError';
import type { Dapp } from './dapp';

type Port = ReturnType<typeof browser.runtime.connect>;

const INPAGE_ID = 'kalyx-inpage';
const MATCHES = ['http://*/*', 'https://*/*'];
/** Au-delà, un site qui mitraille les demandes est mis en attente (fenêtre glissante). */
const RATE = { max: 120, windowMs: 10_000 };

/** (Ré)enregistre le script de page : seul, ou précédé du drapeau « Kalyx par défaut ». */
export async function registerInpage(asDefault: boolean): Promise<void> {
  await browser.scripting.unregisterContentScripts({ ids: [INPAGE_ID] }).catch(() => {});
  await browser.scripting.registerContentScripts([
    {
      id: INPAGE_ID,
      js: asDefault ? ['inpage-flag.js', 'inpage.js'] : ['inpage.js'],
      matches: MATCHES,
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
}

export async function inpageRegistered(): Promise<boolean> {
  const list = await browser.scripting.getRegisteredContentScripts({ ids: [INPAGE_ID] }).catch(() => []);
  return list.length > 0;
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
