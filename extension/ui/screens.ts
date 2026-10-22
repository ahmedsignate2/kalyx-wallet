/**
 * Écrans d'accès communs au popup et au panneau latéral : aucun coffre
 * (« Commencer ») et verrouillé (mot de passe).
 */
import { h, send } from './dom';
import { errorText, t } from './i18n';
import { landscape } from './landscape';

export async function openOnboarding(close: boolean, hash: '' | '#companion' = '') {
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

export function lockedScreen(app: HTMLElement, onUnlocked: () => void) {
  const err = h('p', { class: 'error', role: 'alert' });
  const pw = h('input', { type: 'password', placeholder: t('pwPlaceholder'), autocomplete: 'current-password' });
  const go = h('button', { class: 'btn', type: 'submit' }, t('unlock'));
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          if (!pw.value) return;
          go.disabled = true;
          const r = await send({ type: 'vault:unlock', password: pw.value });
          pw.value = '';
          go.disabled = false;
          if (r.ok) return onUnlocked();
          err.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : r.error === 'THROTTLED' ? t('throttled', { s: Math.ceil((r.waitMs ?? 0) / 1000) }) : errorText(r.error);
        },
      },
    },
    pw,
    err,
    go,
  );
  center(app, h('p', { class: 'muted' }, t('popupUnlockSub')), form);
  pw.focus();
}
