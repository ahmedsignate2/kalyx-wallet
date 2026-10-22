/**
 * GÉRER UN PORTEFEUILLE — renommer, comptes (renommer, ajouter, clé privée),
 * phrase, supprimer ; et, côté sécurité, changer le mot de passe et exporter
 * une sauvegarde chiffrée.
 *
 * Tout ce qui fait sortir un secret (clé, sauvegarde) ou détruit quelque
 * chose (suppression) redemande le mot de passe ; le service worker le
 * revérifie et applique la liste blanche — l'écran ne décide de rien.
 */
import { h, send } from './dom';
import { glyph } from './glyph';
import { avatar } from './avatar';
import { openSheet } from './sheet';
import { cascade, pulse } from './motion';
import { shortAddr } from './address';
import { errorText, t } from './i18n';
import { passwordStrength } from '../../src/security/passwordStrength';
import { MIN_PASSWORD_LENGTH } from '../lib/policy';

export interface ManagedWallet {
  id: string;
  label: string;
  kind?: 'seed' | 'privateKey' | 'companion';
  family?: 'evm' | 'solana';
  accounts: { index: number; label: string; evm?: string; solana?: string }[];
}

type Account = ManagedWallet['accounts'][number];

const pwInput = (placeholder: string, autocomplete = 'current-password') => h('input', { type: 'password', placeholder, autocomplete, maxLength: 1024 });

/** Champ « nouveau mot de passe » avec sa jauge (mêmes seuils que la création du coffre). */
function strengthField(placeholder: string) {
  const input = pwInput(placeholder, 'new-password');
  const bar = h('i');
  const label = h('span', { class: 'small muted' });
  const colors = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--up)'];
  input.addEventListener('input', () => {
    const s = passwordStrength(input.value);
    bar.style.width = input.value ? `${25 + s.level * 25}%` : '0';
    bar.style.background = colors[s.level];
    label.textContent = input.value ? t(`strength${s.level}` as 'strength0') : '';
  });
  return { input, nodes: [input, h('div', { class: 'meter' }, bar), label] };
}

/** Bouton d'envoi d'une feuille : désactivé pendant l'appel, erreur lisible sinon. */
function submit(btn: HTMLButtonElement, err: HTMLElement, run: () => Promise<{ ok: boolean; error?: string; waitMs?: number; text?: string }>, done: () => void) {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    err.textContent = '';
    const r = await run().catch(() => ({ ok: false, error: 'INTERNAL' } as { ok: boolean; error?: string; waitMs?: number; text?: string }));
    btn.disabled = false;
    if (!r.ok) {
      err.textContent = r.text ?? (r.error === 'THROTTLED' && r.waitMs ? t('throttled', { s: Math.ceil(r.waitMs / 1000) }) : errorText(r.error));
      return;
    }
    done();
  });
}

