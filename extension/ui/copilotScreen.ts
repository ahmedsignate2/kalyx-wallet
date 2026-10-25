/**
 * COPILOTE IA (tableau de bord web) : la clé d'API de l'utilisateur, puis la
 * conversation. L'écran n'envoie que des messages à l'hôte (web/host.ts) :
 * la clé et les appels au fournisseur restent de son côté.
 */
import { h, send } from './dom';
import { errorText, t } from './i18n';
import { glyph } from './glyph';
import { PROVIDERS, PROVIDER_LABELS, helperUrl, type AiProvider, type ChatMessage } from '../lib/copilot';

interface Status {
  configured: boolean;
  provider: AiProvider | null;
  chat: ChatMessage[];
}

const header = (back: () => void, title: string) =>
  h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: back } }, glyph('back', 18), t('back')), h('span', { class: 'spacer' }));

export async function copilotScreen(app: HTMLElement, back: () => void) {
  const r = await send<Status>({ type: 'copilot:status' }).catch(() => null);
  if (!r?.ok || !r.configured) return setupScreen(app, back);
  chatScreen(app, back, r.chat);
}

/** Choisir le fournisseur et coller la clé : elle est testée avant d'être gardée. */
function setupScreen(app: HTMLElement, back: () => void) {
  const provider = h('select', { 'aria-label': t('aiProvider'), 'data-testid': 'ai-provider' }, ...PROVIDERS.map((p) => h('option', { value: p, selected: p === 'deepseek' }, PROVIDER_LABELS[p])));
  const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: false, placeholder: t('aiKeyPh'), 'aria-label': t('aiKeyLabel'), 'data-testid': 'ai-key', maxLength: 400 });
  const model = h('input', { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: t('aiModel'), 'aria-label': t('aiModel'), maxLength: 120 });
  const url = h('input', { type: 'url', autocomplete: 'off', spellcheck: false, placeholder: 'https://…/v1/chat/completions', 'aria-label': t('aiUrl'), maxLength: 300, hidden: true });
  const helper = h('a', { class: 'link small', target: '_blank', rel: 'noopener noreferrer' }, glyph('arrowUpRight', 14), t('aiGetKey'));
  const sync = () => {
    const p = provider.value as AiProvider;
    url.hidden = p !== 'custom';
    const hu = helperUrl(p);
    helper.hidden = !hu;
    if (hu) helper.setAttribute('href', hu);
  };
  provider.addEventListener('change', sync);
  sync();
  const err = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn', type: 'submit', 'data-testid': 'ai-save' }, t('aiSave'));
  const form = h(
    'form',
    {
      class: 'stack',
      on: {
        submit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          go.disabled = true;
          go.textContent = t('aiThinking');
          const res = await send({ type: 'copilot:save', provider: provider.value, apiKey: key.value, customModel: model.value, customUrl: url.hidden ? '' : url.value }).catch(() => ({ ok: false, error: 'INTERNAL' }) as const);
          go.disabled = false;
          go.textContent = t('aiSave');
          if (!res.ok) return void (err.textContent = errorText(res.error, (res as { params?: Record<string, string> }).params));
          key.value = '';
          void copilotScreen(app, back);
        },
      },
    },
    h('label', { class: 'stack', style: 'gap:6px' }, h('span', { class: 'small muted' }, t('aiProvider')), provider),
    h('label', { class: 'stack', style: 'gap:6px' }, h('span', { class: 'small muted' }, t('aiKeyLabel')), key),
    helper,
    model,
    url,
    err,
    go,
  );
  app.replaceChildren(
    h('div', { class: 'screen copilot enter' }, header(back, t('aiTitle')), h('h1', {}, t('aiTitle')), h('p', { class: 'muted' }, t('aiIntro')), h('div', { class: 'card stack' }, form), h('p', { class: 'small muted note' }, glyph('lock', 14), ' ', t('aiKeyNote'))),
  );
  key.focus();
}

/** La conversation : les bulles, trois suggestions au départ, le champ en bas. */
function chatScreen(app: HTMLElement, back: () => void, initial: ChatMessage[]) {
  let chat = initial;
  const list = h('div', { class: 'ai-chat', role: 'log', 'aria-live': 'polite', 'data-testid': 'ai-chat' });
  const err = h('p', { class: 'error', role: 'alert' });
  const input = h('textarea', { rows: 2, maxLength: 2000, placeholder: t('aiAskPh'), 'aria-label': t('aiAskPh'), 'data-testid': 'ai-input' });
  const go = h('button', { class: 'btn', type: 'submit', 'data-testid': 'ai-send' }, glyph('send', 18), t('aiSendBtn'));
  const bubble = (m: ChatMessage) => h('div', { class: `ai-msg ${m.role}` }, m.content);
  const suggestions = () =>
    h('div', { class: 'ai-sugs' }, ...[t('aiSugA'), t('aiSugB'), t('aiSugC')].map((s) => h('button', { class: 'chip', type: 'button', on: { click: () => void submit(s) } }, s)));
  const paint = () => {
    list.replaceChildren(...(chat.length ? chat.map(bubble) : [suggestions()]));
    list.scrollTop = list.scrollHeight;
  };
  async function submit(text: string) {
    const q = text.trim();
    if (!q || go.disabled) return;
    err.textContent = '';
    go.disabled = true;
    chat = [...chat, { role: 'user', content: q }];
    paint();
    const thinking = h('div', { class: 'ai-msg assistant pending' }, h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }), t('aiThinking'));
    list.append(thinking);
    list.scrollTop = list.scrollHeight;
    input.value = '';
    const res = await send<{ chat: ChatMessage[] }>({ type: 'copilot:ask', text: q }).catch(() => ({ ok: false, error: 'INTERNAL' }) as const);
    go.disabled = false;
    if (res.ok && 'chat' in res) chat = res.chat;
    else {
      // Non envoyé (secret détecté) ou refusé : la question sort du fil, le texte revient dans le champ… sauf un secret.
      chat = chat.slice(0, -1);
      if (res.error !== 'AI_SECRET') input.value = q;
      err.textContent = errorText(res.error, (res as { params?: Record<string, string> }).params);
    }
    paint();
    input.focus();
  }
  const form = h('form', { class: 'ai-form', on: { submit: (e) => (e.preventDefault(), void submit(input.value)) } }, input, go);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit(input.value);
    }
  });
  const tools = h(
    'div',
    { class: 'ai-tools' },
    h('button', { class: 'link small', type: 'button', on: { click: async () => (await send({ type: 'copilot:clear' }), (chat = []), paint()) } }, glyph('reset', 14), t('aiClear')),
    h('button', { class: 'link small', type: 'button', 'data-testid': 'ai-change-key', on: { click: async () => (await send({ type: 'copilot:forget' }), setupScreen(app, back)) } }, glyph('lock', 14), t('aiChangeKey')),
  );
  app.replaceChildren(h('div', { class: 'screen copilot enter' }, header(back, t('aiTitle')), h('h1', {}, t('aiTitle')), list, err, form, tools));
  paint();
  input.focus();
}
