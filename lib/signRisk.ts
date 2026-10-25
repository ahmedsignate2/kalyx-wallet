/**
 * SCORE DE RISQUE d'une demande de signature dans l'app — le MÊME moteur que
 * l'extension (src/domain/security/riskScore) : « risqué » veut dire la même
 * chose partout. Les signaux viennent de ce que la fenêtre a déjà analysé
 * (site signalé, sosie, SIWE, décodage, simulation) ; seul le bénéficiaire
 * d'une autorisation demande une lecture de plus (son code, sur la chaîne).
 */
import { lookalikeOf } from '../src/domain/web/dappCatalog';
import { scoreRisk, type RiskScore, type RiskSignals } from '../src/domain/security/riskScore';
import { spenderRisk } from '../src/domain/security/spenderRisk';
import { simulatedChanges, type Simulation } from '../src/domain/tx/simulate';
import type { DecodedTx } from '../src/domain/tx/decodeTx';
import type { TypedDataSummary } from '../src/domain/wc/message';

export interface SignRiskInput {
  /** Hôte réel du site (sans « www. »). */
  host?: string;
  url?: string;
  phishingSite?: boolean;
  /** SIWE pour un autre domaine que le site. */
  siweDomain?: string | null;
  /** Contrat visé signalé comme malveillant. */
  contractDanger?: boolean;
  decoded?: DecodedTx | null;
  typed?: TypedDataSummary | null;
  simulation?: Simulation | null;
  /** Données d'appel présentes (« 0x… » non vide) et valeur native envoyée. */
  hasData?: boolean;
  value?: bigint;
  /** Plusieurs transactions d'un coup (Solana signAll). */
  txCount?: number;
  /** Site déjà vu depuis plus de 24 h (connexion, signature ou site mémorisé). */
  knownSite?: boolean;
}

/** Signaux tirés de l'analyse déjà faite (aucune requête). */
export function signRiskSignals(i: SignRiskInput): RiskSignals {
  const s: RiskSignals = {};
  if (i.phishingSite) s.phishingSite = true;
  const brand = i.host ? lookalikeOf(i.host) : null;
  if (brand) s.lookalike = { brand };
  if (i.siweDomain) s.domainMismatch = { domain: i.siweDomain.slice(0, 60) };
  if (i.contractDanger) s.contractDanger = true;
  const d = i.decoded;
  if (d?.kind === 'approve' && d.unlimited) s.unlimitedApproval = true;
  if (d?.kind === 'approveAll' && d.approved) s.approveAll = true;
  const ty = i.typed;
  if (ty?.unlimited) s.unlimitedApproval = true;
  if (ty?.order) s.nftOrder = true;
  if (ty?.details?.some((x) => /échéance|deadline/i.test(x.label) && /sans expiration/i.test(x.value))) s.permitNoExpiry = true;
  const sim = i.simulation;
  if (i.hasData && sim && sim.changes.some((c) => c.direction === 'out') && !sim.changes.some((c) => c.direction === 'in')) s.lossOnly = true;
  // Un contrat appelé sans aperçu réel des mouvements (un simple envoi, lui, est connu sans simulation).
  if (i.hasData && !simulatedChanges(sim) && !sim?.error) s.noSimulation = true;
  if ((i.txCount ?? 1) > 1) s.manyTxs = { n: String(i.txCount) };
  if (i.url && /^http:\/\//i.test(i.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(i.url)) s.insecureSite = true;
  if (i.knownSite === false) s.firstVisit = true;
  return s;
}

/**
 * Score complet : les signaux ci-dessus, plus le bénéficiaire d'une
 * autorisation (personne ? contrat inconnu ? signalé ?). `codeOf` lit le code
 * d'une adresse sur le réseau de la demande ; `assess`, sa réputation.
 */
export async function signRisk(
  i: SignRiskInput,
  deps: { codeOf?: (address: string) => Promise<string | null>; assess?: (address: string) => Promise<{ level: string } | null> } = {},
): Promise<RiskScore> {
  const s = signRiskSignals(i);
  const d = i.decoded;
  const spender = d?.kind === 'approve' && d.amount > 0n ? d.spender : d?.kind === 'approveAll' && d.approved ? d.operator : i.typed?.spender && (i.typed.permit2 || /permit/i.test(i.typed.primaryType ?? '')) ? i.typed.spender : null;
  if (spender && deps.codeOf) {
    const broad = d?.kind === 'approve' ? d.unlimited : d?.kind === 'approveAll' ? true : !!i.typed?.unlimited;
    Object.assign(s, await spenderRisk(spender, broad, { codeOf: deps.codeOf, assess: deps.assess }));
  }
  return scoreRisk(s);
}

/** Site « connu » : mémorisé, ou vu (connexion, signature) il y a plus de 24 h. */
export function siteKnown(host: string, a: { connections: { host: string; at: number }[]; remembered: string[]; signatures: { host: string; at: number }[] }, now = Date.now()): boolean {
  if (a.remembered.includes(host)) return true;
  const day = 86_400_000;
  return a.signatures.some((x) => x.host === host && now - x.at > day) || a.connections.some((x) => x.host === host && now - x.at > day);
}
