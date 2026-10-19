/**
 * RELAIS (script de contenu isolé) — entre la page et le service worker.
 *
 * Il ne décide rien : il valide la FORME des messages de la page (taille,
 * types), les passe au service worker par un port, et rend les réponses. Le
 * service worker lit lui-même l'origine du port (donnée par Chrome) ; ce que
 * la page prétend être n'entre jamais en compte.
 *
 * Page principale seulement (pas les iframes) : un cadre publicitaire ne
 * parle pas à Kalyx.
 */
const MAX_BYTES = 512 * 1024;
const MAX_IN_FLIGHT = 30;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    const ORIGIN = location.origin;
    let port: ReturnType<typeof browser.runtime.connect> | null = null;
    const inFlight = new Set<number>();

    const toPage = (msg: Record<string, unknown>) => window.postMessage(msg, ORIGIN);

    function connect() {
      if (port) return port;
      const p = browser.runtime.connect({ name: 'kalyx-dapp' });
      p.onMessage.addListener((m: { id?: number; result?: unknown; error?: unknown; event?: string; data?: unknown }) => {
        if (typeof m?.id === 'number') {
          inFlight.delete(m.id);
          toPage({ k: 'kalyx:res', id: m.id, result: m.result, error: m.error });
        } else if (typeof m?.event === 'string') toPage({ k: 'kalyx:evt', event: m.event, data: m.data });
      });
      p.onDisconnect.addListener(() => {
        port = null;
        // Service worker arrêté ou extension rechargée : les demandes en vol sont perdues.
        if (inFlight.size) {
          inFlight.clear();
          toPage({ k: 'kalyx:evt', event: 'relayRestarted' });
        }
      });
      p.postMessage({ hello: true });
      port = p;
      return p;
    }

    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== ORIGIN) return;
      const d = e.data as { k?: string; id?: unknown; family?: unknown; method?: unknown; params?: unknown };
      if (d?.k !== 'kalyx:req') return;
      const id = d.id;
      if (typeof id !== 'number' || !Number.isSafeInteger(id)) return;
      const reject = (code: number, message: string) => toPage({ k: 'kalyx:res', id, error: { code, message } });
      if ((d.family !== 'evm' && d.family !== 'solana') || typeof d.method !== 'string' || d.method.length > 80 || !Array.isArray(d.params)) return reject(-32602, 'Requête invalide');
      let size = 0;
      try {
        size = JSON.stringify(d.params).length;
      } catch {
        return reject(-32602, 'Paramètres illisibles');
      }
      if (size > MAX_BYTES) return reject(-32602, 'Requête trop volumineuse');
      if (inFlight.size >= MAX_IN_FLIGHT) return reject(-32005, 'Trop de demandes en cours');
      inFlight.add(id);
      try {
        connect().postMessage({ id, family: d.family, method: d.method, params: d.params });
      } catch {
        inFlight.delete(id);
        reject(4900, 'Kalyx indisponible');
      }
    });

    // Retour sur l'onglet : l'état (verrouillage, réseau) a pu changer pendant l'absence.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && port) port.postMessage({ hello: true });
    });
  },
});
