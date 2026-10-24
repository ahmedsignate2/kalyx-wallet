/**
 * ENVOYER — trois temps : saisir, vérifier, suivre.
 *
 * Rien n'est signé ici : la page ne voit ni clé ni phrase. Elle demande un
 * brouillon au service worker, le montre tel qu'il sera signé (adresse
 * complète, frais, avertissements), puis demande sa signature par son
 * identifiant. Le bouton de confirmation s'active après un court délai : un
 * double-clic hérité de l'écran précédent ne confirme rien.
 */
import { glyph } from './glyph';
import { h, nodes, send } from './dom';
import { play } from './sound';
import { activityT, errorText, LOCALE, t } from './i18n';
import type { AssetView, DraftView, QuoteView } from '../lib/send';
import { addressView } from './address';
import { pickContactSheet } from './contactsScreen';

type Speed = 'slow' | 'normal' | 'fast';
type Reply = { ok: boolean; error?: string; params?: Record<string, string> };

const CONFIRM_DELAY_MS = 1200;

function errorOf(r: Reply | null): string {
  return errorText(r?.error, r?.params);
}

export function sendScreen(app: HTMLElement, back: () => void) {
  let assets: AssetView[] = [];
  let quote: QuoteView | null = null;
  let quoteFor = '';
  let speed: Speed | 'manual' = 'normal';

  const err = h('p', { class: 'error', role: 'alert' });
  const assetSel = h('select', { 'aria-label': t('asset') });
  const balance = h('p', { class: 'small muted' });
  const to = h('input', { type: 'text', placeholder: t('recipientPh'), autocomplete: 'off', spellcheck: false });
  const amount = h('input', { type: 'text', inputMode: 'decimal', placeholder: '0.0', autocomplete: 'off' });
  const approx = h('p', { class: 'small muted' });
  // TON seulement : les plateformes d'échange identifient le dépôt par ce commentaire.
  const memo = h('input', { type: 'text', placeholder: t('memoPh'), autocomplete: 'off', spellcheck: false, maxLength: 120, 'data-testid': 'send-memo' });
  const memoBox = h('label', { class: 'small muted stack', style: 'gap:6px', hidden: true }, t('memoLabel'), memo);
  let useMax = false;
  const maxBtn = h('button', { class: 'chip', type: 'button' }, t('max'));
  const feeBox = h('div', { class: 'stack', style: 'gap:8px' });
  const maxFee = h('input', { type: 'text', inputMode: 'decimal', 'aria-label': t('maxFee') });
  const prio = h('input', { type: 'text', inputMode: 'decimal', 'aria-label': t('priorityFee') });
  const go = h('button', { class: 'btn', type: 'submit' }, t('review'));

  const asset = () => assets.find((a) => a.key === assetSel.value);

  function renderFees() {
    const a = asset();
    const chips: Node[] = [];
    if (a?.family === 'ton') {
      feeBox.replaceChildren(h('p', { class: 'small muted' }, t('feeTon')));
      return;
    }
    if (!quote) {
      feeBox.replaceChildren(h('p', { class: 'small muted' }, quoteFor ? t('feeLoading') : t('feeUnavailable')));
      return;
    }
    const label: Record<Speed, string> = { slow: t('feeSlow'), normal: t('feeNormal'), fast: t('feeFast') };
    for (const s of ['slow', 'normal', 'fast'] as Speed[]) {
      chips.push(
        h(
          'button',
          { class: `fee${speed === s ? ' on' : ''}`, type: 'button', on: { click: () => ((speed = s), renderFees()) } },
          h('strong', {}, label[s]),
          h('span', { class: 'small muted' }, `${quote.speeds[s].costFmt} ${quote.nativeSymbol}`),
        ),
      );
    }
    if (quote.manual && a?.family === 'evm') {
      chips.push(h('button', { class: `fee${speed === 'manual' ? ' on' : ''}`, type: 'button', on: { click: () => ((speed = 'manual'), renderFees()) } }, h('strong', {}, t('feeManual')), h('span', { class: 'small muted' }, 'gwei')));
    }
    feeBox.replaceChildren(...nodes(
      h('p', { class: 'small muted' }, t('fee')),
      h('div', { class: 'fees' }, ...chips),
      speed === 'manual' && h('div', { class: 'row2' }, h('label', { class: 'small muted' }, t('maxFee'), maxFee), h('label', { class: 'small muted' }, t('priorityFee'), prio)),
    ));
  }

  async function loadQuote() {
    const a = asset();
    if (!a || a.family === 'ton') return renderFees();
    const key = `${a.key}|${to.value.trim()}`;
    if (key === quoteFor && quote) return;
    quoteFor = key;
    quote = null;
    renderFees();
    const r = await send<{ quote: QuoteView }>({ type: 'send:quote', assetKey: a.key, to: to.value.trim() || undefined }).catch(() => null);
    if (quoteFor !== key) return; // une autre demande est partie entre-temps
    quote = r?.ok ? r.quote : null;
    if (!quote) quoteFor = '';
    if (quote?.manual && !maxFee.value) {
      maxFee.value = quote.manual.maxFeeGwei;
      prio.value = quote.manual.priorityGwei;
    }
    if (speed === 'manual' && !quote?.manual) speed = 'normal';
    renderFees();
  }

  function onAsset() {
    const a = asset();
    balance.textContent = a ? (a.balanceFmt != null ? t('balanceIs', { b: `${a.balanceFmt} ${a.symbol}` }) : t('balanceUnknown')) : '';
    to.placeholder = a?.family === 'solana' ? t('recipientPhSol') : a?.family === 'bitcoin' ? t('recipientPhBtc') : a?.family === 'ton' ? t('recipientPhTon') : t('recipientPh');
    memoBox.hidden = a?.family !== 'ton';
    if (memoBox.hidden) memo.value = '';
    maxBtn.disabled = !a || a.balanceFmt == null;
    useMax = false;
    maxBtn.classList.remove('on');
    maxFee.value = prio.value = '';
    quote = null;
    quoteFor = '';
    void loadQuote();
    updateApprox();
  }

  function updateApprox() {
    const a = asset();
    const n = Number(amount.value.replace(',', '.'));
    approx.textContent = a && a.price > 0 && n > 0 && !useMax ? t('fiatApprox', { v: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n * a.price) }) : '';
  }

  assetSel.addEventListener('change', onAsset);
  to.addEventListener('change', () => void loadQuote());
  amount.addEventListener('input', () => {
    useMax = false;
    maxBtn.classList.remove('on');
    err.textContent = '';
    updateApprox();
  });
  maxBtn.addEventListener('click', () => {
    const a = asset();
    if (!a?.balanceFmt) return;
    useMax = true;
    maxBtn.classList.add('on');
    amount.value = a.balanceFmt;
    updateApprox();
  });

  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          const a = asset();
          if (!a || !to.value.trim() || (!useMax && !amount.value.trim())) return;
          err.textContent = '';
          go.disabled = true;
          const r = await send<{ draft: DraftView }>({
            type: 'send:prepare',
            assetKey: a.key,
            to: to.value.trim(),
            amount: amount.value.trim(),
            max: useMax,
            memo: a.family === 'ton' && memo.value.trim() ? memo.value.trim() : undefined,
            speed: speed === 'manual' ? 'normal' : speed,
            manual: speed === 'manual' ? { maxFeeGwei: maxFee.value.trim(), priorityGwei: prio.value.trim() } : undefined,
          }).catch(() => null);
          go.disabled = false;
          if (!r?.ok) return void (err.textContent = errorOf(r));
          reviewScreen(app, r.draft, a, () => render(), back);
        },
      },
    },
    h('label', { class: 'small muted' }, t('asset')),
    assetSel,
    balance,
    // Un contact ne fait que remplir le champ : la suite (vérifications, revue) est la même.
    h(
      'div',
      { class: 'label-row' },
      h('label', { class: 'small muted' }, t('recipient')),
      h('button', { class: 'chip', type: 'button', 'data-testid': 'send-contacts', on: { click: () => void pickContactSheet(asset()?.family, (addr) => ((to.value = addr), to.dispatchEvent(new Event('change')))) } }, glyph('wallet', 14), t('ctTitle')),
    ),
    to,
    h('label', { class: 'small muted' }, t('amount')),
    h('div', { class: 'amount' }, amount, maxBtn),
    approx,
    memoBox,
    feeBox,
    err,
    go,
  );

  function render() {
    app.replaceChildren(h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))), h('h1', {}, t('send')), form);
  }

  void (async () => {
    render();
    const r = await send<{ assets: AssetView[] }>({ type: 'send:assets' }).catch(() => null);
    if (!r?.ok) return void (err.textContent = errorOf(r));
    assets = r.assets;
    assetSel.replaceChildren(...assets.map((a) => h('option', { value: a.key }, `${a.symbol} · ${a.chainName}${a.balanceFmt != null ? ` — ${a.balanceFmt}` : ''}`)));
    onAsset();
    to.focus();
  })();
}

