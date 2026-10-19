/**
 * FENÊTRE D'APPROBATION — une fenêtre à part, jamais un calque dans la page :
 * un site ne peut ni la recouvrir, ni l'imiter, ni cliquer à la place de
 * l'utilisateur. Fermer la fenêtre vaut refus.
 *
 * Connexion d'un site (quel compte il peut voir), et SIGNATURES : ce qui va
 * se passer en une phrase, ce que tu perds / reçois, le niveau de risque et
 * ses raisons (explication de l'app), le message ou les détails techniques.
 * En danger, signer demande de MAINTENIR le bouton 2 s.
 */
import { h, nodes, send } from '../../ui/dom';
import { errorText, t } from '../../ui/i18n';
import { lockedScreen } from '../../ui/screens';
import { groupAddress } from '../../../src/domain/validation/poisoning';

interface Req {
  id: string;
  origin: string;
  kind: 'connect' | 'sign';
  family: 'evm' | 'solana';
}
interface Review {
  explanation: { title: string; headline: string; detail?: string; lose: string[]; receive: string[]; risk: 'none' | 'warning' | 'danger'; reasons: string[]; holdToSign: boolean };
  method: string;
  chainName?: string;
  details: { label: string; value: string }[];
  messageText?: string;
  reduce?: { symbol: string; decimals: number; suggested?: string };
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
  if (r.request.kind === 'sign') return signScreen(r.request);
  connectScreen(r.request, r.wallets, r.selected);
}

const HOLD_MS = 2000;

async function signScreen(req: Req) {
  const url = new URL(req.origin);
  app.replaceChildren(h('header', { class: 'bar' }, h('img', { src: '/icon/128.png', alt: '' }), h('strong', {}, 'Kalyx')), h('p', { class: 'muted', role: 'status' }, t('apAnalyzing')));
  const r = await send<{ review: Review; askPassword: boolean }>({ type: 'approval:review', id, lang: navigator.language }).catch(() => null);
  if (!r?.ok) return r?.error === 'REQUEST_EXPIRED' ? gone() : void app.append(h('p', { class: 'error' }, errorText(r?.error)));
  const { review: rv, askPassword } = r;
  const ex = rv.explanation;
  const err = h('p', { class: 'error', role: 'alert' });
  const pw = h('input', { type: 'password', placeholder: t('apPassword'), autocomplete: 'current-password' });
  const reduceBox = h('input', { type: 'checkbox', style: 'width:auto' });
  const reduceAmount = h('input', { type: 'text', inputMode: 'decimal', value: rv.reduce?.suggested ?? '', placeholder: '0.0', 'aria-label': t('apReduce') });
  const sending = rv.method === 'eth_sendTransaction' || rv.method === 'solana:signAndSendTransaction';
  const label = ex.holdToSign ? t('apHold') : sending ? t('apConfirm') : t('apSign');
  const ok = h('button', { class: `btn ${ex.risk === 'danger' ? 'danger' : ''}`, type: 'button', disabled: true }, label);
  setTimeout(() => (ok.disabled = false), ARM_MS);

  const refuse = async () => {
    await send({ type: 'approval:respond', id, approve: false }).catch(() => {});
    window.close();
  };
  const approve = async () => {
    if (ok.disabled) return;
    if (askPassword && !pw.value) return void (err.textContent = errorText('PASSWORD_REQUIRED'));
    ok.disabled = true;
    err.textContent = '';
    const x = await send<{ params?: Record<string, string> }>({
      type: 'approval:respond',
      id,
      approve: true,
      password: askPassword ? pw.value : undefined,
      reduceTo: rv.reduce && reduceBox.checked && reduceAmount.value.trim() ? reduceAmount.value.trim() : undefined,
    }).catch(() => null);
    pw.value = '';
    if (x?.ok) return window.close();
    if (x?.error === 'REQUEST_EXPIRED') return gone();
    // L'action a échoué : on reste, on dit pourquoi ; réessayer ou refuser.
    err.textContent = x?.error === 'ACTION_FAILED' ? t('apFailed', { m: x.params?.message ?? '' }) : errorText(x?.error, x?.params);
    ok.disabled = false;
  };

  // Danger : maintenir 2 s (un clic, même automatisé ou hérité, ne suffit pas).
  if (ex.holdToSign) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      ok.classList.remove('holding');
    };
    ok.addEventListener('pointerdown', () => {
      if (ok.disabled) return;
      ok.classList.add('holding');
      timer = setTimeout(() => (stop(), void approve()), HOLD_MS);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ok.addEventListener(ev, stop);
  } else ok.addEventListener('click', () => void approve());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && void refuse());

  const list = (title: string, items: string[], cls: string) => items.length > 0 && h('div', { class: `card stack ${cls}`, style: 'gap:4px' }, h('p', { class: 'small muted' }, title), ...items.map((x) => h('strong', {}, x)));
  const refuseBtn = h('button', { class: 'btn secondary', type: 'button', on: { click: () => void refuse() } }, t('apRefuse'));
  app.replaceChildren(
    ...nodes(
      h('header', { class: 'bar' }, h('img', { src: '/icon/128.png', alt: '' }), h('strong', {}, 'Kalyx'), h('span', { class: 'small muted', style: 'margin-left:auto' }, url.host)),
      h('p', { class: 'small muted' }, ex.title + (rv.chainName ? ` · ${t('apNetwork', { n: rv.chainName })}` : '')),
      h('h1', { 'data-testid': 'headline' }, ex.headline),
      ex.detail && h('p', { class: 'muted' }, ex.detail),
      ex.risk !== 'none' &&
        h('div', { class: `banner ${ex.risk === 'danger' ? 'danger' : 'warn'}`, role: 'alert', 'data-testid': 'risk' }, h('div', {}, h('strong', {}, t(`apRisk_${ex.risk}` as 'apRisk_danger')), ...ex.reasons.map((x) => h('p', {}, x)))),
      list(t('apLose'), ex.lose, 'lose'),
      list(t('apReceive'), ex.receive, 'receive'),
      rv.messageText && h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'small muted' }, t('apMessage')), h('pre', { class: 'msg', 'data-testid': 'message' }, rv.messageText)),
      rv.reduce &&
        h(
          'div',
          { class: 'card stack', style: 'gap:8px' },
          h('label', { class: 'check' }, reduceBox, h('span', {}, t('apReduce'))),
          h('div', { class: 'amount' }, reduceAmount, h('span', { class: 'small muted' }, rv.reduce.symbol)),
          h('p', { class: 'small muted' }, t('apReduceHint', { s: rv.reduce.symbol })),
        ),
      rv.details.length > 0 && h('details', {}, h('summary', {}, t('apDetails')), ...rv.details.map((d) => h('div', { class: 'kv' }, h('span', { class: 'small muted' }, d.label), h('p', { class: 'mono small' }, d.value)))),
      askPassword && pw,
      ex.holdToSign && h('p', { class: 'small muted' }, t('apHoldHint')),
      err,
      // Danger : Refuser en premier (et focalisé), signer à droite.
      h('div', { class: 'actions' }, refuseBtn, ok),
    ),
  );
  if (ex.risk === 'danger') refuseBtn.focus();
  reduceAmount.addEventListener('input', () => (reduceBox.checked = !!reduceAmount.value.trim()));
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
