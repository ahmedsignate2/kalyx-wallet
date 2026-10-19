/**
 * SITES CONNECTÉS — qui voit quel compte, sur quel réseau ; déconnexion en
 * un clic. Et l'option « Kalyx par défaut » (window.ethereum).
 */
import { glyph } from './glyph';
import { h, nodes, send } from './dom';
import { errorText, t } from './i18n';

interface SiteRow {
  origin: string;
  evm: { address: string; wallet: string; index: number } | null;
  solana: { address: string; wallet: string; index: number } | null;
  chain: string;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function sitesScreen(app: HTMLElement, back: () => void) {
  const [r, d] = await Promise.all([send<{ sites: SiteRow[] }>({ type: 'sites:list' }).catch(() => null), send<{ on: boolean }>({ type: 'settings:get-default' }).catch(() => null)]);
  const err = h('p', { class: 'error', role: 'alert' }, r?.ok ? '' : errorText(r?.error));
  const on = !!(d?.ok && d.on);
  const toggle = h(
    'button',
    {
      class: `btn ${on ? 'secondary' : ''}`,
      type: 'button',
      'data-testid': 'default-toggle',
      on: {
        click: async () => {
          const x = await send({ type: 'settings:set-default', on: !on }).catch(() => null);
          if (!x?.ok) return void (err.textContent = errorText(x?.error));
          void sitesScreen(app, back);
        },
      },
    },
    `${t('defaultTitle')} : ${on ? t('on') : t('off')}`,
  );
  const sites = r?.ok ? r.sites : [];
  app.replaceChildren(
    ...nodes(
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('sitesTitle')),
      h(
        'div',
        { class: 'list' },
        ...(sites.length
          ? sites.map((s) =>
              h(
                'div',
                { class: 'row' },
                h(
                  'div',
                  { class: 'grow' },
                  h('strong', {}, new URL(s.origin).host),
                  ...[s.evm && `EVM ${short(s.evm.address)} · ${t('networkLabel', { n: s.chain })}`, s.solana && `Solana ${short(s.solana.address)}`]
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
              ),
            )
          : [h('p', { class: 'muted empty' }, t('sitesEmpty'))]),
      ),
      h('p', { class: 'small muted' }, t('defaultBody')),
      toggle,
      err,
    ),
  );
}
