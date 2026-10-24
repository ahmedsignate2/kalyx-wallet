/**
 * ONBOARDING — onglet complet, ouvert à l'installation (ou depuis le popup
 * pour ajouter un portefeuille).
 *
 * Ordre : le mot de passe d'abord (le coffre existe avant le moindre secret :
 * rien n'est jamais écrit en clair), puis créer ou importer.
 *
 * La phrase créée n'existe dans cette page que le temps de la noter et de la
 * vérifier ; elle est oubliée dès la fin du parcours.
 */
import { installFeedback } from '../../ui/feedback';
import { landscape } from '../../ui/landscape';
import { qrSvg } from '../../ui/qr';
import { avatar } from '../../ui/avatar';
import { addressView } from '../../ui/address';
import { glyph } from '../../ui/glyph';
import { h, send } from '../../ui/dom';
import { applyLang, errorText, LANG, reasonText, t } from '../../ui/i18n';
import { passwordStrength } from '../../../src/security/passwordStrength';
import { createBackupChallenge, unknownWords, type WordChallenge } from '../../../src/domain/wallet/backupChallenge';
import { AUTO_LOCK_CHOICES, MIN_PASSWORD_LENGTH, RESET_CONFIRM } from '../../lib/policy';
import { languageSelect } from '../../ui/helpScreen';
import { createPasskey, passkeyPrf, passkeySupported, unlockWith, type PasskeyStatus } from '../../ui/passkey';
import { getMode, getTheme, setMode, setTheme, type Mode, type Theme } from '../../ui/prefs';
import { play } from '../../ui/sound';

interface WalletMeta {
  id: string;
  label: string;
  kind: 'seed' | 'privateKey' | 'companion';
  backedUp: boolean;
  accounts: { index: number; evm?: string; solana?: string; bitcoin?: string }[];
}

// Pas de rechargement en plein parcours (la phrase en cours serait perdue) : la langue se choisit sur l'accueil.
applyLang(document, false);
installFeedback();
const app = document.getElementById('app')!;
let afterAuth: () => void = () => {};
/** Phrase en cours de création (oubliée à la fin du parcours). */
let phrase = '';
let createdId = '';

/** Le ciel de l'app en bandeau, la carte du parcours posée dessus ; chaque étape y arrive en glissant. */
function screen(...children: (Node | false | null)[]) {
  app.replaceChildren(
    h('div', { class: 'ob-sky on-sky', 'aria-hidden': 'true' }, landscape({ veil: true, glow: 0.4 })),
    h('header', { class: 'ob-brand on-sky' }, h('img', { src: '/icon/128.png', alt: '' }), 'Kalyx'),
    h('main', { class: 'ob-card rise' }, h('div', { class: 'stack' }, ...children)),
  );
  window.scrollTo({ top: 0 });
}

/** Progression du parcours « créer » : la phrase, la vérification, la fin. */
const steps = (i: number) => h('div', { class: 'ob-steps', 'aria-hidden': 'true' }, ...[0, 1, 2].map((k) => h('i', { class: k < i ? 'done' : k === i ? 'on' : '' })));

const errorLine = () => h('p', { class: 'error', role: 'alert' });
const backLink = (to: () => void) => h('button', { class: 'link', type: 'button', on: { click: to } }, glyph('back', 18), t('back'));
const short = (a?: string) => (a ? `${a.slice(0, 8)}…${a.slice(-6)}` : '');

function showError(el: HTMLElement, r: { error?: string; waitMs?: number }) {
  el.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : r.error === 'THROTTLED' ? t('throttled', { s: Math.ceil((r.waitMs ?? 0) / 1000) }) : errorText(r.error);
}

/* ── Accueil ── */
function welcome() {
  screen(
    h('span', { class: 'access-logo ob-logo' }, h('img', { src: '/icon/128.png', alt: '' })),
    h('h1', {}, t('welcomeTitle')),
    h('p', { class: 'muted' }, t('welcomeSub')),
    h('button', { class: 'btn', type: 'button', on: { click: () => withAuth(createFlow) } }, t('create')),
    h('button', { class: 'btn secondary', type: 'button', on: { click: () => withAuth(importMenu) } }, t('haveOne')),
    h('label', { class: 'ob-lang small muted' }, glyph('language', 16), languageSelect()),
  );
}

