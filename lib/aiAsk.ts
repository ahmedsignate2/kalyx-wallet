/** Requête IA unique (hors chat) : « Explique », résumés… Ne lève jamais : renvoie une erreur lisible. */
import { useAiStore } from './aiStore';
import { useSettings } from './settingsStore';
import { buildAiRequestParams, mapAiErrorToMessage } from './aiConfig';
import { copilotError, copilotLog, newCopilotTraceId } from './copilotLogger';

export async function askAi(prompt: string, system?: string): Promise<{ text: string } | { error: string }> {
  const traceId = newCopilotTraceId();
  const startedAt = Date.now();
  copilotLog(traceId, 'ask.start', { promptLength: prompt.length, hasCustomSystem: !!system });
  const { apiKey, provider, customUrl, customModel, isEnabled } = useAiStore.getState();
  if (!isEnabled || !apiKey) {
    copilotLog(traceId, 'ask.rejected', { reason: 'disabled_or_missing_key' });
    return { error: 'Ajoute une clé API dans Réglages → Copilot pour activer les explications.' };
  }
  const lang = useSettings.getState().language || 'fr';
  const sys = system ?? `Tu es Kalyx Copilot, assistant d'un wallet crypto. Réponds en ${lang}, en français simple, tutoiement, sans jargon ni emoji, sans conseil d'investissement. Sois concis.
Règles produit impératives : Kalyx ne propose pas de sauvegarde cloud ni de synchronisation automatique. La sauvegarde est un export manuel ponctuel d'un fichier chiffré localement ; l'utilisateur choisit lui-même où le stocker et Kalyx ne reçoit ni le fichier ni le mot de passe. Ne prétends jamais qu'une sauvegarde est active ou récupérable par Kalyx. Ne déclenche aucune action et ne présente aucune hypothèse comme un fait.`;
  try {
    const { url, headers, model } = buildAiRequestParams(provider, apiKey, customUrl, customModel);
    const body: Record<string, unknown> =
      provider === 'anthropic'
        ? { model, system: sys, max_tokens: 600, messages: [{ role: 'user', content: prompt }] }
        : { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }] };
    copilotLog(traceId, 'ask.http.start', { provider, model, promptLength: prompt.length, systemLength: sys.length });
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    copilotLog(traceId, 'ask.http.response', { status: res.status, ok: res.ok, elapsedMs: Date.now() - startedAt });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; content?: { text?: string }[]; choices?: { message?: { content?: string } }[] };
    if (!res.ok) {
      const message = mapAiErrorToMessage(res.status);
      copilotLog(traceId, 'ask.failed', { status: res.status, totalElapsedMs: Date.now() - startedAt });
      return { error: message };
    }
    const text = provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
    copilotLog(traceId, 'ask.complete', { responseLength: text?.length ?? 0, totalElapsedMs: Date.now() - startedAt });
    return text ? { text: text.trim() } : { error: 'Réponse vide du modèle.' };
  } catch (error) {
    copilotError(traceId, 'ask.exception', error, { totalElapsedMs: Date.now() - startedAt });
    return { error: 'Impossible de joindre le service IA. Vérifie ta connexion.' };
  }
}
