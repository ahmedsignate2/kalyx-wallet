/**
 * Petit utilitaire DOM : éléments créés un par un, texte toujours posé en
 * `textContent`. Jamais d'innerHTML : rien de ce qu'on colle (phrase, clé,
 * nom de fichier) ne peut être interprété comme du HTML.
 */
type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    // Attributs à tiret (aria-*, data-*) : ce ne sont pas des propriétés du DOM.
    else if (k.includes('-')) { if (v !== false && v != null) el.setAttribute(k, v === true ? 'true' : String(v)); }
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

export type Reply = { ok: boolean; error?: string; waitMs?: number; [k: string]: unknown };

/** Message au service worker (canal interne de l'extension). */
export function send<T = Reply>(msg: Record<string, unknown>): Promise<T & Reply> {
  return browser.runtime.sendMessage(msg) as Promise<T & Reply>;
}