/* ── Passkey (second facteur) : activer ou désactiver ── */
async function passkeyScreen() {
  const st = await send<PasskeyStatus>({ type: 'vault:status' });
  const on = !!(st.ok && st.passkey);
  const err = errorLine();
  const pw = h('input', { type: 'password', placeholder: t('pwCurrent'), autocomplete: 'current-password', 'data-testid': 'pk-password' });
  const ack = h('input', { type: 'checkbox', 'data-testid': 'pk-ack' });
  const go = h('button', { class: on ? 'btn danger' : 'btn', type: 'submit', disabled: !on, 'data-testid': 'pk-go' }, t(on ? 'pkDisable' : 'pkEnable'));
  if (!on) ack.addEventListener('change', () => (go.disabled = !ack.checked));
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!pw.value || go.disabled) return;
          go.disabled = true;
          err.textContent = '';
          let r: { ok: boolean; error?: string; waitMs?: number };
          try {
            if (on) r = await send({ type: 'vault:passkey-remove', password: pw.value, prf: await passkeyPrf(st.passkey!.cred, st.passkey!.salt) });
            else {
              // Mot de passe vérifié AVANT de créer la passkey : pas de passkey orpheline sur l'authentificateur.
              r = await send({ type: 'vault:check-password', password: pw.value });
              if (r.ok) r = await send({ type: 'vault:passkey-add', password: pw.value, ...(await createPasskey()) });
            }
          } catch (x) {
            r = { ok: false, error: (x as Error).message };
          }
          pw.value = '';
          go.disabled = false;
          if (!r.ok) return showError(err, r);
          screen(h('h1', {}, t('pkTitle')), h('p', { class: 'banner', role: 'status', 'data-testid': 'pk-done' }, glyph('check', 18), h('span', {}, t(on ? 'pkDisabled' : 'pkEnabled'))));
        },
      },
    },
    pw,
    !on && h('label', { class: 'check' }, ack, h('span', {}, t('pkAck'))),
    err,
    go,
  );
  screen(
    h('h1', {}, t('pkTitle')),
    h('p', { class: 'muted' }, t('pkIntro')),
    h('p', { class: 'small muted', 'data-testid': 'pk-state' }, t(on ? 'pkOn' : 'pkOff')),
    !on && h('p', { class: 'banner warn', role: 'note' }, glyph('warning', 18), h('span', {}, t('pkWarn'))),
    passkeySupported() ? form : h('p', { class: 'error' }, t('pkUnsupported')),
  );
}

/* ── Mot de passe oublié : tout effacer, puis restaurer ── */
function resetScreen() {
  const err = errorLine();
  const ack = h('input', { type: 'checkbox', 'data-testid': 'reset-ack' });
  const word = t('rsWord');
  const typed = h('input', { type: 'text', autocomplete: 'off', spellcheck: false, 'aria-label': t('rsType', { word }), placeholder: word, 'data-testid': 'reset-word' });
  const go = h('button', { class: 'btn danger', type: 'submit', disabled: true, 'data-testid': 'reset-go' }, t('rsGo'));
  const sync = () => {
    go.disabled = !ack.checked || typed.value.trim().toLocaleUpperCase(LANG) !== word.toLocaleUpperCase(LANG);
    err.textContent = '';
  };
  ack.addEventListener('change', sync);
  typed.addEventListener('input', sync);
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (go.disabled) return;
          go.disabled = true;
          const r = await send({ type: 'vault:reset', confirm: RESET_CONFIRM }).catch(() => ({ ok: false, error: 'INTERNAL' }));
          if (!r.ok) return (showError(err, r), sync());
          // Tout est effacé : l'accueil, pour créer ou restaurer.
          history.replaceState(null, '', location.pathname);
          welcome();
        },
      },
    },
    h('label', { class: 'check' }, ack, h('span', {}, t('rsAck'))),
    h('label', { class: 'stack small' }, t('rsType', { word }), typed),
    err,
    go,
  );
  screen(
    backLink(() => (history.replaceState(null, '', location.pathname), welcome())),
    h('h1', {}, t('rsTitle')),
    h('p', { class: 'muted' }, t('rsBody')),
    h('p', { class: 'banner warn', role: 'note' }, glyph('warning', 18), h('span', {}, t('rsWarn'))),
    form,
  );
}