export function manageWalletScreen(app: HTMLElement, back: () => void, w: ManagedWallet, hooks: { changed: () => Promise<ManagedWallet | undefined>; openPhrase: () => void; removed: () => void }) {
  const err = h('p', { class: 'error', role: 'alert' });
  const kind = w.kind === 'seed' ? t('mgKindSeed') : w.kind === 'privateKey' ? t('mgKindKey') : t('phoneBadge');
  const refresh = async () => {
    const next = await hooks.changed();
    if (next) manageWalletScreen(app, back, next, hooks);
  };

  const rename = (title: string, current: string, save: (label: string) => Promise<{ ok: boolean; error?: string }>) => {
    const input = h('input', { type: 'text', value: current, maxLength: 40, 'aria-label': t('mgName'), 'data-testid': 'rename-input' });
    const e = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'rename-save' }, t('mgSave'));
    const sheet = openSheet(title, input, e, go);
    input.select();
    input.addEventListener('keydown', (k) => k.key === 'Enter' && go.click());
    submit(go, e, () => save(input.value), () => (sheet.close(), void refresh()));
  };

  const accountRow = (a: Account) => {
    const addr = a.evm ?? a.solana ?? '';
    return h(
      'button',
      { class: 'row link-row', type: 'button', 'data-testid': `acct-${a.index}`, on: { click: () => accountSheet(a) } },
      avatar(addr, 32),
      h('span', { class: 'grow' }, h('strong', {}, a.label), h('p', { class: 'small muted mono', translate: 'no' }, shortAddr(addr))),
      glyph('chevron', 16),
    );
  };

  function accountSheet(a: Account) {
    const renameBtn = h('button', { class: 'btn secondary', type: 'button' }, t('mgRename'));
    const keyBtn = w.kind !== 'companion' && h('button', { class: 'btn ghost', type: 'button', 'data-testid': 'show-key' }, glyph('security', 16), t('mgShowKey'));
    const sheet = openSheet(a.label, h('p', { class: 'small muted mono', translate: 'no' }, a.evm ?? ''), a.solana ? h('p', { class: 'small muted mono', translate: 'no' }, a.solana) : null, renameBtn, keyBtn);
    renameBtn.addEventListener('click', () => (sheet.close(), rename(t('mgRename'), a.label, (label) => send({ type: 'account:rename', id: w.id, index: a.index, label }))));
    if (keyBtn) keyBtn.addEventListener('click', () => (sheet.close(), keySheet(a)));
  }

  /** Clé privée : avertissement, mot de passe, puis la clé (jamais conservée par l'écran). */
  function keySheet(a: Account) {
    const families = (['evm', 'solana'] as const).filter((f) => !!a[f] && (w.kind !== 'privateKey' || w.family === f));
    const fam = h('select', { class: 'inline', 'aria-label': t('network') }, ...families.map((f) => h('option', { value: f }, f === 'evm' ? 'Ethereum / EVM' : 'Solana')));
    const pw = pwInput(t('mgPassword'));
    const e = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { class: 'btn danger', type: 'button', 'data-testid': 'key-reveal' }, t('mgShowKey'));
    const sheet = openSheet(t('mgShowKey'), h('div', { class: 'banner danger' }, glyph('warning', 16), h('p', {}, t('mgKeyWarn'))), families.length > 1 ? fam : null, pw, e, go);
    pw.addEventListener('keydown', (k) => k.key === 'Enter' && go.click());
    submit(
      go,
      e,
      async () => {
        const r = await send<{ key: string }>({ type: 'wallet:reveal-key', id: w.id, index: a.index, family: families.length > 1 ? fam.value : families[0], password: pw.value });
        pw.value = '';
        if (r.ok) show(r.key);
        return r;
      },
      () => {},
    );
    function show(key: string) {
      const box = h('p', { class: 'mono secret-key', translate: 'no', 'data-testid': 'key-value' }, key);
      const copy = h('button', { class: 'btn secondary', type: 'button' }, glyph('copy', 16), t('mgCopyKey'));
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(key);
        copy.replaceChildren(glyph('check', 16), t('mgKeyCopied'));
        pulse(copy);
      });
      sheet.body.replaceChildren(h('div', { class: 'banner danger' }, glyph('warning', 16), h('p', {}, t('mgKeyWarn'))), box, copy);
    }
  }

  /** Supprimer : la case « j'ai noté ma phrase » et le mot de passe, sinon rien ne part. */
  function removeSheet() {
    const ack = h('input', { type: 'checkbox', 'data-testid': 'remove-ack' });
    const pw = pwInput(t('mgPassword'));
    const e = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { class: 'btn danger', type: 'button', disabled: true, 'data-testid': 'remove-confirm' }, t('mgRemove'));
    const sync = () => (go.disabled = !ack.checked || !pw.value);
    ack.addEventListener('change', sync);
    pw.addEventListener('input', sync);
    const sheet = openSheet(t('mgRemove'), h('p', {}, t('mgRemoveWarn')), h('label', { class: 'check' }, ack, h('span', {}, t('mgRemoveAck'))), pw, e, go);
    submit(
      go,
      e,
      async () => {
        const r = await send({ type: 'wallet:remove', id: w.id, password: pw.value });
        pw.value = '';
        sync();
        return r;
      },
      () => (sheet.close(), hooks.removed()),
    );
  }

  const addAccount = h('button', { class: 'row link-row', type: 'button', 'data-testid': 'add-account' }, h('span', { class: 'set-ico' }, glyph('add', 18)), h('span', { class: 'grow' }, h('strong', {}, t('mgAddAccount'))));
  addAccount.addEventListener('click', async () => {
    addAccount.disabled = true;
    const r = await send({ type: 'wallet:add-account', id: w.id });
    addAccount.disabled = false;
    if (!r.ok) return void (err.textContent = errorText(r.error));
    await refresh();
  });

  const action = (icon: string, label: string, fn: () => void, testid: string, cls = '') =>
    h('button', { class: `row link-row ${cls}`.trim(), type: 'button', 'data-testid': testid, on: { click: fn } }, h('span', { class: 'set-ico' }, glyph(icon, 18)), h('span', { class: 'grow' }, h('strong', {}, label)), glyph('chevron', 16));

  const accounts = h('div', { class: 'list card' }, ...w.accounts.map(accountRow), w.kind === 'seed' ? addAccount : false);
  app.replaceChildren(
    h(
      'div',
      { class: 'screen settings enter' },
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))),
      h('h1', {}, t('manageWallet')),
      h(
        'div',
        { class: 'list card' },
        h(
          'button',
          { class: 'row link-row', type: 'button', 'data-testid': 'rename-wallet', on: { click: () => rename(t('mgRename'), w.label, (label) => send({ type: 'wallet:rename', id: w.id, label })) } },
          h('span', { class: 'set-ico' }, glyph('wallet', 18)),
          h('span', { class: 'grow' }, h('strong', {}, w.label), h('p', { class: 'small muted' }, kind)),
          h('span', { class: 'small muted' }, t('mgRename')),
        ),
      ),
      err,
      h('section', { class: 'group' }, h('p', { class: 'group-title' }, t('mgAccounts')), accounts),
      w.kind !== 'companion'
        ? h(
            'section',
            { class: 'group' },
            h('p', { class: 'group-title' }, t('setSecurity')),
            h('div', { class: 'list card' }, ...[w.kind === 'seed' && action('phrase', t('showPhrase'), hooks.openPhrase, 'show-phrase'), action('close', t('mgRemove'), removeSheet, 'remove-wallet', 'danger-row')].filter((x): x is HTMLButtonElement => !!x)),
          )
        : false,
    ),
  );
  cascade(accounts.querySelectorAll('.row'));
}

