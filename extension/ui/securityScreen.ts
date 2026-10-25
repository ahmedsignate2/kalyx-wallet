/**
 * DURCISSEMENT, côté écran : mode parano, présence de Kalyx sur les sites
 * (partout ou sites autorisés seulement) et bandeau « Activer sur ce site ».
 * Le service worker décide et enregistre ; l'écran ne fait que montrer.
 */
import { picker } from './picker';
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

/**
 * Code de contrainte : le régler, le changer ou le retirer (mot de passe
 * redemandé). Le service worker refuse un code identique au mot de passe.
 */
export function duressSheet(active: boolean, changed: () => void) {
  const err = h('p', { class: 'error', role: 'alert' });
  const pw = h('input', { type: 'password', placeholder: t('pwCurrent'), autocomplete: 'current-password', 'data-testid': 'dr-password' });
  const code = h('input', { type: 'password', placeholder: t('drCode'), autocomplete: 'off', 'data-testid': 'dr-code' });
  const code2 = h('input', { type: 'password', placeholder: t('drConfirm'), autocomplete: 'off', 'data-testid': 'dr-code2' });
  const save = h('button', { class: 'btn', type: 'button', 'data-testid': 'dr-save' }, t('drSave'));
  const remove = h('button', { class: 'btn danger', type: 'button', 'data-testid': 'dr-remove' }, t('drRemove'));
  const done = (msg: string) => {
    sheet.body.replaceChildren(h('p', { class: 'banner', role: 'status', 'data-testid': 'dr-done' }, glyph('check', 16), h('span', { class: 'grow' }, msg)));
    changed();
  };
  const run = async (btn: HTMLButtonElement, msg: Record<string, unknown>, ok: string) => {
    err.textContent = '';
    btn.disabled = true;
    const r = await send(msg).catch(() => ({ ok: false, error: 'INTERNAL' }));
    btn.disabled = false;
    pw.value = '';
    if (!r.ok) return void (err.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : errorText(r.error));
    done(ok);
  };
  save.onclick = () => {
    if (!pw.value || !code.value) return;
    if (code.value !== code2.value) return void (err.textContent = t('drMismatch'));
    void run(save, { type: 'vault:set-duress', password: pw.value, code: code.value }, `${t('drSaved')} ${t('drHow')}`);
  };
  remove.onclick = () => {
    if (!pw.value) return void (err.textContent = t('pwCurrent'));
    void run(remove, { type: 'vault:remove-duress', password: pw.value }, t('drRemoved'));
  };
  const sheet = openSheet(
    t('drTitle'),
    h('p', {}, t('drIntro')),
    !active && h('p', { class: 'small muted' }, t('drHow')),
    pw,
    code,
    code2,
    err,
    save,
    active && h('p', { class: 'small muted' }, t('drRemoveWarn')),
    active && remove,
  );
}

/** « Téléphone seul » coupé : mot de passe redemandé (l'extension pourra de nouveau contenir des clés). */
export function phoneOnlyOffSheet(changed: () => void) {
  const err = h('p', { class: 'error', role: 'alert' });
  const pw = h('input', { type: 'password', placeholder: t('pwCurrent'), autocomplete: 'current-password', 'data-testid': 'po-password' });
  const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'po-off' }, t('poOffGo'));
  go.onclick = async () => {
    if (!pw.value) return;
    go.disabled = true;
    const r = await send({ type: 'settings:set-phone-only', on: false, password: pw.value }).catch(() => ({ ok: false, error: 'INTERNAL' }));
    go.disabled = false;
    pw.value = '';
    if (!r.ok) return void (err.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : errorText(r.error));
    sheet.close();
    changed();
  };
  const sheet = openSheet(t('poOffTitle'), h('p', {}, t('poOffBody')), pw, err, go);
}

const CAPS = [100, 250, 500, 1000, 2500, 5000];

/**
 * Plafond journalier (dans la devise affichée) : un choix. Le baisser est
 * immédiat ; le relever ou le retirer redemande le mot de passe.
 */
export function capSelect(fiat: string, locale: string, reload: () => void): HTMLButtonElement {
  const money = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: fiat.toUpperCase(), maximumFractionDigits: 0 }).format(n);
  const sel = picker({ inline: true, label: t('capTitle'), testid: 'cap', value: '', options: [{ value: '', label: t('capOff') }, ...CAPS.map((c) => ({ value: String(c), label: money(c) }))] });
  let current = '';
  void send<{ limit: number | null; spent: number }>({ type: 'cap:get' }).then((r) => {
    if (r.ok) sel.value = current = r.limit ? String(r.limit) : '';
  });
  const apply = async (password?: string) => {
    const limit = sel.value ? Number(sel.value) : null;
    const r = await send({ type: 'cap:set', limit, password }).catch(() => ({ ok: false, error: 'INTERNAL' }));
    if (r.ok) return void ((current = sel.value), reload());
    if (r.error === 'PASSWORD_REQUIRED' && password === undefined) return askPassword();
    sel.value = current;
  };
  const askPassword = () => {
    const err = h('p', { class: 'error', role: 'alert' });
    const pw = h('input', { type: 'password', placeholder: t('pwCurrent'), autocomplete: 'current-password', 'data-testid': 'cap-password' });
    const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'cap-confirm' }, t('capRaise'));
    let done = false;
    const sheet = openSheet(t('capTitle'), h('p', {}, t('capRaiseBody')), pw, err, go);
    go.onclick = async () => {
      const r = await send({ type: 'cap:set', limit: sel.value ? Number(sel.value) : null, password: pw.value }).catch(() => ({ ok: false, error: 'INTERNAL' }));
      pw.value = '';
      if (!r.ok) return void (err.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : errorText(r.error));
      done = true;
      current = sel.value;
      sheet.close();
      reload();
    };
    // Feuille fermée sans confirmer : le plafond reste celui d'avant.
    const observer = new MutationObserver(() => {
      if (!document.body.contains(sheet.body)) (observer.disconnect(), done || (sel.value = current));
    });
    observer.observe(document.body, { childList: true });
  };
  sel.addEventListener('change', () => void apply());
  return sel;
}
