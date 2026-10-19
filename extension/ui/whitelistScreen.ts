/**
 * LISTE BLANCHE — activer (immédiat), ajouter (utilisable après 24 h d'heure
 * de chaîne si la protection est active), retirer (immédiat), désactiver
 * (effectif après 24 h, annulable).
 */
import { h, nodes, send } from './dom';
import { errorText, t } from './i18n';
import { groupAddress } from '../../src/domain/validation/poisoning';
import type { WhitelistView } from '../lib/whitelist';

type R = { ok: boolean; error?: string; params?: Record<string, string>; whitelist?: WhitelistView };

export function whitelistScreen(app: HTMLElement, back: () => void) {
  const err = h('p', { class: 'error', role: 'alert' });

  async function act(msg: Record<string, unknown>) {
    err.textContent = '';
    const r = (await send(msg).catch(() => null)) as R | null;
    if (!r?.ok || !r.whitelist) return void (err.textContent = errorText(r?.error, r?.params));
    draw(r.whitelist);
  }

  function draw(w: WhitelistView) {
    const address = h('input', { type: 'text', placeholder: t('wlAddress'), autocomplete: 'off', spellcheck: false });
    const label = h('input', { type: 'text', placeholder: t('wlLabel'), maxLength: 40 });
    const hoursToDisable = w.disableAt ? Math.max(1, Math.ceil((w.disableAt - Date.now()) / 3_600_000)) : 0;
    app.replaceChildren(
      ...nodes(
        h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, `← ${t('back')}`)),
        h('h1', {}, t('wlTitle')),
        h('p', { class: `small ${w.enforced ? 'up' : 'muted'}`, 'data-testid': 'wl-state' }, w.enforced ? t('wlOn') : t('wlOff')),
        h('p', { class: 'small muted' }, t('wlIntro')),
        !w.enabled && h('button', { class: 'btn', type: 'button', on: { click: () => void act({ type: 'whitelist:enable' }) } }, t('wlEnable')),
        w.enabled && !w.disableAt && h('button', { class: 'btn secondary', type: 'button', on: { click: () => void act({ type: 'whitelist:request-disable' }) } }, t('wlRequestDisable')),
        w.enabled && !!w.disableAt && h('div', { class: 'banner warn' }, h('span', {}, t('wlDisableAt', { h: hoursToDisable })), h('button', { type: 'button', on: { click: () => void act({ type: 'whitelist:enable' }) } }, t('wlCancelDisable'))),
        w.enabled && !w.timeKnown && h('div', { class: 'banner warn' }, h('span', {}, t('wlNoTime'))),
        h(
          'div',
          { class: 'list' },
          ...(w.entries.length
            ? w.entries.map((e) =>
                h(
                  'div',
                  { class: 'row' },
                  h('div', { class: 'grow' }, h('strong', {}, e.label || '—'), h('p', { class: 'mono small muted' }, groupAddress(e.address)), h('p', { class: `small ${e.active ? 'up' : 'muted'}` }, e.active ? t('wlActive') : t('wlIn', { h: e.hoursLeft }))),
                  h('button', { class: 'chip', type: 'button', on: { click: () => void act({ type: 'whitelist:remove', address: e.address }) } }, t('wlRemove')),
                ),
              )
            : [h('p', { class: 'muted empty' }, t('wlEmpty'))]),
        ),
        h(
          'form',
          {
            class: 'stack',
            style: 'gap:8px',
            on: {
              submit: (e) => {
                e.preventDefault();
                if (address.value.trim()) void act({ type: 'whitelist:add', address: address.value.trim(), label: label.value.trim() });
              },
            },
          },
          address,
          label,
          h('button', { class: 'btn secondary', type: 'submit' }, t('wlAdd')),
        ),
        err,
      ),
    );
  }

  void act({ type: 'whitelist:get' });
}