function reviewScreen(app: HTMLElement, d: DraftView, a: AssetView, edit: () => void, done: () => void) {
  const err = h('p', { class: 'error', role: 'alert' });
  const ack = h('input', { type: 'checkbox', style: 'width:auto' });
  const go = h('button', { class: 'btn', type: 'button', disabled: true }, t('confirmSend'));
  // Mode compagnon : pendant la confirmation, la demande attend sur le téléphone.
  const phoneWait = h('p', { class: 'pill quiet status', hidden: true, role: 'status', 'data-testid': 'on-phone' }, h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }), t('onPhoneHint'));
  // Plafond journalier dépassé (ou « redemander le mot de passe ») : le champ n'apparaît qu'à la demande du service worker.
  const capNote = h('p', { class: 'banner warn', hidden: true, role: 'status', 'data-testid': 'cap-note' });
  const pw = h('input', { type: 'password', placeholder: t('pwCurrent'), autocomplete: 'current-password', maxLength: 1024, hidden: true, 'data-testid': 'cap-password' });
  const ready = () => (go.disabled = !!d.poisoning && !ack.checked);
  setTimeout(ready, CONFIRM_DELAY_MS);
  ack.addEventListener('change', () => setTimeout(ready, 0));

  go.addEventListener('click', async () => {
    go.disabled = true;
    go.textContent = t('sending');
    err.textContent = '';
    phoneWait.hidden = !d.onPhone;
    const r = await send<{ txid: string; explorer?: string }>({ type: 'send:confirm', id: d.id, acceptRisk: !!d.poisoning && ack.checked, password: pw.value || undefined }).catch(() => null);
    phoneWait.hidden = true;
    pw.value = '';
    if (!r?.ok) {
      go.textContent = t('confirmSend');
      if (r?.error === 'CAP_PASSWORD' || r?.error === 'PASSWORD_REQUIRED') {
        capNote.hidden = r.error !== 'CAP_PASSWORD';
        capNote.textContent = t('capNote', { remaining: (r.params as Record<string, string> | undefined)?.remaining ?? '0' });
        pw.hidden = false;
        go.disabled = false;
        return void pw.focus();
      }
      // Brouillon consommé ou périmé : on repart de la saisie.
      err.textContent = errorOf(r);
      if (r?.error === 'REQUEST_EXPIRED' || r?.error === 'WRONG_ACCOUNT') setTimeout(edit, 1600);
      else go.disabled = false;
      return;
    }
    sentScreen(app, r.txid, r.explorer, done);
  });

  const line = (k: string, ...v: (Node | string)[]) => h('div', { class: 'kv' }, h('span', { class: 'small muted' }, k), h('div', {}, ...v));
  const sameAsset = a.contract == null;
  app.replaceChildren(...nodes(
    h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: edit } }, glyph('back', 18), t('back'))),
    h('h1', {}, t('reviewTitle')),
    h('p', { class: 'total' }, `${d.amountFmt} ${d.symbol}`),
    d.poisoning &&
      h(
        'div',
        { class: 'banner danger', role: 'alert' },
        h('div', {}, h('strong', {}, t('poisonTitle')), h('p', {}, t('poisonBody', { addr: d.poisoning.similarTo }))),
      ),
    h(
      'div',
      { class: 'card stack', style: 'gap:10px' },
      line(t('to'), d.ens ? h('strong', {}, d.ens) : '', h('p', { class: 'addr' }, addressView(d.to))),
      line(t('network'), d.chainName),
      d.memo && line(t('memoLabel'), h('p', { class: 'mono small', 'data-testid': 'review-memo' }, d.memo)),
      line(t('from'), h('p', { class: 'addr' }, addressView(d.from, 'sm'))),
      line(t('fee'), `${d.feeFmt} ${d.nativeSymbol}`),
      sameAsset && line(t('totalCost'), `${formatSum(d.amount, d.fee, a.decimals)} ${d.symbol}`),
    ),
    d.newRecipient && !d.poisoning && h('div', { class: 'banner warn' }, h('span', {}, t('newRecipient'))),
    ...d.warnings.map((w) => h('div', { class: 'banner warn' }, h('span', {}, activityT(`w_${w}`)))),
    d.poisoning && h('label', { class: 'check' }, ack, h('span', {}, t('poisonAck'))),
    phoneWait,
    capNote,
    pw,
    err,
    go,
  ));
}

