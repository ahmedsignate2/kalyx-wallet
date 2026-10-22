/**
 * RÉSEAUX AFFICHÉS et AJOUT D'UN TOKEN par son contrat.
 *
 * Masquer un réseau ne fait que l'enlever de l'écran (soldes, activité, NFT) :
 * les sites peuvent toujours l'utiliser, rien n'est désactivé.
 *
 * Ajouter un token : le contrat est lu sur le réseau par le service worker,
 * puis RELU à l'ajout ; l'écran ne fait que montrer ce que le contrat dit.
 */
import { glyph } from './glyph';
import { h, send } from './dom';
import { errorText, t } from './i18n';
import { openSheet } from './sheet';
import { cascade } from './motion';
import { formatTokenAmount } from '../../src/domain/validation/format';

interface Network {
  id: string;
  name: string;
  family: 'evm' | 'solana';
  logo?: string;
  hidden: boolean;
}

interface TokenCheck {
  chainId: string;
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  raw?: string;
}

/** Logo d'un réseau : celui de l'app (SVG embarqué), sinon l'initiale. */
const netLogo = (n: Network) => (n.logo ? h('img', { class: 'logo', src: n.logo, alt: '' }) : h('span', { class: 'logo letter' }, n.name.slice(0, 1).toUpperCase()));

export function networksScreen(app: HTMLElement, back: () => void) {
  const err = h('p', { class: 'error', role: 'alert' });
  const list = h('div', { class: 'list card', 'data-testid': 'networks' });
  app.replaceChildren(
    h(
      'div',
      { class: 'screen enter' },
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('netTitle')),
      h('p', { class: 'small muted' }, t('netIntro')),
      err,
      list,
    ),
  );

  async function draw(first: boolean) {
    const r = await send<{ networks: Network[] }>({ type: 'assets:networks' });
    if (!r.ok) return void (err.textContent = errorText(r.error));
    list.replaceChildren(
      ...r.networks.map((n) => {
        const row = h(
          'button',
          { class: 'row link-row', type: 'button', role: 'switch', 'aria-checked': String(!n.hidden), 'data-testid': `net-${n.id}` },
          netLogo(n),
          h('span', { class: 'grow' }, h('strong', {}, n.name), h('p', { class: 'small muted' }, n.family === 'solana' ? 'Solana' : 'EVM')),
          h('span', { class: 'switch', 'aria-hidden': 'true' }),
        );
        row.addEventListener('click', async () => {
          err.textContent = '';
          row.disabled = true;
          const x = await send({ type: 'assets:set-network', id: n.id, hidden: !n.hidden });
          row.disabled = false;
          if (!x.ok) return void (err.textContent = errorText(x.error));
          await draw(false);
        });
        return row;
      }),
    );
    if (first) cascade(list.querySelectorAll('.row'));
  }
  void draw(true);
}

/** Ajouter un token : réseau, contrat, vérification sur le contrat, puis ajout. */
export function addTokenSheet(networks: { id: string; name: string }[], added: () => void) {
  const select = h('select', { class: 'inline', 'aria-label': t('network'), 'data-testid': 'token-chain' }, ...networks.map((n) => h('option', { value: n.id }, n.name)));
  const input = h('input', { class: 'mono-input', type: 'text', placeholder: '0x…', maxLength: 64, spellcheck: false, autocomplete: 'off', 'aria-label': t('atContract'), 'data-testid': 'token-contract' });
  const err = h('p', { class: 'error', role: 'alert' });
  const preview = h('div', { class: 'stack', style: 'gap:8px' });
  const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'token-check' }, t('atCheck'));
  let found: TokenCheck | null = null;

  const reset = () => {
    found = null;
    preview.replaceChildren();
    err.textContent = '';
    go.textContent = t('atCheck');
  };
  input.addEventListener('input', reset);
  select.addEventListener('change', reset);

  go.addEventListener('click', async () => {
    if (go.disabled) return;
    err.textContent = '';
    go.disabled = true;
    if (!found) {
      const r = await send<{ token: TokenCheck }>({ type: 'tokens:check', chainId: select.value, contract: input.value.trim() });
      go.disabled = false;
      if (!r.ok) return void (err.textContent = errorText(r.error));
      found = r.token;
      const kv = (k: string, v: string) => h('div', { class: 'kv-row' }, h('span', { class: 'muted' }, k), h('strong', {}, v));
      preview.replaceChildren(
        h(
          'div',
          { class: 'card kv-card', 'data-testid': 'token-found' },
          kv(t('atSymbol'), found.symbol),
          kv(t('atName'), found.name),
          kv(t('atDecimals'), String(found.decimals)),
          found.raw != null ? kv(t('tdBalance'), `${formatTokenAmount(BigInt(found.raw), found.decimals)} ${found.symbol}`) : null,
        ),
        h('div', { class: 'banner warn' }, glyph('warning', 16), h('span', { class: 'grow' }, t('atWarn'))),
      );
      go.textContent = t('atAdd', { symbol: found.symbol });
      return;
    }
    const r = await send({ type: 'tokens:add', chainId: found.chainId, contract: found.contract });
    go.disabled = false;
    if (!r.ok) return void (err.textContent = errorText(r.error));
    sheet.close();
    added();
  });

  const sheet = openSheet(
    t('atTitle'),
    h('p', { class: 'small muted' }, t('atIntro')),
    h('div', { class: 'list card' }, h('div', { class: 'row' }, h('span', { class: 'set-ico' }, glyph('dapps', 18)), h('span', { class: 'grow' }, h('strong', {}, t('network'))), select)),
    h('label', { class: 'field' }, h('span', { class: 'small muted' }, t('atContract')), input),
    preview,
    err,
    go,
  );
}