/** Le coffre doit exister et être ouvert avant tout secret. */
async function withAuth(next: () => void) {
  afterAuth = next;
  const st = await send<{ hasVault: boolean; unlocked: boolean }>({ type: 'vault:status' });
  if (!st.hasVault) passwordScreen();
  else if (!st.unlocked) unlockScreen();
  else next();
}

/* ── Mot de passe (création du coffre) ── */
function passwordScreen() {
  const err = errorLine();
  const bar = h('i');
  const label = h('span', { class: 'small muted' });
  const pw = h('input', { type: 'password', placeholder: t('pwPlaceholder'), autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', placeholder: t('pwConfirm'), autocomplete: 'new-password' });
  const go = h('button', { class: 'btn', type: 'submit', disabled: true }, t('continue'));
  const colors = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--up)'];
  const update = () => {
    const s = passwordStrength(pw.value);
    bar.style.width = pw.value ? `${25 + s.level * 25}%` : '0';
    bar.style.background = colors[s.level];
    label.textContent = pw.value ? t(`strength${s.level}` as 'strength0') : '';
    go.disabled = pw.value.length < MIN_PASSWORD_LENGTH || !pw2.value;
    err.textContent = '';
  };
  pw.addEventListener('input', update);
  pw2.addEventListener('input', update);
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (pw.value !== pw2.value) return void (err.textContent = t('pwMismatch'));
          go.disabled = true;
          const r = await send({ type: 'vault:create', password: pw.value });
          pw.value = pw2.value = '';
          if (!r.ok) {
            update(); // réactive le bouton (et vide la ligne d'erreur) : l'erreur s'affiche APRÈS
            showError(err, r);
            return;
          }
          afterAuth();
        },
      },
    },
    pw,
    h('div', { class: 'meter' }, bar),
    label,
    pw2,
    err,
    go,
  );
  screen(backLink(welcome), h('h1', {}, t('pwTitle')), h('p', { class: 'muted' }, t('pwSub')), form);
  pw.focus();
}

function unlockScreen() {
  const err = errorLine();
  const pw = h('input', { type: 'password', placeholder: t('pwPlaceholder'), autocomplete: 'current-password' });
  const note = h('p', { class: 'small muted', 'data-testid': 'passkey-note' });
  let st: PasskeyStatus = { passkey: null };
  void send<PasskeyStatus>({ type: 'vault:status' }).then((r) => {
    if (r.ok && r.passkey) (st = { passkey: r.passkey }), (note.textContent = t('pkActiveNote'));
  });
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          const r = await unlockWith(pw.value, st);
          pw.value = '';
          if (!r.ok) return showError(err, r);
          afterAuth();
        },
      },
    },
    pw,
    note,
    err,
    h('button', { class: 'btn', type: 'submit' }, t('unlock')),
  );
  screen(backLink(welcome), h('h1', {}, t('unlockTitle')), h('p', { class: 'muted' }, t('unlockSub')), form);
  pw.focus();
}

/* ── Création : la phrase, puis sa vérification ── */
let creating = false;
async function createFlow() {
  if (creating) return; // double-clic : un seul portefeuille
  creating = true;
  const r = await send<{ id: string; phrase: string }>({ type: 'wallet:create' }).finally(() => (creating = false));
  if (!r.ok) return welcomeWithError(r.error);
  phrase = r.phrase;
  createdId = r.id;
  phraseScreen();
}

