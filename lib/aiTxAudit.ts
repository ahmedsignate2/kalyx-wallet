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

/**
 * Ce que l'APPAREIL sait du destinataire. C'est ce qui manquait : l'IA ne
 * voyait qu'une adresse brute, et la qualifiait donc toujours d'« inconnue,
 * risque d'arnaque » — y compris pour un contact payé cent fois. Ces faits
 * sont établis localement (carnet, comptes, historique, détecteur de sosies)
 * et le modèle a pour consigne de s'y fier plutôt que de spéculer.
 */
export interface TxRecipientFacts {
  /** Nom du contact enregistré à cette adresse exacte. */
  contactName?: string;
  /** Un des comptes de ce portefeuille. */
  ownAccount?: boolean;
  /** Déjà payée avec succès (historique ou destinataires récents). */
  paidBefore?: boolean;
  /** Ressemble à une adresse connue SANS l'être (empoisonnement). */
  lookalikeOf?: string;
  /** L'adresse est un contrat (EVM). */
  isContract?: boolean;
}

export interface TxAuditContext {
  to: string;
  /** Montant LISIBLE, unité comprise (« 0,5 TON »), jamais en wei. */
  value: string;
  method?: string;
  url?: string;
  network?: string;
  /** Contre-valeur, devise comprise (« 12,30 $ »). */
  fiatValue?: string;
  memo?: string;
  recipient?: TxRecipientFacts;
}

/** Faits à afficher sous l'analyse (« Analysé avec : … »), dans l'ordre de leur poids. */
export type TxAuditFact =
  | { kind: 'lookalike' }
  | { kind: 'own' }
  | { kind: 'contact'; name: string }
  | { kind: 'paid' }
  | { kind: 'new' }
  | { kind: 'contract' };

export function auditFacts(ctx: TxAuditContext): TxAuditFact[] {
  const r = ctx.recipient;
  if (!r) return [];
  const out: TxAuditFact[] = [];
  if (r.lookalikeOf) out.push({ kind: 'lookalike' });
  if (r.ownAccount) out.push({ kind: 'own' });
  if (r.contactName) out.push({ kind: 'contact', name: r.contactName });
  if (r.paidBefore) out.push({ kind: 'paid' });
  if (!r.lookalikeOf && !r.ownAccount && !r.contactName && !r.paidBefore) out.push({ kind: 'new' });
  if (r.isContract) out.push({ kind: 'contract' });
  return out;
}

/** Le message envoyé au modèle : la transaction, puis ce que l'appareil sait. */
export function buildAuditPrompt(ctx: TxAuditContext): string {
  const lines = [
    'Transaction:',
    `- Action: ${ctx.method || 'transfer'}`,
    ctx.network ? `- Network: ${ctx.network}` : null,
    `- Amount: ${ctx.value}${ctx.fiatValue ? ` (≈ ${ctx.fiatValue})` : ''}`,
    `- Destination: ${ctx.to}`,
    ctx.memo ? `- Memo: ${ctx.memo}` : null,
    ctx.url ? `- Requested by website: ${ctx.url}` : null,
  ];
  const r = ctx.recipient;
  if (r) {
    lines.push('', 'Verified facts from the wallet (reliable, checked on the device):');
    if (r.lookalikeOf) lines.push(`- WARNING: the destination looks like a known address (${r.lookalikeOf}) but is NOT the same one — typical address poisoning.`);
    if (r.ownAccount) lines.push("- The destination is one of the user's own accounts.");
    if (r.contactName) lines.push("- The destination is one of the user's saved contacts.");
    if (r.paidBefore) lines.push('- The user has already sent funds to this exact address successfully.');
    if (!r.lookalikeOf && !r.ownAccount && !r.contactName && !r.paidBefore) lines.push('- The user has never sent to this address and it is not in their contacts.');
    if (r.isContract) lines.push('- The destination is a smart contract, not a personal wallet.');
  }
  return lines.filter((l) => l !== null).join('\n');
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
  const system = [
    'You are the Web3 security reviewer built into a crypto wallet. You review a transaction BEFORE it is signed.',
    'Reply ONLY with a valid JSON object, no markdown, no surrounding text: {"riskLevel":"SAFE"|"WARNING"|"DANGER","explanation":"...","threats":["..."]}.',
    `"explanation": one or two short sentences in the language "${language || 'fr'}", addressed to the user. "threats": short items in that language, empty list if none.`,
    'Base your verdict on the facts given. "Verified facts from the wallet" are reliable: a saved contact, an own account or an address already paid is KNOWN — never call it unknown or a likely scam.',
    'You cannot look up blockchains or blacklists: never claim an address is flagged, and do not invent threats. A plain transfer to a known address is SAFE.',
    'Use WARNING for a first payment to a new address, a contract destination, or an unusual request from a website; explain what to double-check. Use DANGER only for concrete evidence (address poisoning, a request clearly contradicting the action).',
  ].join(' ');
  const prompt = buildAuditPrompt(ctx);
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
