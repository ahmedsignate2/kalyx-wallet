/**
 * Écrans d'accès communs au popup et au panneau latéral : aucun coffre
 * (« Commencer ») et verrouillé (mot de passe).
 */
import { h, send } from './dom';
import { errorText, t } from './i18n';
import { landscape } from './landscape';
import { glyph } from './glyph';
import { inPopup, unlockWith, type PasskeyStatus } from './passkey';

export async function openOnboarding(close: boolean, hash: '' | '#companion' | '#reset' | '#unlock' | '#passkey' = '') {
  await browser.tabs.create({ url: browser.runtime.getURL(`/onboarding.html${hash}`) });
  if (close) window.close();
}

/** Le ciel de l'accueil, le logo qui luit dessus ; la feuille porte le texte et le geste. */
function center(app: HTMLElement, ...children: (Node | false)[]) {
  app.replaceChildren(
    h(
      'div',
      { class: 'home access enter' },
      h('section', { class: 'hero on-sky access-hero' }, landscape({ veil: true, glow: 0.4 }), h('span', { class: 'access-logo' }, h('img', { src: '/icon/128.png', alt: '' })), h('h1', {}, 'Kalyx Wallet')),
      h('section', { class: 'sheet access-sheet' }, ...children.filter((c): c is Node => !!c)),
    ),
  );
}

/** Aucun coffre (« Commencer »), ou coffre sans portefeuille : onboarding interrompu (« Ajouter un portefeuille »). */
export function noVaultScreen(app: HTMLElement, close: boolean, hasVault = false) {
  center(app, h('p', { class: 'muted' }, t('popupNoVault')), h('button', { class: 'btn', type: 'button', on: { click: () => void openOnboarding(close) } }, t(hasVault ? 'addWallet' : 'getStarted')));
}

export function lockedScreen(app: HTMLElement, onUnlocked: () => void, close = true) {
  const err = h('p', { class: 'error', role: 'alert' });
  const pw = h('input', { type: 'password', placeholder: t('pwPlaceholder'), autocomplete: 'current-password' });
  const go = h('button', { class: 'btn', type: 'submit' }, t('unlock'));
  const note = h('p', { class: 'small muted', 'data-testid': 'passkey-note' });
  let st: PasskeyStatus = { passkey: null };
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!pw.value) return;
          go.disabled = true;
          const r = await unlockWith(pw.value, st);
          pw.value = '';
          go.disabled = false;
          if (r.ok) return onUnlocked();
          err.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : r.error === 'THROTTLED' ? t('throttled', { s: Math.ceil((r.waitMs ?? 0) / 1000) }) : errorText(r.error);
        },
      },
    },
    pw,
    note,
    err,
    go,
  );
  // Mot de passe oublié : Kalyx ne peut pas le retrouver ; l'onboarding explique comment tout effacer et restaurer.
  const forgot = h('button', { class: 'link forgot', type: 'button', 'data-testid': 'forgot-password', on: { click: () => void openOnboarding(close, '#reset') } }, t('forgotPw'));
  center(app, h('p', { class: 'muted' }, t('popupUnlockSub')), form, forgot);
  pw.focus();
  // Coffre à passkey : dans le popup, le déverrouillage passe par un onglet (la fenêtre passkey fermerait le popup).
  void send<PasskeyStatus>({ type: 'vault:status' }).then((r) => {
    if (!r.ok || !r.passkey) return;
    st = { passkey: r.passkey };
    if (!inPopup()) return void (note.textContent = t('pkActiveNote'));
    form.replaceChildren(
      h('p', { class: 'small muted' }, t('pkPopupNote')),
      h('button', { class: 'btn', type: 'button', 'data-testid': 'passkey-unlock-tab', on: { click: () => void openOnboarding(close, '#unlock') } }, glyph('lock', 18), t('pkUnlock')),
    );
  });
}
