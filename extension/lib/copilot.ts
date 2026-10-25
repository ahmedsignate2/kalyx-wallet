/**
 * COPILOTE IA (tableau de bord web) — clé d'API de l'utilisateur (BYOK).
 *
 * Même socle que l'app (lib/aiConfig : fournisseurs, en-têtes, erreurs) ; ici
 * sans React ni magasin de l'app. La clé reste dans ce navigateur et ne part
 * qu'au fournisseur choisi — jamais à Kalyx. Le modèle reçoit un résumé du
 * portefeuille SANS adresse : réseaux, tokens, montants, valeurs, activité
 * récente (textes venus de la chaîne nettoyés et tronqués : un nom de token
 * peut contenir une tentative d'injection).
 * Un message qui ressemble à une phrase de récupération ou à une clé privée
 * n'est jamais envoyé.
 */
import { buildAiRequestParams, aiErrorFromHttp, aiLanguageName, extractProviderErrorDetail, withAiLanguage, PROVIDER_DEFAULTS, type AiErrorCode } from '../../lib/aiConfig';
import { detectSensitiveSecrets } from '../../lib/secretDetector';
import type { AiProvider } from '../../lib/aiStore';
import type { Store } from './storage';

export type { AiProvider, AiErrorCode };
export const PROVIDERS = Object.keys(PROVIDER_DEFAULTS) as AiProvider[];
export const PROVIDER_LABELS: Record<AiProvider, string> = {
  deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', groq: 'Groq',
  openrouter: 'OpenRouter', together: 'Together', huggingface: 'HuggingFace', custom: 'Custom',
};
export const helperUrl = (p: AiProvider): string | undefined => PROVIDER_DEFAULTS[p]?.helperUrl;