function phraseScreen() {
  const grid = h('div', { class: 'grid hidden', 'aria-hidden': 'true' }, ...phrase.split(' ').map((w, i) => h('div', { class: 'word' }, h('span', {}, String(i + 1)), w)));
  // Pas de bouton Copier : le presse-papiers est lisible par d'autres extensions et ne se vide pas de façon fiable.
  grid.addEventListener('copy', (e) => e.preventDefault());
  const noted = h('button', { class: 'btn', type: 'button', disabled: true, on: { click: () => verifyScreen(createBackupChallenge(phrase), 0) } }, t('phraseNoted'));
  const reveal = h('button', {
    class: 'btn secondary',
    type: 'button',
    on: {
      click: () => {
        grid.classList.remove('hidden');
        grid.removeAttribute('aria-hidden');
        reveal.remove();
        noted.disabled = false;
      },
    },
  }, t('phraseReveal'));
  screen(
    !!createdId && steps(0),
    h('h1', {}, t('phraseTitle')),
    h('p', { class: 'muted' }, t('phraseSub')),
    h('ul', { class: 'warn' }, h('li', {}, t('phraseWarn1')), h('li', {}, t('phraseWarn2')), h('li', {}, t('phraseWarn3'))),
    grid,
    reveal,
    noted,
  );
}

function verifyScreen(challenge: WordChallenge[], step: number) {
  if (step >= challenge.length) {
    void send({ type: 'wallet:mark-backed-up', id: createdId }).then(() => finish());
    return;
  }
  const c = challenge[step];
  const err = errorLine();
  const words = phrase.split(' ');
  screen(
    steps(1),
    h('h1', {}, t('verifyTitle')),
    h('p', { class: 'muted' }, t('verifyWord', { n: c.position })),
    h(
      'div',
      { class: 'choices' },
      ...c.options.map((w) => {
        const b = h('button', {
          class: 'btn secondary',
          type: 'button',
          on: {
            click: () => {
              // Juste : l'étape suivante arrive tout de suite (sa carte entre en glissant) — aucun délai
              // pendant lequel un second clic ferait sauter une étape.
              if (words[c.position - 1] === w) return verifyScreen(challenge, step + 1);
              err.textContent = t('verifyWrong');
              b.classList.remove('shake');
              void b.offsetWidth;
              b.classList.add('shake');
            },
          },
        }, w);
        return b;
      }),
    ),
    err,
    h('button', { class: 'btn ghost', type: 'button', on: { click: () => finish() } }, t('later')),
    h('p', { class: 'small muted' }, t('laterNote')),
  );
}

/* ── Import ── */
function importMenu() {
  const opt = (title: string, sub: string, go: () => void) => h('button', { class: 'option', type: 'button', on: { click: go } }, h('strong', {}, title), h('span', { class: 'small muted' }, sub));
  screen(
    backLink(welcome),
    h('h1', {}, t('importTitle')),
    opt(t('importPhrase'), t('importPhraseSub'), importPhraseScreen),
    opt(t('importBackup'), t('importBackupSub'), importBackupScreen),
    opt(t('importKey'), t('importKeySub'), importKeyScreen),
    opt(t('compOption'), t('compOptionSub'), companionScreen),
  );
}

/* ── Mode compagnon : le téléphone garde les clés, l'extension reçoit les adresses ── */
async function companionScreen() {
  const err = errorLine();
  const av = await send<{ available: boolean }>({ type: 'companion:available' });
  if (!av.ok || !av.available) {
    screen(backLink(importMenu), h('h1', {}, t('compTitle')), h('p', { class: 'muted' }, t('compUnavailable')));
    return;
  }
  const box = h('div', { class: 'qr skel', style: 'width:224px;height:224px' });
  const wait = h('p', { class: 'pill quiet status comp-wait', role: 'status' }, h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }), t('compWaiting'));
  const retry = h('button', { class: 'btn secondary', type: 'button', hidden: true, on: { click: () => void companionScreen() } }, t('retry'));
  screen(backLink(importMenu), h('h1', {}, t('compTitle')), h('p', { class: 'muted' }, t('compSteps')), box, wait, err, retry);
  const fail = (r: { error?: string }) => {
    box.remove();
    wait.remove();
    err.textContent = errorText(r.error);
    retry.hidden = false;
  };
  const st = await send<{ uri: string }>({ type: 'companion:start', label: t('phoneBadge') });
  if (!st.ok) return fail(st);
  box.classList.remove('skel');
  box.removeAttribute('style');
  box.replaceChildren(qrSvg(st.uri, 200));
  box.setAttribute('aria-label', t('compTitle'));
  const got = await send<{ candidate: Candidate }>({ type: 'companion:wait' });
  if (!got.ok) return fail(got);
  confirmPhoneScreen(got.candidate);
}

