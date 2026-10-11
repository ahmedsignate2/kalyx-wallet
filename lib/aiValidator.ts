
import type { AiProvider } from './aiStore';
import { translate } from './i18n';
import { useSettings } from './settingsStore';
import { buildAiRequestParams, extractProviderErrorDetail, aiErrorFromHttp, formatAiError, type AiError, type AiErrorCode } from './aiConfig';

/** `code` : cause stable, que l'écran retraduit lui-même avec t().
 *  `error` : même cause déjà traduite dans la langue courante, gardée pour les
 *  appelants qui l'affichent telle quelle (AgentPanel web). */
export interface ValidationResult { success: boolean; code?: AiErrorCode; status?: number; detail?: string; error?: string; }

function failure(err: AiError): ValidationResult {
  const lang = useSettings.getState().language || 'en';
  return { success: false, code: err.code, status: err.status, detail: err.detail, error: formatAiError((k) => translate(lang, k), err) };
}

export async function validateAiKey(
  provider: AiProvider,
  apiKey: string,
  customUrl?: string,
  customModel?: string
): Promise<ValidationResult> {
  console.log('[AI Validator] Démarrage du test ping pour le provider:', provider);
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) return failure({ code: 'empty_key' });

  try {
    const { url, headers, model } = buildAiRequestParams(provider, trimmedKey, customUrl, customModel);
    
    // Test minimal payload
    const body = { model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] };

    console.log('[AI Validator] Envoi de la requête vers:', url);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[AI Validator] Échec de la validation. HTTP', res.status, 'Body:', errText);
      let detail: string | undefined;
      try {
        detail = extractProviderErrorDetail(JSON.parse(errText));
      } catch {
        /* corps non-JSON (page d'erreur HTML, etc.) : pas de détail à afficher */
      }
      return failure(aiErrorFromHttp(res.status, detail));
    }

    console.log('[AI Validator] Test ping réussi avec succès (200 OK)');
    return { success: true };
  } catch {
    return failure({ code: 'network' });
  }
}
