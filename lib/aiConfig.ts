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
    model: 'llama-3.3-70b-versatile',
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

  if (provider === 'custom') {
    if (customUrl) url = sanitizeEndpointUrl(customUrl);
    if (customModel) model = customModel.trim();
  }

  // Gemini model auto-fix
  if ((provider === 'gemini' || url.includes('generative')) && !model.startsWith('models/')) {
    model = `models/${model}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey.trim()}`,
    'HTTP-Referer': 'https://novawallet.app',
    'X-Title': 'Nova Wallet Copilot',
  };

  // Anthropic uses x-api-key instead of Bearer
  if (provider === 'anthropic') {
    delete headers['Authorization'];
    headers['x-api-key'] = apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
  }

  return { url, headers, model };
}

export function mapAiErrorToMessage(status: number): string {
  if (status === 401 || status === 403) return 'Clé API invalide ou révoquée.';
  if (status === 402 || status === 429) return 'Quota IA atteint. La clé API configurée a atteint sa limite. Ajoute une autre clé ou réessaie plus tard.';
  if (status === 404 || status === 400) return 'Modèle indisponible ou URL incorrecte.';
  if (status >= 500) return 'Serveur fournisseur indisponible (Erreur 500).';
  return `Erreur inconnue (${status}).`;
}
