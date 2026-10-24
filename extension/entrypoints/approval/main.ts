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
import { isExpert } from '../../ui/prefs';
import { play } from '../../ui/sound';
import { reducedMotion } from '../../ui/motion';

const NS = 'http://www.w3.org/2000/svg';

interface Req {
  id: string;
  origin: string;
  kind: 'connect' | 'sign';
  family: 'evm' | 'solana' | 'bitcoin';
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
  preview?: { status: 'unavailable' | 'failed'; error?: string };
  approval?: { chainId: string; chainName: string; token: string; symbol: string; spender: string };
}
interface WalletMeta {
  id: string;
  label: string;
  kind?: 'seed' | 'privateKey' | 'companion';
  lost?: boolean;
  accounts: { index: number; evm?: string; solana?: string; bitcoin?: string }[];
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

/** Le site, en une ligne (fenêtre de signature : le verdict passe avant). */
function siteBar(origin: string) {
  const url = new URL(origin);
  const secure = url.protocol === 'https:';
  const name = url.hostname.replace(/^www\./, '');
  const mono = () => h('span', { class: 'site-mini', 'aria-hidden': 'true' }, avatar(name, 28), h('b', {}, name.slice(0, 1).toUpperCase()));
  let mark: HTMLElement = mono();
  if (siteIcon) {
    const img = h('img', { class: 'site-mini-icon', src: siteIcon, alt: '', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(mono()));
    mark = img;
  }
  return h(
    'header',
    { class: 'site-bar' },
    mark,
    h('span', { class: 'grow' }, h('strong', { class: 'ellipsis' }, url.host), h('span', { class: `origin ${secure ? 'secure' : 'insecure'}` }, glyph(secure ? 'lock' : 'warning', 11), secure ? 'https' : 'http')),
    h('img', { class: 'kalyx-mini', src: '/icon/32.png', alt: 'Kalyx' }),
  );
}

type Level = 'low' | 'medium' | 'high';

/** Le niveau affiché : le pire de l'explication (danger / à vérifier) et du score. */
function levelOf(rv: Review): Level {
  const ex = rv.explanation;
  if (ex.risk === 'danger' || rv.score.level === 'high') return 'high';
  if (ex.risk === 'warning' || rv.score.level === 'medium') return 'medium';
  return 'low';
}

/** Jauge en demi-cercle : la longueur de l'arc EST le score (pathLength 100). */
function gauge(score: number): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 58');
  svg.setAttribute('class', 'gauge');
  svg.setAttribute('aria-hidden', 'true');
  const arc = (cls: string) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M10 52 A40 40 0 0 1 90 52');
    p.setAttribute('pathLength', '100');
    p.setAttribute('class', cls);
    return p;
  };
  const track = arc('track');
  const fill = arc('fill');
  const value = Math.max(2, Math.min(100, score));
  // Remplissage depuis zéro : la jauge « monte » jusqu'au score à l'ouverture.
  fill.setAttribute('stroke-dasharray', `${reducedMotion() ? value : 0} 100`);
  if (!reducedMotion()) requestAnimationFrame(() => requestAnimationFrame(() => fill.setAttribute('stroke-dasharray', `${value} 100`)));
  svg.append(track, fill);
  return svg;
}

/**
 * VERDICT, en tête : jauge colorée, une phrase simple, puis les raisons de la
 * plus lourde à la plus légère, chacune marquée de sa gravité. Le détail (les
 * explications longues, les points en Expert) vient ensuite, replié.
 */
