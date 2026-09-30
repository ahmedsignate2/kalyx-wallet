/**
 * Audit IA d'une transaction, à la demande (bouton de la fenêtre de confirmation).
 *
 * IL N'AVAIT JAMAIS MARCHÉ, pour plusieurs raisons empilées :
 *  - une réponse d'ERREUR du fournisseur (Gemini renvoie `[{error:…}]`, 503 en
 *    surcharge) était lue comme un résultat vide `{}` : rien d'affiché ;
 *  - `max_tokens: 250` : un modèle qui raisonne (gpt-oss, o-series…) épuisait ce
 *    budget avant d'écrire sa réponse → contenu vide, JSON illisible, échec muet ;
 *  - `response_format: json_object`, refusé ou ignoré selon les fournisseurs ;
 *  - Anthropic répond dans `content[0].text`, jamais lu.
 *
 * On passe désormais par `askAi`, le chemin du Copilot qui fonctionne, et on lit
 * le JSON de la réponse avec tolérance (bloc markdown, texte autour, niveaux de
 * risque formulés autrement). Toute erreur rend un MESSAGE, jamais un silence.
 */
import { askAi } from './aiAsk';

export type TxRiskLevel = 'SAFE' | 'WARNING' | 'DANGER';

export interface TxAuditResult {
  riskLevel: TxRiskLevel;
  explanation: string;
  threats: string[];
}

export type TxAuditOutcome = { ok: true; result: TxAuditResult } | { ok: false; error: string };

export interface TxAuditContext {
  to: string;
  value: string;
  method?: string;
  url?: string;
}

const LEVELS: Record<string, TxRiskLevel> = {
  SAFE: 'SAFE',
  LOW: 'SAFE',
  OK: 'SAFE',
  WARNING: 'WARNING',
  MEDIUM: 'WARNING',
  CAUTION: 'WARNING',
  DANGER: 'DANGER',
  HIGH: 'DANGER',
  CRITICAL: 'DANGER',
};

/** Lit la réponse du modèle : le premier objet JSON trouvé, champs normalisés. Rend null si illisible. */
export function parseAuditReply(text: string): TxAuditResult | null {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const o = raw as { riskLevel?: unknown; risk?: unknown; explanation?: unknown; threats?: unknown };
  const level = LEVELS[String(o.riskLevel ?? o.risk ?? '').trim().toUpperCase()];
  if (!level) return null;
  const explanation = typeof o.explanation === 'string' ? o.explanation.trim().slice(0, 400) : '';
  const threats = Array.isArray(o.threats) ? o.threats.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, 5) : [];
  return { riskLevel: level, explanation, threats };
}

/** Lance l'audit. Ne lève jamais. `timeoutMs` écoulé : message de délai dépassé. */
export async function auditTransaction(
  ctx: TxAuditContext,
  language: string,
  msgs: { timeout: string; unreadable: string },
  timeoutMs: number,
): Promise<TxAuditOutcome> {
  const system = `Tu es un expert en cybersécurité Web3 intégré à un portefeuille crypto. Tu analyses une transaction AVANT sa signature. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni texte autour, de la forme {"riskLevel":"SAFE"|"WARNING"|"DANGER","explanation":"...","threats":["..."]}. "explanation" : une ou deux phrases en langue « ${language || 'fr'} ». "threats" : liste vide s'il n'y en a pas. Tu ne vois qu'une adresse, un montant et une action : ne prétends pas en savoir plus.`;
  const prompt = `Transaction à analyser :\nDestination : ${ctx.to}\nMontant : ${ctx.value}\nAction : ${ctx.method || 'transfer'}${ctx.url ? `\nSite : ${ctx.url}` : ''}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const res = await Promise.race([askAi(prompt, system), timeout]);
    if (res === 'timeout') return { ok: false, error: msgs.timeout };
    if ('error' in res) return { ok: false, error: res.error };
    const result = parseAuditReply(res.text);
    return result ? { ok: true, result } : { ok: false, error: msgs.unreadable };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
