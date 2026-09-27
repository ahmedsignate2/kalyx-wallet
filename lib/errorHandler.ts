import { useAiStore } from './aiStore';
import { buildAiRequestParams } from './aiConfig';
import { toast } from './toast';
import { recordTechnicalLog } from './technicalLogger';
import { friendlyTxError } from './txError';
import { translate } from './i18n';
import { useSettings } from './settingsStore';

/**
 * Erreur d'une requête (WalletConnect…) montrée à l'utilisateur, DANS SA LANGUE.
 *
 * Écrivait ses messages en français en dur, quelle que soit la langue choisie.
 * Le texte vient maintenant de `friendlyTxError`, le traducteur d'erreurs de
 * toute l'app ; l'IA (si activée) ne sert qu'à éclairer un cas inconnu.
 */
export function handleSmartError(e: unknown) {
  console.error('[SmartError]', e);
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  recordTechnicalLog('RPC_CLIENT_ERROR', msg);
  const lang = useSettings.getState().language;
  const t = (k: string) => translate(lang, k as never);
  const friendly = friendlyTxError(e, t as never);
  const known = friendly !== t('errGenericTxFail');
  if (known || !useAiStore.getState().isEnabled) {
    toast.error(t('errorTitle'), friendly);
    return;
  }
  // Cas inconnu : l'IA propose une explication, dans la langue de l'utilisateur.
  analyzeErrorWithAi(msg, lang).then((explained) => toast.error(t('errorTitle'), explained ?? friendly));
}

export async function analyzeErrorWithAi(errorMessage: string, lang = 'en'): Promise<string | null> {
  const store = useAiStore.getState();
  if (!store.isEnabled) return null;
  
  try {
    const prompt = `Tu es un expert Web3. Un utilisateur a rencontré cette erreur blockchain / transaction : "${errorMessage}". 
Explique le problème en UNE seule phrase simple et claire, rédigée dans la langue de code ISO « ${lang} », et donne UNE recommandation courte pour le résoudre.
Sois direct, n'utilise pas de markdown complexe.`;

    const { url, headers, model } = buildAiRequestParams(store.provider, store.apiKey!, store.customUrl, store.customModel);
    
    let body: any = { 
      model, 
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }] 
    };

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    
    let reply = store.provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
    return reply || null;
  } catch (e) {
    console.error('[AI Error Translator] Failed:', e);
    return null;
  }
}
