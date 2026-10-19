/**
 * POPUP — trois états :
 *  - aucun coffre : « Commencer » ouvre l'onboarding dans un onglet ;
 *  - verrouillé : le mot de passe ;
 *  - déverrouillé : les portefeuilles (adresses publiques), le rappel de la
 *    phrase non vérifiée, « Ajouter un portefeuille », « Verrouiller ».
 * Le portefeuille complet (soldes, envoyer, recevoir) arrive au lot 3.
 */
import { h, send } from '../../ui/dom';
import { errorText, t } from '../../ui/i18n';

interface WalletMeta {
  id: string;
  label: string;
  backedUp: boolean;
  accounts: { index: number; evm?: string; solana?: string }[];
}

const app = document.getElementById('app')!;
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const openOnboarding = async () => {
  await browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
  window.close();
};

function center(...children: (Node | false)[]) {
  app.replaceChildren(h('div', { class: 'center' }, h('img', { src: '/icon/128.png', alt: '' }), h('h1', {}, 'Kalyx Wallet'), ...children));
}

function noVault() {
  center(h('p', { class: 'muted' }, t('popupNoVault')), h('button', { class: 'btn', type: 'button', on: { click: openOnboarding } }, t('getStarted')));
}

function locked() {
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
          if (r.ok) return void refresh();
          err.textContent = r.error === 'WRONG_PASSWORD' ? t('wrongPassword') : r.error === 'THROTTLED' ? t('throttled', { s: Math.ceil((r.waitMs ?? 0) / 1000) }) : errorText(r.error);
        },
      },
    },
    pw,
    err,
    go,
  );
  center(h('p', { class: 'muted' }, t('popupUnlockSub')), form);
  pw.focus();
}

function unlocked(wallets: WalletMeta[]) {
  app.replaceChildren(
    h(
      'div',
      { class: 'head' },
      h('img', { src: '/icon/128.png', alt: '' }),
      'Kalyx',
      h('button', { class: 'link', type: 'button', on: { click: async () => (await send({ type: 'vault:lock' }), refresh()) } }, t('lock')),
    ),
    ...wallets.map((w) =>
      h(
        'div',
        { class: 'card stack', style: 'gap:6px;padding:14px' },
        h('strong', {}, w.label),
        !w.backedUp && h('div', { class: 'banner' }, h('span', {}, t('backupBanner'))),
        ...w.accounts.map((a) => h('p', { class: 'mono muted' }, [a.evm && `EVM ${short(a.evm)}`, a.solana && `SOL ${short(a.solana)}`].filter(Boolean).join('  ·  '))),
      ),
    ),
    h('button', { class: 'btn secondary', type: 'button', on: { click: openOnboarding } }, t('addWallet')),
  );
}

async function refresh() {
  const st = await send<{ hasVault: boolean; unlocked: boolean }>({ type: 'vault:status' }).catch(() => null);
  if (!st?.ok) return center(h('p', { class: 'error' }, t('unavailable')));
  if (!st.hasVault) return noVault();
  if (!st.unlocked) return locked();
  void send({ type: 'vault:touch' });
  const list = await send<{ wallets: WalletMeta[] }>({ type: 'wallet:list' });
  // Coffre créé mais aucun portefeuille encore (onboarding interrompu) : on y renvoie.
  if (list.ok && !list.wallets.length) return center(h('p', { class: 'muted' }, t('popupNoVault')), h('button', { class: 'btn', type: 'button', on: { click: openOnboarding } }, t('addWallet')));
  unlocked(list.ok ? list.wallets : []);
}

void refresh();
