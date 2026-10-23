/**
 * ÉCHANGER (swap et pont). L'écran choisit et montre ; le service worker
 * garde le devis, le contrôle et signe (lib/swap). Ce qui est signé est le
 * devis montré, ou un devis plus récent qui garantit au moins autant.
 */
import { glyph } from './glyph';
import { h, send } from './dom';
import { play } from './sound';
import { errorText, LOCALE, t } from './i18n';

interface Source {
  key: string;
  chainId: string;
  chainName: string;
  family: 'evm' | 'solana';
  address: string;
  symbol: string;
  decimals: number;
  balanceFmt: string;
  maxInput: string;
}
interface Target {
  address: string;
  symbol: string;
  name: string;
}
interface Quote {
  id: string;
  fromAmount: string;
  fromSymbol: string;
  toAmount: string;
  toAmountMin: string;
  toSymbol: string;
  fromChain: string;
  toChain: string;
  bridge: boolean;
  tool: string;
  gas?: string;
  feeUsd?: number;
  gasUsd?: number;
  durationSec: number;
  slippagePct: number;
  impact: number | null;
  needsAck: boolean;
  approval: boolean;
  kalyxFeePct: number;
}
type R = { ok: boolean; error?: string; params?: Record<string, string> };

const SLIPPAGES = [0.001, 0.005, 0.01, 0.03];
const STAGES: Record<string, 'swStApproving' | 'swStApprovalWait' | 'swStSwapping'> = { approving: 'swStApproving', approvalWait: 'swStApprovalWait', swapping: 'swStSwapping' };

