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
import { mountScene } from '../../ui/landscape';
import { h, nodes, send } from '../../ui/dom';
import { applyLang, errorText, hasErrorText, t } from '../../ui/i18n';
import { lockedScreen } from '../../ui/screens';
import { glyph } from '../../ui/glyph';
import { avatar } from '../../ui/avatar';
import { openSheet } from '../../ui/sheet';
import { addressView } from '../../ui/address';

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
  score: { score: number; level: 'low' | 'medium' | 'high'; factors: { code: string; points: number; params?: Record<string, string> }[] };
  outFiat: number | null;
  approval?: { chainId: string; chainName: string; token: string; symbol: string; spender: string };
}
interface WalletMeta {
  id: string;
  label: string;
  kind?: 'seed' | 'privateKey' | 'companion';
  lost?: boolean;
  accounts: { index: number; evm?: string; solana?: string }[];
}
interface SiteReport {
  verdict: 'safe' | 'phishing' | 'unknown';
  lookalike: string | null;
  known: boolean;
}
/** Icône du site (lue par Chrome dans l'onglet) ; à défaut, le monogramme. */
let siteIcon: string | undefined;

applyLang();
mountScene();
const app = document.getElementById('app')!;
const id = location.hash.slice(1);
/** Le bouton d'accord s'active après un instant : un clic resté en vol ne vaut pas accord. */
const ARM_MS = 700;

function gone() {
  app.replaceChildren(h('div', { class: 'center' }, h('p', { class: 'muted' }, t('apGone')), h('button', { class: 'btn', type: 'button', on: { click: () => window.close() } }, t('close'))));
}

async function load() {
  const r = await send<{ request: Req; icon?: string; unlocked: boolean; wallets: WalletMeta[]; selected: { walletId: string; index: number } | null }>({ type: 'approval:get', id }).catch(() => null);
  if (!r?.ok) return gone();
  siteIcon = r.icon;
  if (!r.unlocked) return lockedScreen(app, () => void load());
  if (r.request.kind === 'sign') return signScreen(r.request);
  connectScreen(r.request, r.wallets, r.selected);
}

const HOLD_MS = 2000;

/**
 * Le site en tête : son monogramme relié à Kalyx, son domaine en grand, son
 * origine exacte avec le cadenas (ou l'alerte s'il n'est pas en https).
 */
