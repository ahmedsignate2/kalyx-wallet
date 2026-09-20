import type { AiProvider } from './aiStore';

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

/** `detail` : message d'erreur renvoyé par le fournisseur lui-même (JSON de la
 *  réponse), quand on l'a — bien plus précis que le seau générique par code
 *  HTTP (ex. « modèle non disponible sur ce palier gratuit » plutôt qu'un
 *  vague « modèle indisponible »). Toujours ajouté entre parenthèses s'il existe. */
export function mapAiErrorToMessage(status: number, detail?: string): string {
  const base = (() => {
    if (status === 401 || status === 403) return 'Clé API invalide ou révoquée.';
    if (status === 402 || status === 429) return 'Quota IA atteint. La clé API configurée a atteint sa limite. Ajoute une autre clé ou réessaie plus tard.';
    if (status === 404 || status === 400) return 'Modèle indisponible ou URL incorrecte.';
    if (status >= 500) return 'Serveur fournisseur indisponible (Erreur 500).';
    return `Erreur inconnue (${status}).`;
  })();
  return detail ? `${base} (${detail})` : base;
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
