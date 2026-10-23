/**
 * DURCISSEMENT, côté écran : mode parano, présence de Kalyx sur les sites
 * (partout ou sites autorisés seulement) et bandeau « Activer sur ce site ».
 * Le service worker décide et enregistre ; l'écran ne fait que montrer.
 */
import { glyph } from './glyph';
import { h, send } from './dom';
import { errorText, t } from './i18n';
import { openSheet } from './sheet';

type Reply = { ok: boolean; error?: string };
interface Access {
  mode: 'all' | 'allowed';
  allowed: string[];
  active: boolean | null;
}

/** Interrupteur de réglage (même forme que « Redemander le mot de passe »). */
export function switchRow(icon: string, title: string, body: string, testid: string, on: boolean, flip: (next: boolean) => Promise<Reply>, after: () => void): HTMLElement {
  const row = h(
    'button',
    { class: 'row link-row', type: 'button', role: 'switch', 'aria-checked': String(on), 'data-testid': testid },
    h('span', { class: 'set-ico' }, glyph(icon, 18)),
    h('span', { class: 'grow' }, h('strong', {}, title), h('p', { class: 'small muted' }, body)),
    h('span', { class: 'switch', 'aria-hidden': 'true' }),
  );
  row.onclick = async () => {
    row.setAttribute('aria-checked', String(!on));
    const r = await flip(!on).catch(() => ({ ok: false, error: 'INTERNAL' }));
    if (!r.ok) row.setAttribute('aria-checked', String(on));
    after();
  };
  return row;
}

export const loadAccess = async (origin?: string): Promise<Access | null> => {
  const r = await send<Access>({ type: 'sites:access', origin }).catch(() => null);
  return r?.ok ? r : null;
};

/** Sites autorisés (mode restreint) : la liste, chacun retirable. */
export function allowedSitesSheet(list: string[], changed: () => void) {
  const body = h('div', { class: 'list card', 'data-testid': 'allowed-sites' });
  const draw = (items: string[]) =>
    body.replaceChildren(
      ...(items.length
        ? items.map((o) =>
            h(
              'div',
              { class: 'row' },
              h('span', { class: 'set-ico' }, glyph('dapps', 18)),
              h('span', { class: 'grow mono' }, o.replace(/^https:\/\//, '')),
              h(
                'button',
                {
                  class: 'link',
                  type: 'button',
                  on: {
                    click: async () => {
                      if ((await send({ type: 'sites:forbid', origin: o })).ok) draw(items.filter((x) => x !== o)), changed();
                    },
                  },
                },
                t('siteRemove'),
              ),
            ),
          )
        : [h('p', { class: 'small muted', style: 'padding:12px' }, t('allowedNone'))]),
    );
  draw(list);
  openSheet(t('allowedSitesTitle'), h('p', { class: 'small muted' }, t('siteModeBody')), body);
}

/** Origine web de l'onglet actif (popup ou panneau), null pour une page interne. */
async function activeTab(): Promise<{ id: number; origin: string } | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab?.id || !tab.url) return null;
  try {
    const u = new URL(tab.url);
    return /^https?:$/.test(u.protocol) ? { id: tab.id, origin: u.origin } : null;
  } catch {
    return null;
  }
}

/**
 * Mode « sites autorisés seulement » et onglet actif où Kalyx est absent :
 * un bandeau pour l'y activer (la page se recharge pour recevoir Kalyx).
 */
export function siteBanner(): HTMLElement {
  const slot = h('div', { class: 'stack', style: 'gap:8px' });
  void (async () => {
    const tab = await activeTab();
    if (!tab) return;
    const a = await loadAccess(tab.origin);
    if (!a || a.mode !== 'allowed' || a.active) return;
    const err = h('p', { class: 'error', role: 'alert' });
    const host = new URL(tab.origin).host;
    slot.replaceChildren(
      h(
        'div',
        { class: 'banner', role: 'status', 'data-testid': 'site-off' },
        glyph('dapps', 16),
        h('span', { class: 'grow' }, t('siteOff', { site: host })),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'site-on',
            on: {
              click: async () => {
                const r = await send({ type: 'sites:allow', origin: tab.origin });
                if (!r.ok) return void (err.textContent = errorText(r.error));
                await browser.tabs.reload(tab.id).catch(() => {});
                slot.replaceChildren(h('div', { class: 'banner', role: 'status' }, glyph('check', 16), h('span', { class: 'grow' }, t('siteEnabled', { site: host }))));
              },
            },
          },
          t('siteOn'),
        ),
      ),
      err,
    );
  })();
  return slot;
}
