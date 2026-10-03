/**
 * Analyseur de flux Server-Sent Events, incrémental : on lui donne le texte tel
 * qu'il arrive (morceaux coupés n'importe où), il rend les événements complets.
 *
 * React Native n'a pas `EventSource` : le pont TON Connect est lu par un
 * XMLHttpRequest dont `responseText` grandit, et ce texte passe par ici.
 * Règles de la spec HTML : lignes `champ: valeur`, événement terminé par une
 * ligne vide, `data` multiples joints par « \n », `id` retenu pour la reprise.
 */
export interface SseEvent {
  id?: string;
  event?: string;
  data: string;
}

export class SseParser {
  private buffer = '';
  private data: string[] = [];
  private id?: string;
  private event?: string;
  /** Dernier identifiant reçu : `last_event_id` à la reconnexion. */
  lastEventId?: string;

  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let nl: number;
    while ((nl = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + (this.buffer.startsWith('\r\n', nl) ? 2 : 1));
      if (line === '') {
        if (this.data.length) {
          const ev: SseEvent = { data: this.data.join('\n') };
          if (this.id !== undefined) ev.id = this.id;
          if (this.event !== undefined) ev.event = this.event;
          out.push(ev);
        }
        this.data = [];
        this.event = undefined;
        continue;
      }
      if (line.startsWith(':')) continue; // commentaire
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') this.data.push(value);
      else if (field === 'id') {
        this.id = value;
        this.lastEventId = value;
      } else if (field === 'event') this.event = value;
    }
    return out;
  }
}

/** Message du pont : `{ from, message }` (message = base64 de `nonce || boîte`). */
export function parseBridgeMessage(data: string): { from: string; message: string } | null {
  if (data === 'heartbeat') return null;
  try {
    const m = JSON.parse(data) as { from?: unknown; message?: unknown };
    if (typeof m.from !== 'string' || !/^[0-9a-f]{64}$/i.test(m.from) || typeof m.message !== 'string') return null;
    return { from: m.from.toLowerCase(), message: m.message };
  } catch {
    return null;
  }
}
