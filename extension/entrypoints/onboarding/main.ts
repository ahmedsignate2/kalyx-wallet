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
import { h, send } from '../../ui/dom';
import { errorText, reasonText, t } from '../../ui/i18n';
import { passwordStrength } from '../../../src/security/passwordStrength';
import { createBackupChallenge, unknownWords, type WordChallenge } from '../../../src/domain/wallet/backupChallenge';
import { AUTO_LOCK_CHOICES, MIN_PASSWORD_LENGTH } from '../../lib/policy';

interface WalletMeta {
  id: string;
  label: string;
  kind: 'seed' | 'privateKey';
  backedUp: boolean;
  accounts: { index: number; evm?: string; solana?: string }[];
}

const app = document.getElementById('app')!;
let afterAuth: () => void = () => {};
/** Phrase en cours de création (oubliée à la fin du parcours). */
let phrase = '';
let createdId = '';

function screen(...children: (Node | false | null)[]) {
  app.replaceChildren(
    h('div', { class: 'head' }, h('img', { src: '/icon/128.png', alt: '' }), 'Kalyx'),
    h('div', { class: 'stack' }, ...children),
  );
}

const errorLine = () => h('p', { class: 'error', role: 'alert' });
const backLink = (to: () => void) => h('button', { class: 'link', type: 'button', on: { click: to } }, `← ${t('back')}`);
const short = (a?: string) => (a ? `${a.slice(0, 8)}…${a.slice(-6)}` : '');

function showError(el: HTMLElement, r: { error?: string; waitMs?: number }) {
  el.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : r.error === 'THROTTLED' ? t('throttled', { s: Math.ceil((r.waitMs ?? 0) / 1000) }) : errorText(r.error);
}

/* ── Accueil ── */
function welcome() {
  screen(
    h('h1', {}, t('welcomeTitle')),
    h('p', { class: 'muted' }, t('welcomeSub')),
    h('button', { class: 'btn', type: 'button', on: { click: () => withAuth(createFlow) } }, t('create')),
    h('button', { class: 'btn secondary', type: 'button', on: { click: () => withAuth(importMenu) } }, t('haveOne')),
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
  const colors = ['var(--danger)', 'var(--danger)', 'var(--gold)', 'var(--ok)'];
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
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          const r = await send({ type: 'vault:unlock', password: pw.value });
          pw.value = '';
          if (!r.ok) return showError(err, r);
          afterAuth();
        },
      },
    },
    pw,
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
    h('h1', {}, t('verifyTitle')),
    h('p', { class: 'muted' }, t('verifyWord', { n: c.position })),
    h(
      'div',
      { class: 'choices' },
      ...c.options.map((w) =>
        h('button', {
          class: 'btn secondary',
          type: 'button',
          on: { click: () => (words[c.position - 1] === w ? verifyScreen(challenge, step + 1) : void (err.textContent = t('verifyWrong'))) },
        }, w),
      ),
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

/* ── Fin ── */
async function finish(notes: string[] = []) {
  // La phrase créée n'a plus rien à faire dans cette page.
  phrase = '';
  const [list, st] = await Promise.all([send<{ wallets: WalletMeta[] }>({ type: 'wallet:list' }), send<{ autoLockMin: number }>({ type: 'vault:status' })]);
  const wallets = list.ok ? list.wallets : [];
  const select = h('select', { on: { change: () => void send({ type: 'vault:set-auto-lock', minutes: Number(select.value) }) } }, ...AUTO_LOCK_CHOICES.map((m) => h('option', { value: String(m), selected: m === st.autoLockMin }, t('minutes', { n: m }))));
  screen(
    h('h1', {}, t('doneTitle')),
    ...notes.map((n) => h('p', { class: 'ok' }, n)),
    ...wallets.map((w) =>
      h(
        'div',
        { class: 'card stack', style: 'gap:6px' },
        h('strong', {}, w.label),
        !w.backedUp && h('div', { class: 'banner' }, h('span', {}, t('backupBanner'))),
        ...w.accounts.map((a) => h('p', { class: 'mono muted' }, [a.evm && `EVM ${short(a.evm)}`, a.solana && `SOL ${short(a.solana)}`].filter(Boolean).join('  ·  '))),
      ),
    ),
    h('p', { class: 'small muted' }, t('donePin')),
    h('label', { class: 'small muted' }, t('autoLock')),
    select,
    h('button', { class: 'btn', type: 'button', on: { click: () => window.close() } }, t('done')),
  );
}

function welcomeWithError(code?: string) {
  welcome();
  app.querySelector('.stack')?.append(h('p', { class: 'error' }, errorText(code)));
}

welcome();