interface Candidate {
  topic: string;
  evm?: string;
  solana?: string;
  bitcoin?: string;
  peer: { name: string; url: string };
}

/**
 * C'est bien TON téléphone ? L'appareil et les adresses reçues, à comparer avec
 * l'app Kalyx — avant tout enregistrement. Quelqu'un qui aurait scanné le QR à
 * ta place (partage d'écran) n'aurait pas tes adresses.
 */
function confirmPhoneScreen(c: Candidate) {
  const err = errorLine();
  const row = (tag: string, addr?: string) => !!addr && h('div', { class: 'card acct-card static' }, avatar(addr, 36), h('span', { class: 'grow' }, h('strong', {}, tag), h('p', { class: 'small' }, addressView(addr, 'sm'))));
  const decide = async (accept: boolean, btn: HTMLButtonElement) => {
    btn.disabled = true;
    const r = await send<{ wallet: WalletMeta | null }>({ type: 'companion:confirm', topic: c.topic, accept });
    if (!r.ok) {
      btn.disabled = false;
      err.textContent = errorText(r.error);
      return;
    }
    if (accept) finish([t('compDone')]);
    else companionScreen();
  };
  const yes = h('button', { class: 'btn', type: 'button', 'data-testid': 'comp-yes' }, t('compConfirmYes'));
  const no = h('button', { class: 'btn secondary', type: 'button' }, t('compConfirmNo'));
  yes.addEventListener('click', () => void decide(true, yes));
  no.addEventListener('click', () => void decide(false, no));
  screen(
    h('h1', {}, t('compConfirmTitle')),
    h('p', { class: 'muted' }, t('compConfirmBody')),
    !!c.peer.name && h('p', { class: 'small muted' }, `${t('compDevice')} : `, h('strong', {}, c.peer.name)),
    row('EVM', c.evm),
    row('Solana', c.solana),
    row('Bitcoin', c.bitcoin),
    err,
    yes,
    no,
  );
}

function importPhraseScreen() {
  const err = errorLine();
  const info = h('p', { class: 'small muted' });
  const area = h('textarea', { placeholder: t('phrasePlaceholder'), spellcheck: false, autocomplete: 'off', autocapitalize: 'off' });
  const go = h('button', { class: 'btn', type: 'submit', disabled: true }, t('import'));
  area.addEventListener('input', () => {
    const words = area.value.trim().split(/\s+/).filter(Boolean);
    const unknown = unknownWords(area.value);
    info.textContent = unknown.length ? t('unknownWords', { w: unknown.slice(0, 5).join(', ') }) : t('words', { n: words.length });
    info.className = unknown.length ? 'small error' : 'small muted';
    go.disabled = ![12, 15, 18, 21, 24].includes(words.length) || unknown.length > 0;
    err.textContent = '';
  });
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          go.disabled = true;
          const r = await send<{ wallet: WalletMeta }>({ type: 'wallet:import-phrase', phrase: area.value });
          if (!r.ok) {
            go.disabled = false;
            return showError(err, r);
          }
          area.value = '';
          await discover(r.wallet.id);
        },
      },
    },
    area,
    info,
    err,
    go,
  );
  screen(backLink(importMenu), h('h1', {}, t('importPhrase')), form);
  area.focus();
}

/** Recherche des comptes déjà utilisés de la phrase importée. */
async function discover(walletId: string) {
  const status = h('p', { class: 'muted' }, t('searching', { n: 2 }));
  screen(h('h1', {}, t('importPhrase')), status);
  const r = await send<{ found: number[]; uncertain: number[] }>({ type: 'wallet:discover', id: walletId });
  const notes: string[] = [];
  if (r.ok && r.found.length) notes.push(t('foundAccounts', { n: r.found.length }));
  if (r.ok && r.uncertain.length) notes.push(t('uncertainAccounts'));
  finish(notes);
}

