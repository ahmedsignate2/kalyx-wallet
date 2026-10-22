/**
 * CARNET D'ADRESSES : la liste, l'ajout, la modification, et le choix d'un
 * contact (Envoyer). Le service worker décide de tout (adresse valide, sosie,
 * changement d'adresse) ; l'écran montre ses avertissements et ne passe une
 * confirmation que si la personne a coché la case.
 */
import { glyph } from './glyph';
import { h, send } from './dom';
import { errorText, LOCALE, t } from './i18n';
import { openSheet } from './sheet';
import { cascade } from './motion';
import { addressView, shortAddr } from './address';
import { avatar } from './avatar';

export interface ContactView {
  id: string;
  name: string;
  address: string;
  family: 'evm' | 'solana';
  changedAt?: number;
  previous?: string;
  recentlyChanged: boolean;
}

type Reply = { ok: boolean; error?: string; params?: Record<string, string> };

export async function loadContacts(): Promise<ContactView[]> {
  const r = await send<{ contacts: ContactView[] }>({ type: 'contacts:list' }).catch(() => null);
  return r?.ok ? r.contacts : [];
}

const date = (at: number) => new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(at);

/** Avertissement « adresse changée » : partout où le contact apparaît, pendant 30 jours. */
export const changedNote = (c: ContactView) =>
  c.recentlyChanged && c.changedAt ? h('span', { class: 'changed-note', 'data-testid': 'contact-changed' }, glyph('warning', 14), h('span', {}, t('ctChangedOn', { d: date(c.changedAt) }))) : null;

function contactRow(c: ContactView, onClick: () => void, testid = 'contact') {
  return h(
    'button',
    { class: 'row link-row', type: 'button', 'data-testid': testid, on: { click: onClick } },
    avatar(c.address, 36),
    h('span', { class: 'grow' }, h('strong', {}, c.name, h('span', { class: 'tag' }, c.family === 'solana' ? 'Solana' : 'EVM')), h('p', { class: 'small muted mono' }, shortAddr(c.address)), changedNote(c)),
    glyph('chevron', 16),
  );
}

/**
 * Ajout ou modification. Un sosie d'un autre contact, ou un changement
 * d'adresse, fait apparaître une case à cocher : sans elle, rien n'est enregistré.
 */
