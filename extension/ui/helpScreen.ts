/**
 * AIDE ET INFOS : questions fréquentes propres à l'extension, À propos
 * (éditeur, documents légaux, contact) et choix de la langue.
 *
 * Les documents légaux sont ceux du site (source unique, dans la langue
 * affichée) ; l'extension n'en garde pas de copie qui pourrait diverger.
 */
import { glyph } from './glyph';
import { h, send } from './dom';
import { CHOSEN, LANG, LANG_NAMES, LANGS, langOf, t, useLang, type Key } from './i18n';

const SITE = 'https://kalyxwallet.com';
export const SUPPORT_EMAIL = 'support@kalyxwallet.com';
const TELEGRAM = 'https://t.me/kalyxntw';
/** Éditeur, tel que publié dans les mentions légales du site. */
const EDITOR = 'KALYX (EI Ahamed Signate) · SIREN 130 046 865';

/** Page du site dans la langue affichée (le site parle les mêmes 15 langues). */
export const sitePage = (page: 'privacy' | 'terms' | 'mentions') => `${SITE}/${LANG}/${page}`;
const open = (url: string) => void browser.tabs.create({ url });

const screenHead = (title: string, back: () => void) => [h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back'))), h('h1', {}, title)];

/** Une ligne de lien externe (s'ouvre dans un onglet). */
const linkRow = (icon: string, label: string, url: string, testid?: string) =>
  h('button', { class: 'row link-row', type: 'button', 'data-testid': testid ?? false, on: { click: () => open(url) } }, h('span', { class: 'set-ico' }, glyph(icon, 18)), h('span', { class: 'grow' }, h('strong', {}, label)), glyph('arrowUpRight', 16));

const FAQ = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Chemin d'un réglage, avec les libellés réels des menus (justes dans chaque langue). */
const where = (...keys: Key[]) => [t('settings'), ...keys.map((k) => t(k))].join(' › ');

export function faqScreen(app: HTMLElement, back: () => void) {
  const paths = {
    forgot: t('forgotPw'),
    phrase: where('setSecurity', 'showPhrase'),
    backup: where('setSecurity', 'bkExport'),
    sites: where('setSecurity', 'sitesTitle'),
    approvals: where('setSecurity', 'apprTitle'),
    lock: where('setGeneral', 'autoLock'),
    networks: where('setGeneral', 'netTitle'),
  };
  app.replaceChildren(
    h(
      'div',
      { class: 'screen enter' },
      ...screenHead(t('faq'), back),
      h(
        'div',
        { class: 'faq stack', 'data-testid': 'faq' },
        ...FAQ.map((n) => h('details', { class: 'banner card' }, h('summary', {}, glyph('faq', 16), h('span', { class: 'grow' }, t(`faqQ${n}` as Key)), glyph('caretDown', 14)), h('p', {}, t(`faqA${n}` as Key, paths)))),
      ),
      h('div', { class: 'list card' }, linkRow('support', t('supportTelegram'), TELEGRAM), linkRow('support', t('supportEmail'), `mailto:${SUPPORT_EMAIL}`)),
      h('p', { class: 'small muted note' }, t('reportNote')),
    ),
  );
}

export function aboutScreen(app: HTMLElement, back: () => void, version: string) {
  app.replaceChildren(
    h(
      'div',
      { class: 'screen enter' },
      ...screenHead(t('about'), back),
      h('div', { class: 'about-head' }, h('img', { src: '/icon/128.png', alt: '', width: 56, height: 56 }), h('strong', {}, 'Kalyx Wallet'), h('span', { class: 'small muted' }, t('version', { v: version }))),
      h('p', { class: 'small muted' }, t('aboutBody')),
      h('p', { class: 'small muted' }, t('aboutNoTracking')),
      h('div', { class: 'list card', 'data-testid': 'legal' }, linkRow('phrase', t('privacy'), sitePage('privacy'), 'privacy'), linkRow('phrase', t('terms'), sitePage('terms'), 'terms'), linkRow('about', t('legalNotice'), sitePage('mentions'))),
      h('p', { class: 'small muted note' }, `${t('aboutEditor')} : ${EDITOR}`),
    ),
  );
}

/** Choix de la langue : « celle du navigateur » ou l'une des 15, chacune écrite dans sa langue. */
export function languageSelect(): HTMLSelectElement {
  const nav = langOf(navigator.language);
  const sel = h(
    'select',
    {
      class: 'inline',
      'aria-label': t('language'),
      'data-testid': 'language',
      on: {
        // Le service worker enregistre ; cette page se recharge dans la nouvelle langue, les autres vues ouvertes suivent (applyLang).
        change: async () => {
          const lang = sel.value || null;
          if ((await send({ type: 'settings:set-lang', lang })).ok) useLang(lang);
        },
      },
    },
    h('option', { value: '', selected: CHOSEN === null }, t('langAuto', { name: LANG_NAMES[nav] })),
    ...LANGS.map((l) => h('option', { value: l, selected: CHOSEN === l, lang: l }, LANG_NAMES[l])),
  );
  return sel;
}
