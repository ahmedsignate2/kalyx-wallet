import { useAiStore } from './aiStore';
import { buildAiRequestParams } from './aiConfig';
import { toast } from './toast';

/**
 * Traduit les erreurs brutes communes en messages UI en français.
 * Utilisé pour les popups (toast) suite à des échecs réseau/RPC ou utilisateurs.
 */
export function handleSmartError(e: unknown) {
  console.error('[SmartError]', e);
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  
  if (msg.includes('user rejected') || msg.includes('user canceled') || msg.includes('rejected by user')) {
    toast.error('Demande annulée', 'L\'action a été annulée.');
  } else if (msg.includes('insufficient funds') || msg.includes('balance too low')) {
    toast.error('Solde insuffisant', 'Solde insuffisant pour payer les frais.');
  } else if (msg.includes('network error') || msg.includes('timeout') || msg.includes('failed to fetch')) {
    toast.error('Erreur réseau', 'Veuillez vérifier votre connexion.');
  } else if (msg.includes('nonce too low') || msg.includes('replacement transaction underpriced')) {
    toast.error('Erreur de transaction', 'La transaction est obsolète (nonce trop bas).');
  } else {
    // Fallback : On tente de traduire l'erreur complexe on-chain via l'IA
    if (useAiStore.getState().isEnabled) {
      toast.info('IA Copilot', 'Traduction de l\'erreur...');
      analyzeErrorWithAi(msg).then(translation => {
        if (translation) {
           toast.error('Diagnostic IA', translation);
        } else {
           toast.error('Erreur technique', msg.substring(0, 40) + '...');
        }
      });
    } else {
      toast.error('Erreur', 'Une erreur technique est survenue.');
    }
  }
}

export async function analyzeErrorWithAi(errorMessage: string): Promise<string | null> {
  const store = useAiStore.getState();
  if (!store.isEnabled) return null;
  
  try {
    const prompt = `Tu es un expert Web3. Un utilisateur a rencontré cette erreur blockchain / transaction : "${errorMessage}". 
Explique le problème en UNE seule phrase simple et claire (en français), et donne UNE recommandation courte pour le résoudre.
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
