import type { Key } from './i18n';
import type { AiProvider } from './aiStore';
import type { Lang } from './i18n';

export const PROVIDER_DEFAULTS: Record<string, { url: string; model: string; helperUrl?: string }> = {
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    helperUrl: 'https://platform.deepseek.com/api_keys',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    helperUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-latest',
    helperUrl: 'https://console.anthropic.com/settings/keys',
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'models/gemini-3.6-flash',
    helperUrl: 'https://aistudio.google.com/app/apikey',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    // llama-3.3-70b-versatile est parfois restreint selon le palier du compte
    // (« does not exist or you do not have access to it » constaté en test) —
    // 3.1-8b-instant est le modèle le plus universellement accessible (gratuit
    // et payant) sur Groq à ce jour.
    model: 'llama-3.1-8b-instant',
    helperUrl: 'https://console.groq.com/keys',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct',
    helperUrl: 'https://openrouter.ai/keys',
  },
  together: {
    url: 'https://api.together.xyz/v1/chat/completions',
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    helperUrl: 'https://api.together.xyz/settings/api-keys',
  },
  huggingface: {
    url: 'https://api-inference.huggingface.co/v1/chat/completions',
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
    helperUrl: 'https://huggingface.co/settings/tokens',
  },
  custom: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
  }
};

export function sanitizeEndpointUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (!url.endsWith('/chat/completions') && !url.endsWith('/messages') && !url.includes('generateContent')) {
    url = `${url}/chat/completions`;
  }
  return url;
}

export function buildAiRequestParams(
  provider: AiProvider,
  apiKey: string,
  customUrl?: string,
  customModel?: string
) {
  let url = PROVIDER_DEFAULTS[provider]?.url || PROVIDER_DEFAULTS.custom.url;
  let model = PROVIDER_DEFAULTS[provider]?.model || PROVIDER_DEFAULTS.custom.model;

  if (provider === 'custom' && customUrl) url = sanitizeEndpointUrl(customUrl);
  // L'accès aux modèles varie par COMPTE, pas seulement par fournisseur (ex.
  // un modèle Groq gratuit peut être refusé sur un compte et accepté sur un
  // autre : "does not exist or you do not have access to it" constaté en
  // test). On laisse donc remplacer le modèle par défaut sur N'IMPORTE QUEL
  // fournisseur, pas juste "custom" — l'URL/l'auth restent celles du
  // fournisseur choisi, seul le nom du modèle change.
  if (customModel) model = customModel.trim();

  // Gemini model auto-fix
  if ((provider === 'gemini' || url.includes('generative')) && !model.startsWith('models/')) {
    model = `models/${model}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey.trim()}`,
  };

  // HTTP-Referer/X-Title sont des en-têtes propres à OpenRouter (attribution
  // app pour leur classement) — les envoyer aux autres fournisseurs ne sert à
  // rien et casse Gemini sur le web : son endpoint OpenAI-compat REJETTE le
  // preflight CORS dès qu'un en-tête personnalisé non reconnu est demandé
  // (403 sur l'OPTIONS, vérifié), ce qui bloque toute la requête avant même
  // qu'elle parte (React Native n'a pas ce souci, d'où le bug invisible côté
  // app mobile jusqu'ici).
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://kalyxwallet.app';
    headers['X-Title'] = 'Kalyx Wallet Copilot';
  }

  // Anthropic uses x-api-key instead of Bearer
  if (provider === 'anthropic') {
    delete headers['Authorization'];
    headers['x-api-key'] = apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
  }

  return { url, headers, model };
}

/**
 * ERREURS IA — CODES STABLES, PAS DE TEXTE.
 * Ce module ne parle à aucune langue : il renvoie un code, et c'est l'interface
 * qui le traduit (t() / translate()). Avant, les messages étaient du français en
 * dur, affichés tels quels à un utilisateur japonais ou anglais.
 * Ne JAMAIS renommer un code existant : ils peuvent être journalisés ou testés.
 */
export type AiErrorCode =
  | 'invalid_key' // 401/403 : clé refusée ou révoquée
  | 'quota' // 402/429 : quota ou crédit épuisé
  | 'model_or_url' // 400/404 : modèle inconnu ou URL fausse
  | 'provider_down' // 5xx : le fournisseur est en panne
  | 'unknown_status' // tout autre code HTTP (affiché avec le statut)
  | 'no_key' // IA désactivée ou aucune clé enregistrée
  | 'empty_key' // champ clé vide au moment du test
  | 'empty_reply' // réponse HTTP OK mais sans texte
  | 'network'; // fetch impossible (hors ligne, DNS, CORS…)

export interface AiError {
  code: AiErrorCode;
  /** Statut HTTP, utile seulement pour `unknown_status`. */
  status?: number;
  /** Message brut du fournisseur, quand il en donne un : bien plus précis que
   *  le seau générique (ex. « modèle non disponible sur ce palier gratuit »). */
  detail?: string;
}