/** Changer le mot de passe de l'extension (le coffre est rechiffré ; rien ne change pour les portefeuilles). */
export function changePasswordSheet() {
  const old = pwInput(t('pwCurrent'));
  const next = strengthField(t('pwNew'));
  const again = pwInput(t('pwConfirm'), 'new-password');
  const e = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'pw-change' }, t('pwChange'));
  const sheet = openSheet(t('pwChange'), old, ...next.nodes, again, e, go);
  submit(
    go,
    e,
    async () => {
      if (next.input.value !== again.value) return { ok: false, text: t('pwMismatch') };
      if (next.input.value.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'WEAK_PASSWORD' };
      const r = await send({ type: 'vault:change-password', oldPassword: old.value, newPassword: next.input.value });
      if (r.ok) old.value = next.input.value = again.value = '';
      return r;
    },
    () => sheet.body.replaceChildren(h('p', { class: 'center-text' }, glyph('check', 20), ' ', t('pwChanged'))),
  );
}

/** Exporter une sauvegarde chiffrée (format de l'app) : un fichier téléchargé, rien n'est envoyé ailleurs. */
export function exportBackupSheet() {
  const pw = pwInput(t('mgPassword'));
  const bk = strengthField(t('bkPassword'));
  const again = pwInput(t('bkConfirm'), 'new-password');
  const e = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn', type: 'button', 'data-testid': 'backup-export' }, t('bkExport'));
  const sheet = openSheet(t('bkExport'), h('p', { class: 'small muted' }, t('bkNote')), pw, ...bk.nodes, again, e, go);
  let count = 0;
  submit(
    go,
    e,
    async () => {
      if (bk.input.value !== again.value) return { ok: false, text: t('pwMismatch') };
      const r = await send<{ file: string; count: number }>({ type: 'wallet:export-backup', password: pw.value, backupPassword: bk.input.value });
      pw.value = '';
      if (!r.ok) return r;
      bk.input.value = again.value = '';
      count = r.count;
      const url = URL.createObjectURL(new Blob([r.file], { type: 'application/json' }));
      const a = h('a', { href: url, download: `kalyx-backup-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return r;
    },
    () => sheet.body.replaceChildren(h('p', { class: 'center-text' }, glyph('check', 20), ' ', t('bkDone', { n: count }))),
  );
}
