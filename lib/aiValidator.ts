
import type { AiProvider } from './aiStore';
import { buildAiRequestParams, mapAiErrorToMessage } from './aiConfig';

export interface ValidationResult { success: boolean; error?: string; }

export async function validateAiKey(
  provider: AiProvider,
  apiKey: string,
  customUrl?: string,
  customModel?: string
): Promise<ValidationResult> {
  console.log('[AI Validator] Démarrage du test ping pour le provider:', provider);
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) return { success: false, error: 'Clé API vide.' };

  try {
    const { url, headers, model } = buildAiRequestParams(provider, trimmedKey, customUrl, customModel);
    
    // Test minimal payload
    const body: any = { max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] };
    if (provider === 'anthropic') {
      body.model = model;
    } else {
      body.model = model;
    }

    console.log('[AI Validator] Envoi de la requête vers:', url);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[AI Validator] Échec de la validation. HTTP', res.status, 'Body:', errBody);
      return { success: false, error: mapAiErrorToMessage(res.status) };
    }

    console.log('[AI Validator] Test ping réussi avec succès (200 OK)');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: 'Impossible de joindre le serveur. Vérifiez votre connexion Internet.' };
  }
}