/** Montant + frais, en unités humaines (même pièce : envoi natif). */
function formatSum(amount: string, fee: string, decimals: number): string {
  const v = BigInt(amount) + BigInt(fee);
  const s = v.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '').slice(0, 8);
  return frac ? `${int}.${frac}` : int;
}

function sentScreen(app: HTMLElement, txid: string, explorer: string | undefined, done: () => void) {
  const status = h('p', { class: 'muted', role: 'status' }, t('statusPending'));
  play('success');
  app.replaceChildren(
    h('div', { class: 'center' }, h('div', { class: 'success-badge' }, glyph('check', 34)), h('h1', {}, t('sentTitle')), h('p', { class: 'mono small' }, `${txid.slice(0, 10)}…${txid.slice(-8)}`), status,
      explorer && h('a', { class: 'btn secondary', href: explorer, target: '_blank', rel: 'noopener noreferrer' }, t('viewExplorer')),
      h('button', { class: 'btn', type: 'button', on: { click: done } }, t('done')),
    ),
  );
  void send<{ state: { status: string } }>({ type: 'send:status', txid })
    .then((r) => {
      const s = r.ok ? r.state.status : '';
      status.textContent = s === 'confirmed' ? t('statusConfirmed') : s === 'failed' ? t('statusFailed') : s === 'expired' ? t('statusExpired') : t('statusUnknown');
      status.className = s === 'confirmed' ? 'up' : s === 'failed' || s === 'expired' ? 'down' : 'muted';
    })
    .catch(() => (status.textContent = t('statusUnknown')));
}