function siteHero(origin: string, testid = true) {
  const url = new URL(origin);
  const secure = url.protocol === 'https:';
  const name = url.hostname.replace(/^www\./, '');
  const monogram = () => h('span', { class: 'site-mark', 'aria-hidden': 'true' }, avatar(name, 52), h('b', {}, name.slice(0, 1).toUpperCase()));
  let mark: HTMLElement = monogram();
  if (siteIcon) {
    const img = h('img', { class: 'site-icon', src: siteIcon, alt: '', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(monogram()));
    mark = h('span', { class: 'site-mark has-icon', 'aria-hidden': 'true' }, img);
  }
  return h(
    'section',
    { class: 'site-hero' },
    h('div', { class: 'link-visual', 'aria-hidden': 'true' }, mark, h('span', { class: 'link-dots' }, h('i'), h('i'), h('i')), h('img', { class: 'kalyx-mark', src: '/icon/128.png', alt: '' })),
    h('p', { class: 'site', 'data-testid': testid ? 'site-host' : false }, url.host),
    h('p', { class: `origin ${secure ? 'secure' : 'insecure'}` }, glyph(secure ? 'lock' : 'warning', 12), h('span', { class: 'mono' }, origin)),
  );
}

/**
 * Score de risque : un nombre, une jauge, puis les raisons de la plus lourde
 * à la plus légère (trois visibles, le reste en dépliant). Calculé localement.
 */
function scoreCard(sc: Review['score']) {
  const row = (f: Review['score']['factors'][number]) => h('li', {}, h('span', { class: 'pts' }, `+${f.points}`), h('span', {}, t(`rk_${f.code}` as 'rk_lossOnly', f.params ?? {})));
  return h(
    'section',
    { class: `card score ${sc.level}`, 'data-testid': 'risk-score', 'aria-label': t('rkTitle') },
    h(
      'div',
      { class: 'score-head' },
      h('strong', {}, `${t('rkTitle')} · ${t(sc.level === 'high' ? 'rkHigh' : sc.level === 'medium' ? 'rkMedium' : 'rkLow')}`),
      h('span', { class: 'score-num', 'data-testid': 'risk-num' }, t('rkScore', { score: sc.score })),
    ),
    h('div', { class: 'meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(sc.score), 'aria-label': t('rkTitle') }, h('i', { style: `width:${Math.max(3, sc.score)}%` })),
    sc.factors.length ? h('ul', { class: 'factors' }, ...sc.factors.slice(0, 3).map(row)) : h('p', { class: 'small muted' }, t('rkNone')),
    sc.factors.length > 3 && h('details', {}, h('summary', {}, t('rkMore', { n: sc.factors.length - 3 })), h('ul', { class: 'factors' }, ...sc.factors.slice(3).map(row))),
    h('p', { class: 'small muted' }, t('rkLocal')),
  );
}

async function signScreen(req: Req) {
  app.replaceChildren(h('header', { class: 'bar' }, h('img', { src: '/icon/128.png', alt: '' }), h('strong', {}, 'Kalyx')), h('p', { class: 'muted', role: 'status' }, t('apAnalyzing')));
  const r = await send<{ review: Review; askPassword: boolean; capPassword?: boolean; capRemaining?: number | null; onPhone?: boolean }>({ type: 'approval:review', id, lang: navigator.language }).catch(() => null);
  if (!r?.ok) return r?.error === 'REQUEST_EXPIRED' ? gone() : void app.append(h('p', { class: 'error' }, errorText(r?.error)));
  const { review: rv, askPassword, capPassword, capRemaining, onPhone } = r;
  const ex = rv.explanation;
  // Score élevé : comme un danger, il faut maintenir pour signer (même si l'explication seule ne l'exigeait pas).
  const hold = ex.holdToSign || rv.score.level === 'high';
  const err = h('p', { class: 'error', role: 'alert' });
  const pw = h('input', { type: 'password', placeholder: t('apPassword'), autocomplete: 'current-password' });
  // Montant exact par défaut quand la simulation le connaît : on n'accorde que ce qu'il faut.
  const reduceBox = h('input', { type: 'checkbox', style: 'width:auto', checked: !!rv.reduce?.suggested, 'data-testid': 'reduce' });
  // Autorisation : rappel de révocation à l'échéance choisie (24 h par défaut).
  const remind = h(
    'select',
    { class: 'inline', 'aria-label': t('grRemind'), 'data-testid': 'remind' },
    ...[1, 24, 168, 0].map((hrs) => h('option', { value: String(hrs), selected: hrs === 24 }, t(hrs === 0 ? 'grNever' : hrs === 1 ? 'grIn1h' : hrs === 24 ? 'grIn24h' : 'grIn7d'))),
  );
  const reduceAmount = h('input', { type: 'text', inputMode: 'decimal', value: rv.reduce?.suggested ?? '', placeholder: '0.0', 'aria-label': t('apReduce') });
  const sending = rv.method === 'eth_sendTransaction' || rv.method === 'solana:signAndSendTransaction';
  // Domaine sosie d'un site connu : l'alerte suit jusque dans la signature.
  const lookalikeBox = h('div', {});
  void send<SiteReport>({ type: 'approval:site', id }).then((x) => {
    if (x?.ok && x.lookalike) lookalikeBox.replaceChildren(h('div', { class: 'banner danger', role: 'alert' }, glyph('warning', 18), h('span', {}, t('apSiteLookalike', { brand: x.lookalike }))));
  });
  const label = hold ? t('apHold') : onPhone ? t('sendToPhone') : sending ? t('apConfirm') : t('apSign');
  // Mode compagnon : la signature se fait sur le téléphone ; pendant l'attente, on le dit.
  const phoneWait = h('p', { class: 'pill quiet status', hidden: true, role: 'status', 'data-testid': 'on-phone' }, h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }), t('onPhoneHint'));
  const ok = h('button', { class: `btn arming ${ex.risk === 'danger' ? 'danger' : ''}`, type: 'button', disabled: true, style: `--arm:${ARM_MS}ms` }, label);
  setTimeout(() => ((ok.disabled = false), ok.classList.remove('arming')), ARM_MS);

  const refuse = async () => {
    await send({ type: 'approval:respond', id, approve: false }).catch(() => {});
    window.close();
  };
  const approve = async () => {
    if (ok.disabled) return;
    if (askPassword && !pw.value) return void (err.textContent = errorText('PASSWORD_REQUIRED'));
    ok.disabled = true;
    err.textContent = '';
    phoneWait.hidden = !onPhone;
    const x = await send<{ params?: Record<string, string> }>({
      type: 'approval:respond',
      id,
      approve: true,
      password: askPassword ? pw.value : undefined,
      reduceTo: rv.reduce && reduceBox.checked && reduceAmount.value.trim() ? reduceAmount.value.trim() : undefined,
      remindHours: rv.approval ? Number(remind.value) : undefined,
    }).catch(() => null);
    pw.value = '';
    phoneWait.hidden = true;
    if (x?.ok) return window.close();
    if (x?.error === 'REQUEST_EXPIRED') return gone();
    // L'action a échoué : on reste, on dit pourquoi ; réessayer ou refuser.
    // Raison connue : dans la langue de la fenêtre ; sinon le message (court) de l'échec.
    const reason = x?.params?.reason;
    err.textContent = x?.error === 'ACTION_FAILED' ? t('apFailed', { m: hasErrorText(reason) ? errorText(reason) : (x.params?.message ?? '') }) : errorText(x?.error, x?.params);
    ok.disabled = false;
  };

  // Danger : maintenir 2 s (un clic, même automatisé ou hérité, ne suffit pas).
  if (hold) {
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
      siteHero(req.origin, false),
      lookalikeBox,
      h('div', { class: 'kicker' }, h('span', { class: `risk-pill ${ex.risk}` }, glyph(ex.risk === 'none' ? 'check' : 'warning', 12), ex.risk === 'none' ? ex.title : t(`apRisk_${ex.risk}` as 'apRisk_danger')), rv.chainName && h('span', { class: 'small muted' }, rv.chainName)),
      h('h1', { 'data-testid': 'headline' }, ex.headline),
      scoreCard(rv.score),
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
      rv.approval && h('label', { class: 'row-inline small' }, h('span', { class: 'grow muted' }, t('grRemind')), remind),
      capPassword && h('p', { class: 'banner warn', role: 'status', 'data-testid': 'cap-note' }, glyph('warning', 16), h('span', { class: 'grow' }, t('capNote', { remaining: String(Math.floor(capRemaining ?? 0)) }))),
      askPassword && pw,
      hold && h('p', { class: 'small muted' }, t('apHoldHint')),
      phoneWait,
      err,
      // Danger : Refuser en premier (et focalisé), signer à droite.
      h('div', { class: 'dock' }, h('div', { class: 'actions' }, refuseBtn, ok)),
    ),
  );
  if (ex.risk === 'danger') refuseBtn.focus();
  reduceAmount.addEventListener('input', () => (reduceBox.checked = !!reduceAmount.value.trim()));
}

