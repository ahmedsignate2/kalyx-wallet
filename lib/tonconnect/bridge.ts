/**
 * Pont HTTP de TON Connect : écoute (SSE) et envoi.
 *
 * Formes relevées sur le pont de TonAPI et dans `@tonconnect/sdk` 4.0.2 :
 *  - écoute : `GET {pont}/events?client_id=A,B,…&last_event_id=…` — plusieurs
 *    sessions sur UNE connexion ; heartbeat = événement sans `data` ;
 *  - envoi : `POST {pont}/message?client_id=moi&to=dApp&ttl=300&topic=…`, corps
 *    = base64 de `nonce || boîte`.
 *
 * React Native n'a pas `EventSource` : on lit le flux avec un XMLHttpRequest
 * dont `responseText` grandit à chaque morceau reçu (`onprogress`), à travers
 * `SseParser`. Reconnexion avec attente croissante, reprise au dernier id.
 */
import { SseParser, parseBridgeMessage } from '../../src/domain/tonconnect/sse';

export interface BridgeMessage {
  from: string;
  message: string;
  eventId?: string;
}

const MAX_BACKOFF_MS = 30_000;

export class BridgeListener {
  private xhr: XMLHttpRequest | null = null;
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly bridge: string,
    private readonly clientIds: string[],
    private lastEventId: string | undefined,
    private readonly onMessage: (m: BridgeMessage) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.xhr?.abort();
    this.xhr = null;
  }

  private connect(): void {
    if (this.stopped || this.clientIds.length === 0) return;
    const parser = new SseParser();
    let seen = 0;
    const q = [`client_id=${this.clientIds.join(',')}`];
    if (this.lastEventId) q.push(`last_event_id=${encodeURIComponent(this.lastEventId)}`);
    const xhr = new XMLHttpRequest();
    this.xhr = xhr;
    xhr.open('GET', `${this.bridge.replace(/\/+$/, '')}/events?${q.join('&')}`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.onprogress = () => {
      const text = xhr.responseText ?? '';
      const chunk = text.slice(seen);
      seen = text.length;
      for (const ev of parser.feed(chunk)) {
        if (ev.id) this.lastEventId = ev.id;
        const m = parseBridgeMessage(ev.data);
        if (m) this.onMessage({ ...m, eventId: ev.id });
      }
      if (seen > 0) this.attempt = 0;
    };
    const retry = () => {
      if (this.stopped || this.xhr !== xhr) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
    xhr.onerror = retry;
    xhr.onloadend = retry; // le serveur a fermé le flux : on rouvre
    xhr.send();
  }
}

/** Envoie un message chiffré (base64) à la dApp. Réessaie trois fois avant d'abandonner. */
export async function bridgeSend(bridge: string, fromClientId: string, to: string, body: string, topic?: string): Promise<void> {
  const q = [`client_id=${fromClientId}`, `to=${to}`, 'ttl=300'];
  if (topic) q.push(`topic=${topic}`);
  const url = `${bridge.replace(/\/+$/, '')}/message?${q.join('&')}`;
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
      if (res.ok) return;
      last = new Error(`pont : HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw last instanceof Error ? last : new Error('pont injoignable');
}
