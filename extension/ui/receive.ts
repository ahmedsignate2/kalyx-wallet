/**
 * RECEVOIR — l'adresse du compte affiché, en QR et en groupes de 4 lisibles.
 *
 * Au PREMIER « Recevoir » d'un portefeuille dont la phrase n'est pas vérifiée,
 * un écran intermédiaire passe d'abord : recevoir des fonds sur une phrase
 * jamais notée, c'est les perdre avec l'ordinateur.
 */
import { glyph } from './glyph';
import { h, nodes, send } from './dom';
import { errorText, t } from './i18n';
import { qrSvg } from './qr';
import { groupAddress } from '../../src/domain/validation/poisoning';
import { pulse } from './motion';
import { segmented } from './segmented';

interface Info {
  walletId: string;
  evm?: string;
  solana?: string;
  backedUp: boolean;
  warned: boolean;
}

export async function receiveScreen(app: HTMLElement, back: () => void, opts: { close: boolean }) {
  const r = await send<Info>({ type: 'receive:info' }).catch(() => null);
  if (!r?.ok) return void app.replaceChildren(h('p', { class: 'error' }, errorText(r?.error)));
  if (!r.backedUp && !r.warned) return warnScreen(app, r, back, opts);
  show(app, r, back);
}

function warnScreen(app: HTMLElement, info: Info, back: () => void, opts: { close: boolean }) {
  app.replaceChildren(
    h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
    h(
      'div',
      { class: 'center notice' },
      h('span', { class: 'notice-ico' }, glyph('warning', 28)),
      h('h1', {}, t('warnReceiveTitle')),
      h('p', { class: 'muted' }, t('warnReceiveBody')),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          on: {
            click: async () => {
              await browser.tabs.create({ url: browser.runtime.getURL(`/onboarding.html#verify=${encodeURIComponent(info.walletId)}`) });
              if (opts.close) window.close();
            },
          },
        },
        t('verifyNowBtn'),
      ),
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          on: {
            click: async () => {
              await send({ type: 'receive:ack-warning', walletId: info.walletId });
              show(app, info, back);
            },
          },
        },
        t('continueAnyway'),
      ),
    ),
  );
}

function show(app: HTMLElement, info: Info, back: () => void) {
  const fams = [info.evm && { id: 'evm', label: 'EVM', address: info.evm, note: t('receiveEvmNote') }, info.solana && { id: 'sol', label: 'Solana', address: info.solana, note: t('receiveSolNote') }].filter(
    (x): x is { id: string; label: string; address: string; note: string } => !!x,
  );
  let current = fams[0];
  const body = h('div', { class: 'stack receive' });

  function draw() {
    const label = h('span', {}, t('copyAddress'));
    const copy = h(
      'button',
      {
        class: 'btn',
        type: 'button',
        on: {
          click: async () => {
            await navigator.clipboard.writeText(current.address);
            label.textContent = t('copied');
            copy.classList.add('done');
            pulse(copy);
            setTimeout(() => (copy.classList.remove('done'), (label.textContent = t('copyAddress'))), 1400);
          },
        },
      },
      glyph('copy', 18),
      label,
    );
    body.replaceChildren(
      ...nodes(
        fams.length > 1 && segmented(fams.map((f) => f.label), fams.indexOf(current), (i) => ((current = fams[i]), draw()), fams),
        // Le QR et l'adresse dans une même carte : ce qu'on montre à l'autre personne.
        h(
          'div',
          { class: 'card receive-card' },
          h('div', { class: 'qr' }, qrSvg(current.address, 196)),
          h('p', { class: 'micro' }, current.label),
          h('p', { class: 'mono addr', 'data-testid': 'receive-address' }, groupAddress(current.address)),
        ),
        copy,
        h('div', { class: 'perm' }, glyph('alert', 18), h('p', { class: 'small' }, current.note)),
      ),
    );
  }
  draw();
  app.replaceChildren(h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))), h('h1', {}, t('receiveTitle')), body);
}
