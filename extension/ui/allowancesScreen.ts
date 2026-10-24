/**
 * AUTORISATIONS DE TOKENS — quels contrats peuvent dépenser les tokens du
 * compte actif, et les révoquer. Chaque montant a été relu sur la chaîne ;
 * les contrats signalés passent en tête. Révoquer est une transaction
 * (frais réseau), confirmée explicitement, et suivie jusqu'à son issue.
 */
import { emptyState, skeletonList } from './feedback';
import { glyph } from './glyph';
import { h, nodes, send } from './dom';
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

interface Grant {
  id: string;
  chainName: string;
  symbol: string;
  spender: string;
  origin: string;
  expiresAt: number;
  expired: boolean;
}

/**
 * Rappels : les autorisations accordées aux sites par Kalyx, avec leur
 * échéance. Les échues en tête, et « Tout révoquer » en un clic (chaque
 * révocation reste une transaction signée, ou validée sur le téléphone).
 */
function remindersCard(refresh: () => void): HTMLElement {
  const box = h('div', { class: 'stack', 'data-testid': 'reminders' });
  void send<{ grants: Grant[] }>({ type: 'grants:list' }).then((r) => {
    if (!r.ok || !r.grants.length) return;
    const expired = r.grants.filter((g) => g.expired);
    const left = (ms: number) => (ms < 3_600_000 ? t('grLeftMin', { n: Math.max(1, Math.round(ms / 60_000)) }) : ms < 172_800_000 ? t('grLeftH', { n: Math.round(ms / 3_600_000) }) : t('grLeftD', { n: Math.round(ms / 86_400_000) }));
    const row = (g: Grant) =>
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'set-ico' }, glyph(g.expired ? 'warning' : 'clock', 18)),
        h(
          'span',
          { class: 'grow' },
          h('strong', {}, `${g.symbol} · ${g.chainName}`),
          h('p', { class: 'small muted' }, `${new URL(g.origin).host} · ${short(g.spender)}`),
          h('p', { class: `small ${g.expired ? 'warn-text' : 'muted'}` }, g.expired ? t('grExpired') : left(g.expiresAt - Date.now())),
        ),
        h('button', { class: 'link small', type: 'button', 'aria-label': t('grDismiss'), on: { click: async () => (await send({ type: 'grants:dismiss', id: g.id }), refresh()) } }, glyph('close', 16)),
      );
    const status = h('p', { class: 'small muted', role: 'status' });
    const all = h('button', { class: 'btn danger', type: 'button', 'data-testid': 'revoke-expired' }, t('grRevokeAll', { n: expired.length }));
    all.onclick = async () => {
      all.disabled = true;
      status.textContent = t('grRevoking');
      const x = await send<{ done: number; failed: { symbol: string; error: string }[] }>({ type: 'grants:revoke-expired' }).catch(() => null);
      all.disabled = false;
      status.textContent = x?.ok ? t('grRevoked', { n: x.done }) + (x.failed.length ? ` ${t('grFailed', { list: x.failed.map((f) => f.symbol).join(', ') })}` : '') : errorText(x?.error);
      if (x?.ok) setTimeout(refresh, 1500);
    };
    box.replaceChildren(
      ...nodes(
      h('p', { class: 'group-title' }, t('grTitle')),
      h('div', { class: 'list card' }, ...[...expired, ...r.grants.filter((g) => !g.expired)].map(row)),
      expired.length > 0 && all,
      status,
      ),
    );
  });
  return box;
}

export function allowancesScreen(app: HTMLElement, back: () => void, chain = 'ethereum') {
  const select = h('select', { class: 'inline', 'aria-label': t('network'), 'data-testid': 'allow-chain', on: { change: () => allowancesScreen(app, back, select.value) } }, ...CHAINS.map(([id, name]) => h('option', { value: id, selected: id === chain }, name)));
  const body = h('div', { class: 'stack', 'aria-busy': 'true' }, h('span', { class: 'sr' }, t('refreshing')), skeletonList(3));
  const err = h('p', { class: 'error', role: 'alert' });
  app.replaceChildren(
    h(
      'div',
      { class: 'screen enter' },
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('apprTitle')),
      h('p', { class: 'small muted' }, t('apprIntro')),
      h('div', { class: 'list card' }, h('div', { class: 'row' }, h('span', { class: 'set-ico' }, glyph('dapps', 18)), h('span', { class: 'grow' }, h('strong', {}, t('network'))), select)),
      remindersCard(() => allowancesScreen(app, back, chain)),
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
    const list = r.items.length ? h('div', { class: 'list card' }, ...r.items.map(row)) : emptyState(glyph('security', 26), t('apprEmpty'), t('esApprBody'));
    const partial = r.incomplete || r.unavailable ? [h('div', { class: 'banner warn' }, glyph('alert', 16), h('span', {}, t('apprPartial')))] : [];
    body.replaceChildren(...partial, list);
    cascade(list.querySelectorAll('.row'));
  });
}