/** Clé i18n de chaque code. Un Record exhaustif : ajouter un code sans sa clé
 *  ne compile pas. */
export const AI_ERROR_KEYS: Record<AiErrorCode, Key> = {
  invalid_key: 'aiErrorInvalidKey',
  quota: 'aiErrorQuota',
  model_or_url: 'aiErrorModelOrUrl',
  provider_down: 'aiErrorProviderDown',
  unknown_status: 'aiErrorUnknownStatus',
  no_key: 'copilotNotEnabled',
  empty_key: 'aiErrorEmptyKey',
  empty_reply: 'aiErrorEmptyReply',
  network: 'aiErrorNetwork',
};

/** Seau de code par statut HTTP (logique reprise de l'ancien mapAiErrorToMessage). */
export function aiErrorCodeFromStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 402 || status === 429) return 'quota';
  if (status === 404 || status === 400) return 'model_or_url';
  if (status >= 500) return 'provider_down';
  return 'unknown_status';
}

/** Construit l'AiError d'une réponse HTTP en échec. */
export function aiErrorFromHttp(status: number, detail?: string): AiError {
  return { code: aiErrorCodeFromStatus(status), status, detail };
}

/**
 * Texte localisé d'une erreur. `tr` est le traducteur de l'appelant (t de useT,
 * ou `(k) => translate(lang, k)`) : ce module reste pur, sans dépendre d'i18n
 * ni de React, donc testable. Typé `(key: never)` pour accepter n'importe quel
 * traducteur, quelle que soit l'union de clés qu'il déclare.
 * Le détail du fournisseur reste entre parenthèses, dans sa langue d'origine
 * (on ne le traduit pas : c'est un diagnostic, pas une phrase de l'app).
 */
export function formatAiError(tr: (key: Key) => string, err: AiError): string {
  const base = tr(AI_ERROR_KEYS[err.code]).replace('{status}', String(err.status ?? '?'));
  return err.detail ? `${base} (${err.detail})` : base;
}

/**
 * Nom de chaque langue de l'app, pour les CONSIGNES AU MODÈLE. Le code seul
 * (« ja ») est ambigu pour certains modèles, qui retombaient alors sur le
 * français du reste de la consigne. Nom anglais + nom natif : compris par tous.
 */
const AI_LANGUAGE_NAMES: Record<Lang, string> = {
  fr: 'French (français)',
  en: 'English',
  es: 'Spanish (español)',
  pt: 'Portuguese (português)',
  de: 'German (Deutsch)',
  it: 'Italian (italiano)',
  nl: 'Dutch (Nederlands)',
  pl: 'Polish (polski)',
  tr: 'Turkish (Türkçe)',
  ru: 'Russian (русский)',
  ar: 'Arabic (العربية)',
  hi: 'Hindi (हिन्दी)',
  zh: 'Simplified Chinese (简体中文)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
};

/** Nom de langue à injecter dans une consigne système ; repli anglais, la
 *  langue de repli de l'app. */
export function aiLanguageName(lang: string | undefined | null): string {
  return AI_LANGUAGE_NAMES[(lang ?? 'en') as Lang] ?? AI_LANGUAGE_NAMES.en;
}

/**
 * Consigne de langue IMPÉRATIVE, en anglais (compris de tous les modèles). Les
 * consignes, la documentation et les journaux joints sont en français : sans
 * elle, des modèles répondaient en français à un utilisateur coréen.
 */
export function aiLanguageDirective(lang: string | undefined | null): string {
  const name = aiLanguageName(lang);
  return `LANGUAGE (mandatory): write your whole answer in ${name}, the language currently selected in the app — whatever the language of these instructions, of the documentation, of the logs or of the user's message. Never answer in French unless the selected language is French. Keep Web3 terms (wallet, swap, staking, gas, NFT, DeFi, seed phrase…) and token or network names as they are.`;
}

/** Ajoute la consigne de langue à la fin d'un prompt système (là où elle pèse le plus). */
export function withAiLanguage(system: string, lang: string | undefined | null): string {
  return `${system}\n\n${aiLanguageDirective(lang)}`;
}

/** Extrait le message d'erreur d'une réponse JSON de fournisseur IA — les
 *  formats varient (OpenAI/Groq/DeepSeek : error.message ; Gemini : error.message
 *  aussi mais parfois un tableau ; Anthropic : error.message). */
export function extractProviderErrorDetail(body: unknown): string | undefined {
  // Gemini renvoie son erreur dans un TABLEAU ([{error:{...}}]), les autres
  // fournisseurs dans un objet direct ({error:{...}}) — on gère les deux.
  const single = Array.isArray(body) ? body[0] : body;
  if (!single || typeof single !== 'object') return undefined;
  const b = single as { error?: { message?: string } | string; message?: string };
  const raw = typeof b.error === 'string' ? b.error : b.error?.message ?? b.message;
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 200) : undefined;
}