function importBackupScreen() {
  const err = errorLine();
  const file = h('input', { type: 'file', accept: '.json,.kalyx,application/json' });
  const pw = h('input', { type: 'password', placeholder: t('backupPassword'), autocomplete: 'off' });
  const go = h('button', { class: 'btn', type: 'submit' }, t('open'));
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          const f = file.files?.[0];
          if (!f || !pw.value) return;
          go.disabled = true;
          const r = await send<{ added: WalletMeta[]; skipped: { label: string; reason: string }[] }>({ type: 'wallet:import-backup', file: await f.text(), password: pw.value });
          go.disabled = false;
          if (!r.ok) return showError(err, r);
          pw.value = '';
          const notes = [t('added', { n: r.added.length })];
          if (r.skipped.length) notes.push(t('skipped', { list: r.skipped.map((s) => `${s.label} (${reasonText(s.reason)})`).join(', ') }));
          if (!r.added.length) return void (err.textContent = notes.join(' '));
          finish(notes);
        },
      },
    },
    h('label', { class: 'small muted' }, t('backupFile')),
    file,
    pw,
    err,
    go,
  );
  screen(backLink(importMenu), h('h1', {}, t('importBackup')), h('p', { class: 'muted' }, t('importBackupSub')), form);
}

function importKeyScreen() {
  const err = errorLine();
  const radio = (value: string, text: string, checked = false) => h('label', {}, h('input', { type: 'radio', name: 'family', value, checked, style: 'width:auto' }), text);
  const area = h('textarea', { placeholder: t('keyPlaceholder'), spellcheck: false, autocomplete: 'off' });
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          const family = (form.querySelector('input[name=family]:checked') as HTMLInputElement | null)?.value;
          const r = await send({ type: 'wallet:import-key', key: area.value, family });
          if (!r.ok) return showError(err, r);
          area.value = '';
          finish();
        },
      },
    },
    h('div', { class: 'seg' }, radio('evm', t('keyEvm'), true), radio('solana', t('keySolana'))),
    area,
    h('p', { class: 'small muted' }, t('keyNote')),
    err,
    h('button', { class: 'btn', type: 'submit' }, t('import')),
  );
  screen(backLink(importMenu), h('h1', {}, t('importKey')), form);
  area.focus();
}

/**
 * À ton goût : thème (essayé en direct) et mode, choisis une fois ici,
 * modifiables ensuite dans Réglages › Apparence.
 */
function personalize(): HTMLElement {
  const group = <V extends string>(label: string, value: V, choices: [V, string, Node | null][], pick: (v: V) => void, testid: string) => {
    const buttons = choices.map(([v, name, extra]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(v === value), 'data-testid': `${testid}-${v}` }, extra, name);
      b.addEventListener('click', () => {
        for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
        pick(v);
        play('tap');
      });
      return b;
    });
    return h('div', { class: 'stack', style: 'gap:8px', role: 'group', 'aria-label': label }, h('p', { class: 'small muted' }, label), h('div', { class: 'pick' }, ...buttons));
  };
  const modeNote = h('p', { class: 'small muted' }, t(getMode() === 'expert' ? 'modeExpertBody' : 'modeBeginnerBody'));
  return h(
    'section',
    { class: 'card stack', style: 'gap:14px', 'data-testid': 'personalize' },
    h('strong', {}, t('obLookTitle')),
    group<Theme>(t('themeTitle'), getTheme(), [['dark', t('themeDark'), h('span', { class: 'swatch dark' })], ['light', t('themeLight'), h('span', { class: 'swatch light' })], ['system', t('themeSystem'), h('span', { class: 'swatch system' })]], setTheme, 'ob-theme'),
    group<Mode>(t('modeTitle'), getMode(), [['beginner', t('modeBeginner'), null], ['expert', t('modeExpert'), null]], (v) => (setMode(v), (modeNote.textContent = t(v === 'expert' ? 'modeExpertBody' : 'modeBeginnerBody'))), 'ob-mode'),
    modeNote,
  );
}

/** Kalyx pas encore épinglé dans la barre de Chrome : comment l'y mettre (rien s'il y est déjà). */
const pinTip = h('div', {});
void (async () => {
  const action = browser.action as unknown as { getUserSettings?: () => Promise<{ isOnToolbar?: boolean }> };
  const st = await action.getUserSettings?.().catch(() => null);
  // Déjà épinglé : rien à dire. Inconnu (navigateur sans cette API) : le conseil reste.
  if (st?.isOnToolbar !== true) pinTip.replaceChildren(h('p', { class: 'small muted pin-tip', 'data-testid': 'pin-tip' }, t('donePin')));
})();