function verdictCard(rv: Review) {
  const sc = rv.score;
  const ex = rv.explanation;
  const level = levelOf(rv);
  const expert = isExpert();
  const sev = (pts: number) => (pts >= 25 ? 'high' : pts >= 10 ? 'medium' : 'low');
  const row = (f: Review['score']['factors'][number]) =>
    h('li', { class: `sev-${sev(f.points)}` }, h('i', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'grow' }, t(`rk_${f.code}` as 'rk_lossOnly', f.params ?? {})), expert && h('span', { class: 'pts' }, `+${f.points}`));
  const shown = expert ? sc.factors.length : 3;
  return h(
    'section',
    { class: `verdict ${level}`, 'data-testid': 'risk-score', 'aria-label': t('rkTitle') },
    h(
      'div',
      { class: 'verdict-head' },
      h(
        'div',
        { class: 'gauge-box', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(sc.score), 'aria-label': t('rkTitle') },
        gauge(sc.score),
        h('span', { class: 'score-num', 'data-testid': 'risk-num' }, h('b', {}, String(sc.score)), h('small', {}, '/100')),
      ),
      h(
        'div',
        { class: 'verdict-text' },
        h('strong', { 'data-testid': ex.risk !== 'none' ? 'risk' : false }, t(level === 'high' ? 'vdHigh' : level === 'medium' ? 'vdMedium' : 'vdLow')),
        h('span', { class: 'small muted' }, `${t('rkTitle')} ${t(level === 'high' ? 'rkHigh' : level === 'medium' ? 'rkMedium' : 'rkLow')}`),
      ),
    ),
    sc.factors.length > 0 && h('ul', { class: 'factors' }, ...sc.factors.slice(0, shown).map(row)),
    sc.factors.length > shown && h('details', { class: 'more' }, h('summary', {}, t('rkMore', { n: sc.factors.length - shown })), h('ul', { class: 'factors' }, ...sc.factors.slice(shown).map(row))),
    ex.reasons.length > 0 && h('details', { class: 'why', open: expert || level === 'high' }, h('summary', {}, t('vdWhy')), ...ex.reasons.map((x) => h('p', {}, x))),
    !expert && level !== 'low' && h('p', { class: 'small help', 'data-testid': 'risk-help' }, t('rkHelp')),
    h('p', { class: 'tiny muted' }, glyph('security', 12), t('rkLocal')),
  );
}

/** L'aperçu du résultat manque : le dire calmement, et quoi faire. */
function previewCard(p: NonNullable<Review['preview']>) {
  const failed = p.status === 'failed';
  return h(
    'section',
    { class: `preview-note ${failed ? 'failed' : ''}`, role: failed ? 'alert' : 'note', 'data-testid': 'preview' },
    h('span', { class: 'preview-icon', 'aria-hidden': 'true' }, glyph(failed ? 'warning' : 'about', 18)),
    h(
      'div',
      { class: 'grow' },
      h('strong', {}, t(failed ? 'pvFailedTitle' : 'pvUnavailableTitle')),
      h('p', {}, t(failed ? 'pvFailedBody' : 'pvUnavailableBody')),
      failed && p.error && isExpert() && h('p', { class: 'mono tiny muted' }, `${t('pvErrorLabel')} : ${p.error}`),
    ),
  );
}

/** Ce qui part et ce qui arrive : les montants d'abord, en gros, signés. */
function flows(ex: Review['explanation']) {
  if (!ex.lose.length && !ex.receive.length) return null;
  const line = (sign: '−' | '+', cls: string, label: string, v: string) => h('div', { class: `flow ${cls}` }, h('span', { class: 'flow-sign', 'aria-hidden': 'true' }, sign), h('span', { class: 'grow' }, h('span', { class: 'sr' }, `${label} : `), h('strong', {}, v)));
  return h(
    'section',
    { class: 'card flows' },
    ...ex.lose.map((v) => line('−', 'lose', t('apLose'), v)),
    ...ex.receive.map((v) => line('+', 'receive', t('apReceive'), v)),
  );
}

