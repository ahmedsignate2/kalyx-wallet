/**
 * AUTORISATIONS DE TOKENS — quels contrats peuvent dépenser les tokens du
 * compte actif, et les révoquer. Chaque montant a été relu sur la chaîne ;
 * les contrats signalés passent en tête. Révoquer est une transaction
 * (frais réseau), confirmée explicitement, et suivie jusqu'à son issue.
 */
import { picker } from './picker';
import { chainLogo } from '../lib/chainLogo';
import { emptyState, skeletonList } from './feedback';
import { glyph } from './glyph';
import { h, nodes, send } from './dom';
import { errorText, LOCALE, t } from './i18n';
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
  exposed: number | null;
  dormant: boolean;
  ageDays: number | null;
  openSource?: boolean;
  level: 'high' | 'medium' | 'low';
  reasons: ('risky' | 'unlimited' | 'unknown' | 'old' | 'dormant')[];
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
  const select = picker({ inline: true, label: t('network'), testid: 'allow-chain', value: chain, options: CHAINS.map(([id, name]) => ({ value: id, label: name, icon: chainLogo(id) })) });
  select.addEventListener('change', () => allowancesScreen(app, back, select.value));
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

  void send<{ items: Item[]; incomplete: boolean; unavailable: boolean; exposedTotal: number | null; fiat: string }>({ type: 'allowances:list', chain }).then((r) => {
    if (!r.ok) return void (body.replaceChildren(), (err.textContent = errorText(r.error)));
    const name = CHAINS.find(([id]) => id === chain)?.[1] ?? chain;
    const money = (v: number) => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: (r.fiat || 'usd').toUpperCase(), maximumFractionDigits: v >= 100 ? 0 : 2 }).format(v);
    const ago = (days: number) => {
      const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
      return days >= 365 ? rtf.format(-Math.floor(days / 365), 'year') : days >= 30 ? rtf.format(-Math.floor(days / 30), 'month') : rtf.format(-days, 'day');
    };
    /** Révoquer une autorisation : une transaction ; rend true si elle est partie. */
    const revokeOne = async (x: Item) => {
      const who = x.spenderName || short(x.spender);
      const res = await send<{ txid: string }>({ type: 'allowances:revoke', chain, token: x.token, spender: x.spender, label: `${x.symbol} → ${who}` });
      return res.ok ? null : errorText(res.error);
    };
    const row = (x: Item) => {
      const logo = x.logo ? h('img', { class: 'logo', src: x.logo, alt: '', referrerPolicy: 'no-referrer', loading: 'lazy' }) : h('span', { class: 'logo letter' }, x.symbol.slice(0, 1).toUpperCase());
      const revoke = h('button', { class: `chip ${x.level === 'low' ? '' : 'danger'}`, type: 'button', 'data-testid': 'revoke' }, t('apprRevoke'));
      revoke.addEventListener('click', () => {
        const who = x.spenderName || short(x.spender);
        const msg = h('p', { class: 'error', role: 'alert' });
        const go = h('button', { class: 'btn danger', type: 'button' }, t('apprRevoke'));
        const sheet = openSheet(t('apprRevoke'), h('p', {}, t('apprConfirm', { spender: who, symbol: x.symbol, chain: name })), h('p', { class: 'small muted mono' }, x.spender), msg, go);
        go.addEventListener('click', async () => {
          go.disabled = true;
          go.textContent = t('sending');
          const e = await revokeOne(x);
          if (e) return void ((go.disabled = false), (go.textContent = t('apprRevoke')), (msg.textContent = e));
          sheet.close();
          revoke.replaceWith(h('span', { class: 'chip quiet' }, glyph('check', 14), t('apprSent')));
        });
      });
      // Une phrase par raison, la plus grave d'abord ; « raisonnable » n'en montre qu'une, discrète.
      const why = x.reasons.filter((c) => x.level !== 'low' || c === 'dormant').map((c) => h('li', {}, t(`al_r_${c}` as 'al_r_risky')));
      return h(
        'div',
        { class: `row allow-row lvl-${x.level}`, 'data-testid': 'allow-row', 'data-level': x.level },
        logo,
        h(
          'span',
          { class: 'grow' },
          h('span', { class: 'allow-head' }, h('strong', {}, x.symbol), h('span', { class: `lvl-badge ${x.level}` }, t(`alLvl_${x.level}` as 'alLvl_high'))),
          h('p', { class: `small ${x.unlimited ? 'warn-text' : 'muted'}` }, t('apprCanSpend', { amount: x.unlimited ? `∞ ${x.symbol}` : `${x.amount} ${x.symbol}` })),
          x.exposed != null && x.exposed > 0 && h('p', { class: 'small exposed' }, t('alExposed', { v: money(x.exposed) })),
          h('p', { class: 'small muted' }, [x.spenderName ? `${x.spenderName} · ${short(x.spender)}` : short(x.spender), x.openSource ? t('alOpenSource') : '', x.ageDays != null ? t('alAge', { ago: ago(x.ageDays) }) : ''].filter(Boolean).join(' · ')),
          why.length > 0 && h('ul', { class: 'allow-why' }, ...why),
        ),
        revoke,
      );
    };
    const recommended = r.items.filter((x) => x.level !== 'low');
    const high = r.items.filter((x) => x.level === 'high').length;
    const unlimited = r.items.filter((x) => x.unlimited).length;
    // En tête : ce qui est réellement en jeu, et le geste qui le règle.
    const status = h('p', { class: 'small muted', role: 'status' });
    const bulk = h('button', { class: 'btn danger', type: 'button', 'data-testid': 'revoke-recommended' }, t('alRevokeRec', { n: recommended.length }));
    bulk.addEventListener('click', () => {
      const go = h('button', { class: 'btn danger', type: 'button' }, t('alRevokeRec', { n: recommended.length }));
      const sheet = openSheet(t('alRevokeRec', { n: recommended.length }), h('p', {}, t('alRevokeRecBody', { n: recommended.length })), h('ul', { class: 'allow-why' }, ...recommended.map((x) => h('li', {}, `${x.symbol} → ${x.spenderName || short(x.spender)}`))), go);
      go.addEventListener('click', async () => {
        sheet.close();
        bulk.disabled = true;
        let done = 0;
        const failed: string[] = [];
        for (const [i, x] of recommended.entries()) {
          status.textContent = t('alRevokingN', { i: i + 1, n: recommended.length });
          const e = await revokeOne(x);
          if (e) failed.push(x.symbol);
          else done++;
        }
        status.textContent = t('alRevokedN', { n: done }) + (failed.length ? ` ${t('grFailed', { list: failed.join(', ') })}` : '');
        setTimeout(() => allowancesScreen(app, back, chain), 1800);
      });
    });
    const summary =
      r.items.length > 0 &&
      h(
        'section',
        { class: `card allow-summary ${high ? 'high' : recommended.length ? 'medium' : 'low'}`, 'data-testid': 'allow-summary' },
        h('p', { class: 'small muted' }, t('alExposedTitle')),
        h('p', { class: 'allow-total' }, r.exposedTotal == null ? '—' : money(r.exposedTotal)),
        h('p', { class: 'small muted' }, r.exposedTotal == null ? t('alExposedUnknown') : r.exposedTotal === 0 ? t('alExposedNone') : ''),
        h('div', { class: 'allow-chips' }, high > 0 && h('span', { class: 'lvl-badge high' }, t('alCountHigh', { n: high })), unlimited > 0 && h('span', { class: 'lvl-badge medium' }, t('alCountUnlimited', { n: unlimited }))),
        recommended.length > 0 && bulk,
        status,
      );
    const list = r.items.length ? h('div', { class: 'list card' }, ...r.items.map(row)) : emptyState(glyph('security', 26), t('apprEmpty'), t('esApprBody'));
    const partial = r.incomplete || r.unavailable ? [h('div', { class: 'banner warn' }, glyph('alert', 16), h('span', {}, t('apprPartial')))] : [];
    body.removeAttribute('aria-busy');
    body.replaceChildren(...nodes(...partial, summary, list));
    cascade(list.querySelectorAll('.row'));
  });
}