/* ── Fin ── */
async function finish(notes: string[] = []) {
  // La phrase créée n'a plus rien à faire dans cette page.
  phrase = '';
  const [list, st] = await Promise.all([send<{ wallets: WalletMeta[] }>({ type: 'wallet:list' }), send<{ autoLockMin: number }>({ type: 'vault:status' })]);
  const wallets = list.ok ? list.wallets : [];
  const select = h('select', { on: { change: () => void send({ type: 'vault:set-auto-lock', minutes: Number(select.value) }) } }, ...AUTO_LOCK_CHOICES.map((m) => h('option', { value: String(m), selected: m === st.autoLockMin }, t('minutes', { n: m }))));
  screen(
    !!createdId && steps(3),
    h('div', { class: 'success-badge' }, glyph('check', 34)),
    h('h1', {}, t('doneTitle')),
    ...notes.map((n) => h('p', { class: 'ok' }, n)),
    ...wallets.map((w) =>
      h(
        'div',
        { class: 'card stack', style: 'gap:6px' },
        h('strong', {}, w.label),
        !w.backedUp && h('div', { class: 'banner' }, h('span', {}, t('backupBanner'))),
        // Une ligne par adresse, sans espaces de remplissage : « EVM 0x9858…da94 ».
        ...w.accounts.map((a) => h('div', { class: 'acct-addrs' }, ...[a.evm && ['EVM', a.evm], a.solana && ['SOL', a.solana], a.bitcoin && ['BTC', a.bitcoin]].filter((x): x is [string, string] => !!x).map(([k, v]) => h('span', { class: 'chip-addr' }, h('b', {}, k), h('span', { class: 'mono' }, short(v)))))),
      ),
    ),
    personalize(),
    pinTip,
    h('label', { class: 'small muted' }, t('autoLock')),
    select,
    h('button', { class: 'btn', type: 'button', on: { click: () => window.close() } }, t('done')),
  );
}

function welcomeWithError(code?: string) {
  welcome();
  app.querySelector('.stack')?.append(h('p', { class: 'error' }, errorText(code)));
}

/* ── Vérifier plus tard (« Vérifier » du rappel, ou avant le premier « Recevoir ») ── */
function verifyLaterScreen(walletId: string) {
  const err = errorLine();
  const pw = h('input', { type: 'password', placeholder: t('pwPlaceholder'), autocomplete: 'current-password' });
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!pw.value) return;
          // Mot de passe REDEMANDÉ même déverrouillé : afficher la phrase donne tout.
          const r = await send<{ phrase: string }>({ type: 'wallet:reveal-phrase', id: walletId, password: pw.value });
          pw.value = '';
          if (!r.ok) return showError(err, r);
          phrase = r.phrase;
          createdId = walletId;
          history.replaceState(null, '', location.pathname);
          phraseScreen();
        },
      },
    },
    pw,
    err,
    h('button', { class: 'btn', type: 'submit' }, t('continue')),
  );
  screen(h('h1', {}, t('verifyLaterTitle')), h('p', { class: 'muted' }, t('verifyLaterSub')), form);
  pw.focus();
}

const verifyId = /^#verify=([a-z0-9-]{1,64})$/.exec(location.hash)?.[1];
if (verifyId) verifyLaterScreen(verifyId);
else if (location.hash === '#companion') {
  history.replaceState(null, '', location.pathname);
  void withAuth(companionScreen);
} else if (location.hash === '#reset') resetScreen();
else if (location.hash === '#unlock') {
  // Ouvert par le popup (coffre à passkey) : une fois déverrouillé, l'onglet n'a plus de raison d'être.
  history.replaceState(null, '', location.pathname);
  void withAuth(() => (screen(h('h1', {}, t('unlockTitle')), h('p', { class: 'banner', role: 'status', 'data-testid': 'unlocked' }, glyph('check', 18), h('span', {}, t('pkDoneClose')))), setTimeout(() => window.close(), 1200)));
} else if (location.hash === '#passkey') {
  history.replaceState(null, '', location.pathname);
  void withAuth(() => void passkeyScreen());
}
else welcome();
