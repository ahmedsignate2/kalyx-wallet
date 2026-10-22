/**
 * AUTORISATIONS DE TOKENS — quels contrats peuvent dépenser les tokens du
 * compte actif, et les révoquer. Chaque montant a été relu sur la chaîne ;
 * les contrats signalés passent en tête. Révoquer est une transaction
 * (frais réseau), confirmée explicitement, et suivie jusqu'à son issue.
 */
import { glyph } from './glyph';
import { h, send } from './dom';
import { errorText, t } from './i18n';
import { openSheet } from './sheet';
import { cascade } from './motion';

interface Item {
  token: string;
  symbol: string;
  logo?: string;
  spender: string;
  spenderName?: string;
  amount: string;
  unlimited: boolean;
  risky: boolean;
}

/** Réseaux proposés (ceux que couvre le service d'analyse), dans cet ordre. */
const CHAINS: [string, string][] = [
  ['ethereum', 'Ethereum'],
  ['base', 'Base'],
  ['arbitrum', 'Arbitrum'],
  ['optimism', 'Optimism'],
  ['polygon', 'Polygon'],
  ['bnb', 'BNB Chain'],
  ['avalanche', 'Avalanche'],
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function allowancesScreen(app: HTMLElement, back: () => void, chain = 'ethereum') {
  const select = h('select', { class: 'inline', 'aria-label': t('network'), 'data-testid': 'allow-chain', on: { change: () => allowancesScreen(app, back, select.value) } }, ...CHAINS.map(([id, name]) => h('option', { value: id, selected: id === chain }, name)));
  const body = h('div', { class: 'stack' }, h('p', { class: 'small muted' }, h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }), ` ${t('refreshing')}`));
  const err = h('p', { class: 'error', role: 'alert' });
  app.replaceChildren(
    h(
      'div',
      { class: 'screen enter' },
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('apprTitle')),
      h('p', { class: 'small muted' }, t('apprIntro')),
      h('div', { class: 'list card' }, h('div', { class: 'row' }, h('span', { class: 'set-ico' }, glyph('dapps', 18)), h('span', { class: 'grow' }, h('strong', {}, t('network'))), select)),
      err,
      body,
    ),
  );

  void send<{ items: Item[]; incomplete: boolean; unavailable: boolean }>({ type: 'allowances:list', chain }).then((r) => {
    if (!r.ok) return void (body.replaceChildren(), (err.textContent = errorText(r.error)));
    const name = CHAINS.find(([id]) => id === chain)?.[1] ?? chain;
    const row = (x: Item) => {
      const logo = x.logo ? h('img', { class: 'logo', src: x.logo, alt: '', referrerPolicy: 'no-referrer', loading: 'lazy' }) : h('span', { class: 'logo letter' }, x.symbol.slice(0, 1).toUpperCase());
      const revoke = h('button', { class: 'chip danger', type: 'button', 'data-testid': 'revoke' }, t('apprRevoke'));
      revoke.addEventListener('click', () => {
        const who = x.spenderName || short(x.spender);
        const msg = h('p', { class: 'error', role: 'alert' });
        const go = h('button', { class: 'btn danger', type: 'button' }, t('apprRevoke'));
        const sheet = openSheet(
          t('apprRevoke'),
          h('p', {}, t('apprConfirm', { spender: who, symbol: x.symbol, chain: name })),
          h('p', { class: 'small muted mono' }, x.spender),
          msg,
          go,
        );
        go.addEventListener('click', async () => {
          go.disabled = true;
          go.textContent = t('sending');
          const res = await send<{ txid: string }>({ type: 'allowances:revoke', chain, token: x.token, spender: x.spender, label: `${x.symbol} → ${who}` });
          if (!res.ok) {
            go.disabled = false;
            go.textContent = t('apprRevoke');
            msg.textContent = errorText(res.error);
            return;
          }
          sheet.close();
          revoke.replaceWith(h('span', { class: 'chip quiet' }, glyph('check', 14), t('apprSent')));
        });
      });
      return h(
        'div',
        { class: 'row' },
        logo,
        h(
          'span',
          { class: 'grow' },
          h('strong', {}, x.symbol),
          x.risky ? h('p', { class: 'small error risky-line' }, glyph('warning', 13), t('apprRisky')) : null,
          h('p', { class: `small ${x.unlimited ? 'warn-text' : 'muted'}` }, t('apprCanSpend', { amount: x.unlimited ? `∞ ${x.symbol}` : `${x.amount} ${x.symbol}` })),
          h('p', { class: 'small muted' }, x.spenderName ? `${x.spenderName} · ${short(x.spender)}` : short(x.spender)),
        ),
        revoke,
      );
    };
    const list = r.items.length ? h('div', { class: 'list card' }, ...r.items.map(row)) : h('p', { class: 'muted center-text' }, t('apprEmpty'));
    const partial = r.incomplete || r.unavailable ? [h('div', { class: 'banner warn' }, glyph('alert', 16), h('span', {}, t('apprPartial')))] : [];
    body.replaceChildren(...partial, list);
    cascade(list.querySelectorAll('.row'));
  });
}