export function swapScreen(app: HTMLElement, back: () => void, opts: { onPhone: boolean }) {
  let sources: Source[] = [];
  let targets: Target[] = [];
  let networks: { id: string; name: string; family: string; hidden: boolean }[] = [];
  let slippage = 0.005;
  let quote: Quote | null = null;
  let askPassword = false;

  const err = h('p', { class: 'error', role: 'alert' });
  const fromSel = h('select', { 'aria-label': t('swFrom'), 'data-testid': 'sw-from' });
  const balance = h('p', { class: 'small muted' });
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off', 'aria-label': t('amount'), 'data-testid': 'sw-amount' });
  const maxBtn = h('button', { class: 'chip', type: 'button' }, t('max'));
  const toNet = h('select', { 'aria-label': t('network'), 'data-testid': 'sw-to-chain' });
  const toSel = h('select', { 'aria-label': t('swTo'), 'data-testid': 'sw-to' });
  const slipBox = h('div', { class: 'fees' });
  const quoteBox = h('div', { class: 'stack', style: 'gap:10px' });
  const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'sw-quote' }, t('swGetQuote'));
  const form = h('div', { class: 'stack', style: 'gap:10px' });

  const src = () => sources.find((s) => s.key === fromSel.value);
  const money = (n: number) => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

  /** Toute modification rend le devis caduc : il faut en redemander un. */
  const invalidate = () => {
    quote = null;
    quoteBox.replaceChildren();
    err.textContent = '';
    go.hidden = false;
  };

  function drawSlippage() {
    slipBox.replaceChildren(
      ...SLIPPAGES.map((s) =>
        h('button', { class: `fee${s === slippage ? ' on' : ''}`, type: 'button', on: { click: () => ((slippage = s), drawSlippage(), invalidate()) } }, h('strong', {}, `${(s * 100).toLocaleString(LOCALE)} %`)),
      ),
    );
  }

  async function loadTargets() {
    toSel.replaceChildren(h('option', { value: '' }, t('refreshing')));
    const r = await send<{ tokens: Target[] }>({ type: 'swap:targets', chainId: toNet.value });
    if (!r.ok) return void ((err.textContent = errorText(r.error)), toSel.replaceChildren());
    targets = r.tokens;
    const s = src();
    // Par défaut : un autre jeton que celui de départ.
    const first = targets.find((x) => !(s && toNet.value === s.chainId && x.address.toLowerCase() === s.address.toLowerCase()));
    toSel.replaceChildren(...targets.map((x) => h('option', { value: x.address, selected: x === first }, `${x.symbol} · ${x.name}`)));
  }

  function onSource() {
    const s = src();
    balance.textContent = s ? t('balanceIs', { b: `${s.balanceFmt} ${s.symbol}` }) : '';
    // Max : pour un jeton seulement ; le natif garde de quoi payer les frais.
    maxBtn.hidden = !s || s.address === '0x0000000000000000000000000000000000000000' || s.address === '11111111111111111111111111111111';
    // Réseau d'arrivée : celui de départ par défaut.
    if (s) toNet.value = s.chainId;
    invalidate();
    void loadTargets();
  }

  function quoteCard(q: Quote) {
    const kv = (k: string, v: string) => h('div', { class: 'kv-row' }, h('span', { class: 'muted' }, k), h('strong', {}, v));
    const ack = h('input', { type: 'checkbox', 'data-testid': 'sw-ack' });
    const password = h('input', { type: 'password', placeholder: t('pwCurrent'), autocomplete: 'current-password', maxLength: 1024, 'data-testid': 'sw-password' });
    const status = h('p', { class: 'small muted', role: 'status' });
    const confirm = h('button', { class: 'btn', type: 'button', 'data-testid': 'sw-confirm' }, glyph('exchange', 18), t(q.bridge ? 'swBridgeNow' : 'swSwapNow'));
    confirm.addEventListener('click', async () => {
      if (confirm.disabled) return;
      if (q.needsAck && !ack.checked) return void (err.textContent = t('ctAckNeeded'));
      confirm.disabled = true;
      err.textContent = '';
      status.textContent = opts.onPhone ? t('onPhoneHint') : t('swStSwapping');
      // Étapes (autorisation, échange) lues pendant l'attente.
      const timer = setInterval(async () => {
        const st = await send<{ stage: string | null }>({ type: 'swap:stage', id: q.id }).catch(() => null);
        const k = st?.ok && st.stage ? STAGES[st.stage] : undefined;
        if (k) status.textContent = `${t(k)}${opts.onPhone ? ` — ${t('onPhoneHint')}` : ''}`;
      }, 800);
      const r = await send<{ txid: string; explorer?: string }>({ type: 'swap:confirm', id: q.id, ack: ack.checked, password: askPassword ? password.value : undefined }).finally(() => (password.value = '')).catch((): R => ({ ok: false, error: 'INTERNAL' }));
      clearInterval(timer);
      confirm.disabled = false;
      status.textContent = '';
      if (!r.ok) {
        // Devis expiré ou moins bon : on le dit, et on en redemande un.
        err.textContent = errorText(r.error, (r as R).params);
        if (r.error === 'SWAP_QUOTE_GONE' || r.error === 'SWAP_QUOTE_WORSE') ((quote = null), (go.hidden = false));
        // Plafond journalier dépassé : le mot de passe est demandé, le devis reste valable.
        if ((r.error === 'CAP_PASSWORD' || r.error === 'PASSWORD_REQUIRED') && !askPassword) {
          askPassword = true;
          confirm.before(password);
          password.focus();
        }
        return;
      }
      const done = r as unknown as { txid: string; explorer?: string };
      play('success');
      quoteBox.replaceChildren(
        h(
          'div',
          { class: 'card stack', style: 'gap:8px', 'data-testid': 'sw-done' },
          h('p', { class: 'pill gain' }, glyph('check', 14), t('swSent')),
          h('p', { class: 'small muted' }, t('swSentNote')),
          done.explorer ? h('a', { class: 'btn secondary', href: done.explorer, target: '_blank', rel: 'noopener noreferrer' }, glyph('arrowUpRight', 18), t('viewExplorer')) : null,
          h('button', { class: 'btn', type: 'button', on: { click: back } }, t('done')),
        ),
      );
      go.hidden = true;
    });
    const impactPct = q.impact != null ? `${(q.impact * 100).toFixed(2)} %` : null;
    return h(
      'div',
      { class: 'stack', style: 'gap:10px', 'data-testid': 'sw-quote-card' },
      h(
        'section',
        { class: 'tx-hero' },
        h('p', { class: 'small muted' }, t('swYouGet')),
        h('p', { class: 'token-value' }, `≈ ${q.toAmount} ${q.toSymbol}`),
        h('p', { class: 'small muted' }, t('swMin', { v: `${q.toAmountMin} ${q.toSymbol}` })),
      ),
      h(
        'div',
        { class: 'card kv-card' },
        kv(t('swPay'), `${q.fromAmount} ${q.fromSymbol}`),
        kv(t('swRoute'), q.bridge ? `${q.tool} · ${q.fromChain} → ${q.toChain}` : `${q.tool} · ${q.fromChain}`),
        q.gas ? kv(t('fee'), q.gasUsd ? `${q.gas} (${money(q.gasUsd)})` : q.gas) : null,
        q.feeUsd ? kv(t('swServiceFee'), money(q.feeUsd)) : null,
        kv(t('swKalyxFee'), q.kalyxFeePct > 0 ? `${q.kalyxFeePct.toLocaleString(LOCALE)} %` : t('swNoFee')),
        kv(t('swSlippage'), `${q.slippagePct.toLocaleString(LOCALE)} %`),
        impactPct ? kv(t('swImpact'), impactPct) : null,
        q.durationSec ? kv(t('swDuration'), q.durationSec < 90 ? `${q.durationSec} s` : `${Math.round(q.durationSec / 60)} min`) : null,
      ),
      q.approval ? h('p', { class: 'small muted' }, glyph('sign', 14), ' ', t('swApprovalNote', { symbol: q.fromSymbol })) : null,
      q.needsAck ? h('div', { class: 'banner warn' }, glyph('warning', 16), h('span', { class: 'grow' }, t('swImpactWarn', { pct: impactPct ?? '' }))) : null,
      q.needsAck ? h('label', { class: 'check' }, ack, h('span', {}, t('swImpactAck'))) : null,
      askPassword ? password : null,
      status,
      confirm,
    );
  }

  go.addEventListener('click', async () => {
    if (go.disabled) return;
    const s = src();
    if (!s) return;
    err.textContent = '';
    go.disabled = true;
    go.textContent = t('swQuoting');
    const r = await send<{ quote: Quote }>({ type: 'swap:quote', from: s.key, toChainId: toNet.value, toToken: toSel.value, amount: amount.value.trim().replace(',', '.'), slippage }).catch((): R => ({ ok: false, error: 'INTERNAL' }));
    go.disabled = false;
    go.textContent = t('swGetQuote');
    if (!r.ok) return void (err.textContent = errorText(r.error, (r as R).params));
    quote = (r as unknown as { quote: Quote }).quote;
    quoteBox.replaceChildren(quoteCard(quote));
    go.hidden = true;
  });

  fromSel.addEventListener('change', onSource);
  toNet.addEventListener('change', () => (invalidate(), void loadTargets()));
  toSel.addEventListener('change', invalidate);
  amount.addEventListener('input', invalidate);
  maxBtn.addEventListener('click', () => {
    const s = src();
    if (s) amount.value = s.maxInput;
    invalidate();
  });

  app.replaceChildren(
    h(
      'div',
      { class: 'screen enter' },
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('swTitle')),
      h('p', { class: 'small muted' }, t('swIntro')),
      form,
    ),
  );
  form.append(
      h('label', { class: 'small muted' }, t('swFrom')),
      fromSel,
      balance,
      h('div', { class: 'amount' }, amount, maxBtn),
      h('label', { class: 'small muted' }, t('swTo')),
      toNet,
      toSel,
      h('p', { class: 'small muted' }, t('swSlippage')),
      slipBox,
      err,
      go,
      quoteBox,
  );
  drawSlippage();

  void (async () => {
    const [s, n, a] = await Promise.all([
      send<{ sources: Source[] }>({ type: 'swap:sources' }),
      send<{ networks: typeof networks }>({ type: 'assets:networks' }),
      send<{ on: boolean }>({ type: 'settings:get-ask-password' }),
    ]);
    askPassword = !!(a.ok && a.on);
    if (!s.ok) return void (err.textContent = errorText(s.error));
    sources = s.sources;
    networks = n.ok ? n.networks.filter((x) => !x.hidden) : [];
    // Rien à échanger : on le dit, sans formulaire vide.
    if (!sources.length) return void form.replaceChildren(h('div', { class: 'empty-card card', 'data-testid': 'sw-empty' }, glyph('exchange', 28), h('p', { class: 'muted' }, t('swNoSource'))));
    fromSel.replaceChildren(...sources.map((x) => h('option', { value: x.key }, `${x.symbol} · ${x.chainName} — ${x.balanceFmt}`)));
    toNet.replaceChildren(...networks.map((x) => h('option', { value: x.id }, x.name)));
    onSource();
  })();
}
