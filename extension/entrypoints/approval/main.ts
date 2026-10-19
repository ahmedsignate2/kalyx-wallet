/**
 * FENÊTRE D'APPROBATION — une fenêtre à part, jamais un calque dans la page :
 * un site ne peut ni la recouvrir, ni l'imiter, ni cliquer à la place de
 * l'utilisateur. Fermer la fenêtre vaut refus.
 *
 * Lot 5 : la CONNEXION d'un site (quel compte il peut voir). Les signatures
 * arrivent au lot 6, dans cette même fenêtre.
 */
import { h, nodes, send } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { lockedScreen } from '../../ui/screens';
import { groupAddress } from '../../../src/domain/validation/poisoning';

interface Req {
  id: string;
  origin: string;
  kind: 'connect';
  family: 'evm' | 'solana';
}
interface WalletMeta {
  id: string;
  label: string;
  accounts: { index: number; evm?: string; solana?: string }[];
}

const app = document.getElementById('app')!;
const id = location.hash.slice(1);
/** Le bouton d'accord s'active après un instant : un clic resté en vol ne vaut pas accord. */
const ARM_MS = 700;

function gone() {
  app.replaceChildren(h('div', { class: 'center' }, h('p', { class: 'muted' }, t('apGone')), h('button', { class: 'btn', type: 'button', on: { click: () => window.close() } }, t('close'))));
}

async function load() {
  const r = await send<{ request: Req; unlocked: boolean; wallets: WalletMeta[]; selected: { walletId: string; index: number } | null }>({ type: 'approval:get', id }).catch(() => null);
  if (!r?.ok) return gone();
  if (!r.unlocked) return lockedScreen(app, () => void load());
  connectScreen(r.request, r.wallets, r.selected);
}

function connectScreen(req: Req, wallets: WalletMeta[], selected: { walletId: string; index: number } | null) {
  const url = new URL(req.origin);
  const options = wallets.flatMap((w) =>
    w.accounts
      .filter((a) => (req.family === 'evm' ? a.evm : a.solana))
      .map((a) => ({ value: `${w.id}|${a.index}`, label: `${w.label} · ${t('account', { n: a.index + 1 })}`, address: (req.family === 'evm' ? a.evm : a.solana)! })),
  );
  const sel = h('select', {}, ...options.map((o) => h('option', { value: o.value, selected: o.value === `${selected?.walletId}|${selected?.index}` }, o.label)));
  const addr = h('p', { class: 'mono small muted' });
  const showAddr = () => (addr.textContent = groupAddress(options.find((o) => o.value === sel.value)?.address ?? ''));
  sel.addEventListener('change', showAddr);
  showAddr();
  const err = h('p', { class: 'error', role: 'alert' });
  const ok = h('button', { class: 'btn', type: 'button', disabled: true }, t('apConnect'));
  setTimeout(() => (ok.disabled = !options.length), ARM_MS);
  const refuse = async () => {
    await send({ type: 'approval:respond', id, approve: false }).catch(() => {});
    window.close();
  };
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    const [walletId, index] = sel.value.split('|');
    const r = await send({ type: 'approval:respond', id, approve: true, walletId, index: Number(index) }).catch(() => null);
    if (r?.ok) return window.close();
    if (r?.error === 'REQUEST_EXPIRED') return gone();
    err.textContent = t('e_INTERNAL');
    ok.disabled = false;
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && void refuse());

  app.replaceChildren(
    ...nodes(
      h('header', { class: 'bar' }, h('img', { src: '/icon/128.png', alt: '' }), h('strong', {}, 'Kalyx')),
      h('h1', {}, t('apTitle')),
      h('div', { class: 'card stack', style: 'gap:6px' }, h('p', { class: 'site', 'data-testid': 'site-host' }, url.host), h('p', { class: 'mono small muted' }, req.origin)),
      url.hostname.split('.').some((p) => p.startsWith('xn--')) && h('div', { class: 'banner danger' }, h('span', {}, t('apIdn'))),
      url.protocol === 'http:' && h('div', { class: 'banner warn' }, h('span', {}, t('apLocal'))),
      h('p', { class: 'small muted' }, req.family === 'evm' ? t('apFamilyEvm') : t('apFamilySol')),
      h('label', { class: 'small muted' }, t('apAccount')),
      sel,
      addr,
      h('p', { class: 'small muted' }, t('apBody')),
      err,
      h('div', { class: 'actions' }, h('button', { class: 'btn secondary', type: 'button', on: { click: () => void refuse() } }, t('apRefuse')), ok),
    ),
  );
}

if (!/^[0-9a-f-]{36}$/.test(id)) gone();
else void load();
