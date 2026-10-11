/** Requête IA unique (hors chat) : « Explique », résumés… Ne lève jamais : renvoie une erreur lisible.
 *  L'erreur porte un `code` stable (AiErrorCode) ET son texte déjà traduit dans
 *  la langue courante : les appelants existants (AgentPanel web, audit de
 *  transaction) affichent `error` tel quel, ils sont donc localisés sans changer. */
import { useAiStore } from './aiStore';
import { useSettings } from './settingsStore';
import { translate } from './i18n';
import { buildAiRequestParams, extractProviderErrorDetail, aiErrorFromHttp, aiLanguageName, formatAiError, type AiError, type AiErrorCode } from './aiConfig';
import { copilotError, copilotLog, newCopilotTraceId } from './copilotLogger';

export async function askAi(prompt: string, system?: string): Promise<{ text: string } | { error: string; code: AiErrorCode }> {
  const lang = useSettings.getState().language || 'en';
  // Traduction au moment de l'échec, dans la langue choisie par l'utilisateur.
  const fail = (err: AiError) => ({ error: formatAiError((k) => translate(lang, k), err), code: err.code });
  const traceId = newCopilotTraceId();
  const startedAt = Date.now();
  copilotLog(traceId, 'ask.start', { promptLength: prompt.length, hasCustomSystem: !!system });
  const { apiKey, provider, customUrl, customModel, isEnabled } = useAiStore.getState();
  if (!isEnabled || !apiKey) {
    copilotLog(traceId, 'ask.rejected', { reason: 'disabled_or_missing_key' });
    return fail({ code: 'no_key' });
  }
  const sys = system ?? `Tu es Kalyx Copilot, assistant d'un wallet crypto. Réponds TOUJOURS dans la langue de l'utilisateur : ${aiLanguageName(lang)}, même si cette consigne est en français. Langage simple, tutoiement (ou son équivalent naturel dans cette langue), direct, sobre, sans jargon ni emoji, sans conseil d'investissement. Sois concis (2 à 3 phrases max).
Règles produit impératives : Kalyx est un wallet 100 % non-custodial et décentralisé. Il n'y a AUCUN serveur de compte, AUCUNE session utilisateur distante, et AUCUNE base de données gérée par l'équipe. Interdiction formelle de prétendre que l'équipe va vérifier un compte ou une session. Kalyx propose une sauvegarde chiffrée optionnelle (fichier ou dossier privé Google Drive), chiffrée sur l'appareil avec un mot de passe que personne ne peut récupérer ; aucune synchronisation automatique de compte.
RÈGLE ANTI-HALLUCINATION : N'invente jamais de concepts ou termes inexistants (ex: interdiction d'inventer "session WebConnect", "mise à jour distante de compte"). Base-toi uniquement sur des faits techniques réels.
RÈGLE DE SÉCURITÉ ABSOLUE : Tu ne dois JAMAIS accepter, répéter, ni inclure dans un message ou un ticket de support une clé privée, une seed phrase (mots de récupération) ou un mot de passe. Si le message contient de tels éléments, refuse formellement et avertis l'utilisateur de les supprimer.`;
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
      copilotLog(traceId, 'ask.failed', { status: res.status, totalElapsedMs: Date.now() - startedAt });
      return fail(aiErrorFromHttp(res.status, extractProviderErrorDetail(data)));
    }
    const text = provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
    copilotLog(traceId, 'ask.complete', { responseLength: text?.length ?? 0, totalElapsedMs: Date.now() - startedAt });
    return text ? { text: text.trim() } : fail({ code: 'empty_reply' });
  } catch (error) {
    copilotError(traceId, 'ask.exception', error, { totalElapsedMs: Date.now() - startedAt });
    return fail({ code: 'network' });
  }
}