function connectScreen(req: Req, wallets: WalletMeta[], selected: { walletId: string; index: number } | null) {
  const url = new URL(req.origin);
  // Tous les comptes de tous les portefeuilles (téléphone compris), groupés par portefeuille.
  const options = wallets.flatMap((w) =>
    w.accounts
      .filter((a) => (req.family === 'evm' ? a.evm : a.solana))
      .map((a) => ({ value: `${w.id}|${a.index}`, wallet: w, label: t('account', { n: a.index + 1 }), address: (req.family === 'evm' ? a.evm : a.solana)!, phone: w.kind === 'companion', lost: !!w.lost })),
  );
  type Opt = (typeof options)[number];
  // Le compte proposé : celui de l'accueil, sinon le premier utilisable ; une feuille pour en choisir un autre.
  let chosen: Opt | undefined = options.find((o) => o.value === `${selected?.walletId}|${selected?.index}` && !o.lost) ?? options.find((o) => !o.lost) ?? options[0];
  const badge = (o: Opt) => (o.phone ? h('span', { class: `beta phone${o.lost ? ' lost' : ''}` }, t('phoneBadge')) : null);
  const acctCard = h('button', { class: 'card acct-card', type: 'button', 'aria-haspopup': 'dialog', 'data-testid': 'connect-account', on: { click: () => pick() } });
  const paint = () =>
    acctCard.replaceChildren(
      ...(chosen
        ? [
            avatar(chosen.address, 40),
            h('span', { class: 'grow' }, h('span', { class: 'acct-line' }, h('strong', { class: 'ellipsis' }, `${chosen.wallet.label} · ${chosen.label}`), badge(chosen)), h('p', { class: 'small' }, addressView(chosen.address, 'sm'))),
            options.length > 1 ? glyph('caretDown', 16) : '',
          ]
        : [h('span', { class: 'muted' }, errorText('NO_ACCOUNT'))]),
    );
  const pick = () => {
    if (options.length < 2) return;
    const groups = wallets
      .map((w) => ({ w, opts: options.filter((o) => o.wallet === w) }))
      .filter((g) => g.opts.length)
      .map(({ w, opts }) =>
        h(
          'section',
          { class: 'group' },
          h('p', { class: 'group-title' }, w.label),
          h(
            'div',
            { class: 'list card' },
            ...opts.map((o) =>
              h(
                'button',
                { class: `row link-row acct-row${o === chosen ? ' on' : ''}`, type: 'button', disabled: o.lost, title: o.lost ? t('e_COMPANION_LOST') : false, on: { click: () => ((chosen = o), paint(), sheet.close()) } },
                avatar(o.address, 36),
                h('span', { class: 'grow' }, h('strong', {}, o.label), h('p', { class: 'small muted mono' }, `${o.address.slice(0, 6)}…${o.address.slice(-4)}`), o.lost ? h('p', { class: 'small error' }, t('e_COMPANION_LOST')) : null),
                o === chosen ? h('span', { class: 'tick' }, glyph('check', 18)) : null,
              ),
            ),
          ),
        ),
      );
    const sheet = openSheet(t('apAccount'), ...groups);
  };
  paint();
  const err = h('p', { class: 'error', role: 'alert' });
  const ok = h('button', { class: 'btn arming', type: 'button', disabled: true, style: `--arm:${ARM_MS}ms` }, t('apConnect'));
  // Site signalé ou sosie : se connecter exige de cocher « je comprends le risque ».
  let armed = false;
  let needAck = false;
  const ack = h('input', { type: 'checkbox', style: 'width:auto' });
  const ackRow = h('label', { class: 'check', hidden: true }, ack, h('span', {}, t('apRiskAck')));
  const ready = () => (ok.disabled = !armed || !chosen || chosen.lost || (needAck && !ack.checked));
  ack.addEventListener('change', ready);
  setTimeout(() => ((armed = true), ok.classList.remove('arming'), ready()), ARM_MS);
  const siteBox = h('div', { class: 'site-check', 'data-testid': 'site-check' }, h('p', { class: 'small muted' }, h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }), t('apSiteChecking')));
  void send<SiteReport>({ type: 'approval:site', id }).then((x) => {
    if (!x?.ok) return void siteBox.replaceChildren();
    const lines: Node[] = [];
    if (x.verdict === 'phishing') lines.push(h('div', { class: 'banner danger', role: 'alert' }, glyph('warning', 18), h('span', {}, t('apSitePhishing'))));
    if (x.lookalike) lines.push(h('div', { class: 'banner danger', role: 'alert' }, glyph('warning', 18), h('span', {}, t('apSiteLookalike', { brand: x.lookalike }))));
    needAck = lines.length > 0;
    ackRow.hidden = !needAck;
    const facts = [x.known ? t('apSiteKnown') : t('apSiteNew'), x.verdict === 'safe' ? t('apSiteClean') : x.verdict === 'unknown' ? t('apSiteUnchecked') : null].filter(Boolean).join(' · ');
    lines.push(h('p', { class: `small ${x.verdict === 'safe' && !needAck ? 'up' : 'muted'}` }, glyph(x.verdict === 'safe' && !needAck ? 'security' : 'about', 14), facts));
    siteBox.replaceChildren(...lines);
    ready();
  });
  const refuse = async () => {
    await send({ type: 'approval:respond', id, approve: false }).catch(() => {});
    window.close();
  };
  ok.addEventListener('click', async () => {
    if (ok.disabled || !chosen || chosen.lost) return;
    ok.disabled = true;
    const [walletId, index] = chosen.value.split('|');
    const r = await send({ type: 'approval:respond', id, approve: true, walletId, index: Number(index) }).catch(() => null);
    if (r?.ok) return window.close();
    if (r?.error === 'REQUEST_EXPIRED') return gone();
    err.textContent = t('e_INTERNAL');
    ok.disabled = false;
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && void refuse());

  app.replaceChildren(
    ...nodes(
      siteHero(req.origin),
      h('p', { class: 'kicker center-text' }, t('apTitle')),
      url.hostname.split('.').some((p) => p.startsWith('xn--')) && h('div', { class: 'banner danger' }, h('span', {}, t('apIdn'))),
      url.protocol === 'http:' && h('div', { class: 'banner warn' }, h('span', {}, t('apLocal'))),
      siteBox,
      h('p', { class: 'group-title' }, `${t('apAccount')} · ${req.family === 'evm' ? t('apFamilyEvm') : t('apFamilySol')}`),
      acctCard,
      h('div', { class: 'perm' }, glyph('eye', 18), h('p', { class: 'small' }, t('apBody'))),
      ackRow,
      err,
      h('div', { class: 'dock' }, h('div', { class: 'actions' }, h('button', { class: 'btn secondary', type: 'button', on: { click: () => void refuse() } }, t('apRefuse')), ok)),
    ),
  );
}

if (!/^[0-9a-f-]{36}$/.test(id)) gone();
else void load();
