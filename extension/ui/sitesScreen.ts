/**
 * SITES CONNECTÉS — qui voit quel compte, sur quel réseau ; déconnexion en
 * un clic. Et l'option « Kalyx par défaut » (window.ethereum).
 */
import { glyph } from './glyph';
import { h, nodes, send } from './dom';
import { errorText, t } from './i18n';
import { avatar } from './avatar';
import { cascade } from './motion';

interface SiteRow {
  origin: string;
  evm: { address: string; wallet: string; index: number } | null;
  solana: { address: string; wallet: string; index: number } | null;
  bitcoin?: { address: string; wallet: string; index: number } | null;
  chain: string;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function sitesScreen(app: HTMLElement, back: () => void) {
  const [r, d] = await Promise.all([send<{ sites: SiteRow[] }>({ type: 'sites:list' }).catch(() => null), send<{ on: boolean }>({ type: 'settings:get-default' }).catch(() => null)]);
  const err = h('p', { class: 'error', role: 'alert' }, r?.ok ? '' : errorText(r?.error));
  const on = !!(d?.ok && d.on);
  // « Kalyx par défaut » : un interrupteur, comme dans les réglages.
  const toggle = h(
    'button',
    {
      class: 'row link-row',
      type: 'button',
      role: 'switch',
      'aria-checked': String(on),
      'data-testid': 'default-toggle',
      on: {
        click: async () => {
          toggle.setAttribute('aria-checked', String(!on));
          const x = await send({ type: 'settings:set-default', on: !on }).catch(() => null);
          if (!x?.ok) return void ((err.textContent = errorText(x?.error)), toggle.setAttribute('aria-checked', String(on)));
          void sitesScreen(app, back);
        },
      },
    },
    h('span', { class: 'set-ico' }, glyph('wallet', 18)),
    h('span', { class: 'grow' }, h('strong', {}, t('defaultTitle')), h('p', { class: 'small muted' }, t('defaultBody'))),
    h('span', { class: 'switch', 'aria-hidden': 'true' }),
  );
  const sites = r?.ok ? r.sites : [];
  const mark = (host: string) => h('span', { class: 'site-mark', 'aria-hidden': 'true' }, avatar(host, 40), h('b', {}, host.replace(/^www\./, '').slice(0, 1).toUpperCase()));
  const list = h(
    'div',
    { class: 'list card' },
    ...sites.map((s) => {
      const host = new URL(s.origin).host;
      return h(
        'div',
        { class: 'row site-row' },
        mark(host),
        h(
          'div',
          { class: 'grow' },
          h('strong', {}, host),
          ...[s.evm && `EVM ${short(s.evm.address)} · ${t('networkLabel', { n: s.chain })}`, s.solana && `Solana ${short(s.solana.address)}`, s.bitcoin && `Bitcoin ${short(s.bitcoin.address)}`]
            .filter((x): x is string => !!x)
            .map((x) => h('p', { class: 'small muted' }, x)),
        ),
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            on: {
              click: async () => {
                await send({ type: 'sites:disconnect', origin: s.origin });
                void sitesScreen(app, back);
              },
            },
          },
          t('disconnect'),
        ),
      );
    }),
  );
  app.replaceChildren(
    ...nodes(
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('sitesTitle')),
      sites.length ? list : h('div', { class: 'card empty-card' }, h('span', { class: 'set-ico' }, glyph('dapps', 20)), h('p', { class: 'muted' }, t('sitesEmpty'))),
      h('div', { class: 'list card' }, toggle),
      err,
    ),
  );
  cascade(list.children);
}