export function contactSheet(existing: ContactView | null, saved: () => void, prefill = '') {
  const name = h('input', { type: 'text', maxLength: 40, value: existing?.name ?? '', placeholder: t('ctNamePh'), 'aria-label': t('ctName'), 'data-testid': 'ct-name' });
  const address = h('input', { class: 'mono-input', type: 'text', maxLength: 64, value: existing?.address ?? prefill, placeholder: t('ctAddressPh'), spellcheck: false, autocomplete: 'off', 'aria-label': t('ctAddress'), 'data-testid': 'ct-address' });
  const warn = h('div', { class: 'stack', style: 'gap:8px' });
  const err = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'ct-save' }, t('mgSave'));
  let ack: HTMLInputElement | null = null;
  let need: 'change' | 'lookalike' | null = null;
  /** Ce que la personne a confirmé, case par case (une case n'en confirme jamais une autre). */
  let acks = { change: false, lookalike: false };

  const ask = (kind: 'change' | 'lookalike', text: string, who: string) => {
    need = kind;
    ack = h('input', { type: 'checkbox', 'data-testid': 'ct-ack' });
    warn.replaceChildren(h('div', { class: 'banner warn' }, glyph('warning', 16), h('span', { class: 'grow' }, text)), h('label', { class: 'check' }, ack, h('span', {}, t(kind === 'change' ? 'ctChangeAck' : 'ctLookalikeAck', { name: who }))));
  };
  // Changer l'adresse d'un contact : prévenu AVANT d'enregistrer.
  address.addEventListener('input', () => {
    err.textContent = '';
    acks = { change: false, lookalike: false };
    if (existing && address.value.trim() !== existing.address) {
      if (need !== 'change') ask('change', t('ctChangeWarn', { name: existing.name }), existing.name);
    } else if (need) {
      need = null;
      ack = null;
      warn.replaceChildren();
    }
  });

  go.addEventListener('click', async () => {
    if (go.disabled) return;
    if (need && !ack?.checked) return void (err.textContent = t('ctAckNeeded'));
    if (need) acks[need] = true;
    go.disabled = true;
    err.textContent = '';
    const r: Reply = await send(
      existing
        ? { type: 'contacts:update', id: existing.id, name: name.value, address: address.value, confirmChange: acks.change, confirmLookalike: acks.lookalike }
        : { type: 'contacts:add', name: name.value, address: address.value, confirmLookalike: acks.lookalike },
    ).catch(() => ({ ok: false, error: 'INTERNAL' }));
    go.disabled = false;
    if (r.ok) return void (sheet.close(), saved());
    if (r.error === 'CONTACT_LOOKALIKE') return ask('lookalike', t('ctLookalikeWarn', { name: r.params?.name ?? '' }), r.params?.name ?? '');
    err.textContent = errorText(r.error, r.params);
  });

  const remove =
    existing &&
    h(
      'button',
      {
        class: 'row link-row danger-row',
        type: 'button',
        'data-testid': 'ct-remove',
        on: {
          click: async () => {
            const r = await send({ type: 'contacts:remove', id: existing.id });
            if (!r.ok) return void (err.textContent = errorText(r.error));
            sheet.close();
            saved();
          },
        },
      },
      h('span', { class: 'set-ico' }, glyph('close', 18)),
      h('span', { class: 'grow' }, h('strong', {}, t('ctRemove'))),
    );

  const sheet = openSheet(
    t(existing ? 'ctEdit' : 'ctAdd'),
    h('label', { class: 'field' }, h('span', { class: 'small muted' }, t('ctName')), name),
    h('label', { class: 'field' }, h('span', { class: 'small muted' }, t('ctAddress')), address),
    existing?.previous ? h('p', { class: 'small muted' }, t('ctPrevious'), ' ', h('span', { class: 'mono' }, shortAddr(existing.previous))) : null,
    warn,
    err,
    go,
    remove ? h('div', { class: 'list card' }, remove) : null,
  );
}

export function contactsScreen(app: HTMLElement, back: () => void) {
  const body = h('div', { class: 'stack' });
  const draw = async (first: boolean) => {
    const list = await loadContacts();
    body.replaceChildren(
      list.length
        ? h('div', { class: 'list card', 'data-testid': 'contacts' }, ...list.map((c) => contactRow(c, () => contactSheet(c, () => void draw(false)))))
        : h('div', { class: 'empty-card card' }, glyph('wallet', 28), h('p', { class: 'muted' }, t('ctEmpty'))),
    );
    if (first) cascade(body.querySelectorAll('.row'));
  };
  app.replaceChildren(
    h(
      'div',
      { class: 'screen enter' },
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('ctTitle')),
      h('p', { class: 'small muted' }, t('ctIntro')),
      h('button', { class: 'btn secondary', type: 'button', 'data-testid': 'ct-new', on: { click: () => contactSheet(null, () => void draw(false)) } }, glyph('add', 18), t('ctAdd')),
      body,
    ),
  );
  void draw(true);
}

/** Envoyer : choisir un contact du bon réseau. Ne fait que remplir l'adresse. */
export async function pickContactSheet(family: 'evm' | 'solana' | undefined, pick: (address: string) => void) {
  const list = (await loadContacts()).filter((c) => !family || c.family === family);
  const sheet = openSheet(
    t('ctTitle'),
    list.length
      ? h('div', { class: 'list card' }, ...list.map((c) => contactRow(c, () => (sheet.close(), pick(c.address)), 'pick-contact')))
      : h('p', { class: 'muted' }, t(family === 'solana' ? 'ctNoneSol' : 'ctNone')),
  );
}

/** Une adresse complète, avec son contact s'il existe. */
export function addressWithContact(address: string, contacts: ContactView[]) {
  const c = contacts.find((x) => (x.address.startsWith('0x') ? x.address.toLowerCase() === address.toLowerCase() : x.address === address));
  return h('div', { class: 'stack', style: 'gap:2px' }, c ? h('strong', {}, c.name) : null, h('p', { class: 'addr' }, addressView(address, 'sm')), c ? changedNote(c) : null);
}