export interface CopilotConfig {
  provider: AiProvider;
  apiKey: string;
  customUrl?: string;
  customModel?: string;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Ce que le modèle sait du portefeuille (aucune adresse). */
export interface WalletDigest {
  fiat: string;
  total: number | null;
  holdings: { symbol: string; chain: string; amount: string; value: number }[];
  activity: { when: string; chain: string; what: string; amount?: string; failed?: boolean }[];
  accounts: number;
}

const CONFIG_KEY = 'copilot.config';
const CHAT_KEY = 'copilot.chat';
const MAX_HISTORY = 40;
/** Tours envoyés au modèle : les derniers seulement (coût, et le contexte du portefeuille compte plus). */
const MAX_TURNS = 10;

/** Texte venu de la chaîne : caractères de contrôle et d'inversion retirés, tronqué. */
export function safeText(v: string | null | undefined, max = 60): string {
  if (!v) return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Le résumé envoyé au modèle, compact et sans adresse. */
export function digestText(d: WalletDigest): string {
  const money = (n: number) => `${Math.round(n * 100) / 100} ${d.fiat.toUpperCase()}`;
  return JSON.stringify({
    total: d.total === null ? 'unknown' : money(d.total),
    accounts: d.accounts,
    tokens: d.holdings.slice(0, 25).map((h) => ({ t: safeText(h.symbol, 16), n: safeText(h.chain, 24), a: safeText(h.amount, 24), v: money(h.value) })),
    recent: d.activity.slice(0, 10).map((a) => ({ d: a.when, n: safeText(a.chain, 24), w: safeText(a.what), ...(a.amount ? { a: safeText(a.amount, 32) } : {}), ...(a.failed ? { f: 1 } : {}) })),
  });
}

export function systemPrompt(lang: string, digest: WalletDigest): string {
  return withAiLanguage(
    `Tu es Kalyx Copilot, l'assistant de Kalyx Wallet, un wallet crypto 100 % non-custodial.
Réponds TOUJOURS dans la langue de l'utilisateur : ${aiLanguageName(lang)}. Tutoiement (ou son équivalent naturel), simple, direct, sobre, sans emoji, sans conseil d'investissement. 2 à 5 phrases, sauf explication technique demandée.

Tu réponds depuis le TABLEAU DE BORD WEB de Kalyx : il est relié au téléphone, qui garde les clés ; chaque envoi, swap ou révocation se valide dans l'app Kalyx du téléphone.

CE QUE TU SAIS DU PORTEFEUILLE (résumé public, JSON, sans adresse) :
${digestText(digest)}
Légende : t = token, n = réseau, a = montant, v = valeur ; recent : d = date, w = opération, f = échouée.

Tu n'as PAS accès à l'état de sécurité du téléphone (sauvegarde, biométrie, PIN) : si on te le demande, dis que tu ne peux pas le savoir d'ici et renvoie vers l'app.
Tu ne connais ni les adresses complètes, ni les clés, ni la phrase de récupération. Ne les demande JAMAIS ; si l'utilisateur en envoie, refuse et dis-lui de les supprimer.
N'invente rien sur Kalyx : aucun serveur de compte, aucune session distante, aucune équipe qui « vérifie » un compte.`,
    lang,
  );
}

/** Le message contient-il une phrase de récupération ou une clé privée ? Alors il ne part pas. */
export const looksSecret = (text: string): boolean => detectSensitiveSecrets(text).hasSecret;

export type AskResult = { text: string } | { error: AiErrorCode; status?: number; detail?: string };

/** Une question au modèle, avec les derniers tours de la conversation. Ne lève jamais. */
export async function ask(cfg: CopilotConfig, system: string, history: ChatMessage[], fetchImpl: typeof fetch = fetch): Promise<AskResult> {
  if (!cfg.apiKey.trim()) return { error: 'no_key' };
  const { url, headers, model } = buildAiRequestParams(cfg.provider, cfg.apiKey, cfg.customUrl, cfg.customModel);
  // Appel direct depuis le navigateur : Anthropic l'exige explicitement (la clé est celle de l'utilisateur, chez lui).
  if (cfg.provider === 'anthropic') headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const turns = history.slice(-MAX_TURNS).map((m) => ({ role: m.role, content: m.content }));
  const body =
    cfg.provider === 'anthropic'
      ? { model, system, max_tokens: 700, messages: turns }
      : { model, messages: [{ role: 'system', content: system }, ...turns] };
  try {
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), referrerPolicy: 'no-referrer' });
    const data = (await res.json().catch(() => ({}))) as { content?: { text?: string }[]; choices?: { message?: { content?: string } }[] };
    if (!res.ok) {
      const e = aiErrorFromHttp(res.status, extractProviderErrorDetail(data));
      return { error: e.code, status: e.status, detail: e.detail };
    }
    const text = cfg.provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
    return text?.trim() ? { text: text.trim() } : { error: 'empty_reply' };
  } catch {
    return { error: 'network' };
  }
}

/** Réglage et conversation, dans le stockage de ce navigateur (effacés avec « Se déconnecter »). */
export function makeCopilotStore(disk: Store) {
  return {
    config: async (): Promise<CopilotConfig | null> => {
      const c = await disk.get<CopilotConfig>(CONFIG_KEY);
      return c && typeof c.apiKey === 'string' && PROVIDERS.includes(c.provider) ? c : null;
    },
    saveConfig: (c: CopilotConfig) => disk.set(CONFIG_KEY, { provider: c.provider, apiKey: c.apiKey.trim(), ...(c.customUrl ? { customUrl: c.customUrl.trim() } : {}), ...(c.customModel ? { customModel: c.customModel.trim() } : {}) }),
    forgetConfig: () => disk.remove(CONFIG_KEY),
    chat: async (): Promise<ChatMessage[]> => {
      const m = await disk.get<ChatMessage[]>(CHAT_KEY);
      return Array.isArray(m) ? m.filter((x) => (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string') : [];
    },
    saveChat: (m: ChatMessage[]) => disk.set(CHAT_KEY, m.slice(-MAX_HISTORY)),
    clearChat: () => disk.remove(CHAT_KEY),
  };
}