/** Pendant l'analyse : la forme de l'écran, sans contenu inventé. */
function signSkeleton() {
  const bar = (w: string, hgt = 12) => h('i', { class: 'sk', style: `width:${w};height:${hgt}px` });
  return h(
    'div',
    { class: 'stack skeleton', role: 'status', 'aria-busy': 'true', 'aria-label': t('apAnalyzing') },
    h('section', { class: 'verdict pending' }, h('div', { class: 'verdict-head' }, h('i', { class: 'sk', style: 'width:96px;height:56px;border-radius:56px 56px 8px 8px' }), h('div', { class: 'stack', style: 'gap:8px;flex:1' }, bar('80%', 16), bar('40%')))), bar('70%', 22), bar('100%', 52),
    h('p', { class: 'small muted center-text' }, t('apAnalyzing')),
  );
}

async function signScreen(req: Req) {
  app.replaceChildren(siteBar(req.origin), signSkeleton());
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
  const ok = h('button', { class: `btn arming ${ex.risk === 'danger' || rv.score.level === 'high' ? 'danger' : ''}${hold ? ' hold' : ''}`, type: 'button', disabled: true, style: `--arm:${ARM_MS}ms`, 'aria-label': label }, label);
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
    if (x?.ok) return done();
    if (x?.error === 'REQUEST_EXPIRED') return gone();
    // L'action a échoué : on reste, on dit pourquoi ; réessayer ou refuser.
    // Raison connue : dans la langue de la fenêtre ; sinon le message (court) de l'échec.
    const reason = x?.params?.reason;
    err.textContent = x?.error === 'ACTION_FAILED' ? t('apFailed', { m: hasErrorText(reason) ? errorText(reason) : (x.params?.message ?? '') }) : errorText(x?.error, x?.params);
    play('error');
    ok.classList.remove('held');
    ok.style.setProperty('--p', '0');
    ok.disabled = false;
  };
  /** Accord parti : une coche, un son discret (si activé), puis la fenêtre se ferme. */
  const done = () => {
    play('success');
    app.replaceChildren(h('div', { class: 'center', role: 'status', 'data-testid': 'approved' }, h('div', { class: 'success-badge' }, glyph('check', 34)), h('p', {}, t(sending || onPhone ? 'apDoneSent' : 'apDoneSigned'))));
    setTimeout(() => window.close(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 700);
  };

  // Danger : maintenir 2 s (un clic, même automatisé ou hérité, ne suffit pas).
  // Le minuteur décide ; l'anneau qui se remplit n'est que l'image du temps qui reste.
  if (hold) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let t0 = 0;
    const text = h('span', { class: 'hold-label' }, label);
    ok.replaceChildren(h('span', { class: 'hold-fill', 'aria-hidden': 'true' }), text);
    const paint = (now: number) => {
      ok.style.setProperty('--p', String(Math.min(1, (now - t0) / HOLD_MS)));
      raf = requestAnimationFrame(paint);
    };
    const stop = () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      if (!ok.classList.contains('holding')) return;
      ok.classList.remove('holding');
      ok.style.setProperty('--p', '0');
      text.textContent = label;
    };
    const begin = () => {
      ok.classList.add('holding');
      text.textContent = t('holdKeep');
      t0 = performance.now();
      if (!reducedMotion()) raf = requestAnimationFrame(paint);
      play('tap');
      timer = setTimeout(() => {
        cancelAnimationFrame(raf);
        ok.classList.remove('holding');
        ok.classList.add('held');
        ok.style.setProperty('--p', '1');
        void approve();
      }, HOLD_MS);
    };
    ok.addEventListener('pointerdown', () => {
      if (ok.disabled) return;
      begin();
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ok.addEventListener(ev, stop);
    // Clavier : Espace ou Entrée MAINTENUS 2 s (la répétition de touche ne relance pas le compte).
    ok.addEventListener('keydown', (e) => {
      if ((e.key !== ' ' && e.key !== 'Enter') || ok.disabled) return;
      e.preventDefault();
      if (e.repeat || ok.classList.contains('holding')) return;
      begin();
    });
    ok.addEventListener('keyup', (e) => (e.key === ' ' || e.key === 'Enter') && stop());
    ok.addEventListener('blur', stop);
  } else ok.addEventListener('click', () => void approve());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && void refuse());

  const refuseBtn = h('button', { class: 'btn secondary', type: 'button', on: { click: () => void refuse() } }, t('apRefuse'));
  const level = levelOf(rv);
  app.replaceChildren(
    ...nodes(
      siteBar(req.origin),
      lookalikeBox,
      // 1. Le verdict (danger d'abord), 2. ce qui se passe, 3. ce qui bouge — le reste est secondaire.
      verdictCard(rv),
      h('div', { class: 'what' }, h('p', { class: 'kicker-left small muted' }, ex.title, rv.chainName && ` · ${rv.chainName}`), h('h1', { 'data-testid': 'headline' }, ex.headline), ex.detail && h('p', { class: 'muted small' }, ex.detail)),
      flows(ex),
      rv.preview && previewCard(rv.preview),
      rv.messageText && h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'small muted' }, t('apMessage')), h('pre', { class: 'msg', 'data-testid': 'message' }, rv.messageText)),
      rv.reduce &&
        h(
          'div',
          { class: 'card stack', style: 'gap:8px' },
          h('label', { class: 'check' }, reduceBox, h('span', {}, t('apReduce'))),
          h('div', { class: 'amount' }, reduceAmount, h('span', { class: 'small muted' }, rv.reduce.symbol)),
          h('p', { class: 'small muted' }, t('apReduceHint', { s: rv.reduce.symbol })),
        ),
      rv.approval && h('label', { class: 'row-inline small' }, h('span', { class: 'grow muted' }, t('grRemind')), remind),
      rv.details.length > 0 && h('details', { class: 'tech', open: isExpert(), 'data-testid': 'tech-details' }, h('summary', {}, t('apDetails')), isExpert() && h('div', { class: 'kv' }, h('span', { class: 'small muted' }, t('apMethod')), h('p', { class: 'mono small' }, rv.method)), ...rv.details.map((d) => h('div', { class: 'kv' }, h('span', { class: 'small muted' }, d.label), h('p', { class: 'mono small' }, d.value)))),
      capPassword && h('p', { class: 'banner warn', role: 'status', 'data-testid': 'cap-note' }, glyph('warning', 16), h('span', { class: 'grow' }, t('capNote', { remaining: String(Math.floor(capRemaining ?? 0)) }))),
      askPassword && pw,
      phoneWait,
      err,
      // Danger : Refuser en premier (et focalisé), signer à droite.
      h('div', { class: `dock ${level}` }, hold && h('p', { class: 'tiny muted center-text' }, t('apHoldHint')), h('div', { class: 'actions' }, refuseBtn, ok)),
    ),
  );
  if (ex.risk === 'danger') refuseBtn.focus();
  reduceAmount.addEventListener('input', () => (reduceBox.checked = !!reduceAmount.value.trim()));
}

function connectScreen(req: Req, wallets: WalletMeta[], selected: { walletId: string; index: number } | null) {
  const url = new URL(req.origin);
  // Tous les comptes de tous les portefeuilles (téléphone compris), groupés par portefeuille.
  const addr = (a: WalletMeta['accounts'][number]) => (req.family === 'evm' ? a.evm : req.family === 'solana' ? a.solana : a.bitcoin);
  // Sites Bitcoin : comptes de ce coffre seulement (un compte du téléphone n'y est pas encore servi).
  const options = wallets
    .filter((w) => !(req.family === 'bitcoin' && w.kind === 'companion'))
    .flatMap((w) => w.accounts.filter((a) => addr(a)).map((a) => ({ value: `${w.id}|${a.index}`, wallet: w, label: t('account', { n: a.index + 1 }), address: addr(a)!, phone: w.kind === 'companion', lost: !!w.lost })));
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
      h('p', { class: 'group-title' }, `${t('apAccount')} · ${req.family === 'evm' ? t('apFamilyEvm') : req.family === 'solana' ? t('apFamilySol') : t('apFamilyBtc')}`),
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
