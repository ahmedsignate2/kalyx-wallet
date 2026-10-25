/**
 * À QUI va une autorisation (approve, setApprovalForAll, Permit, Permit2),
 * jugé de la même façon dans l'app et l'extension :
 *  - protocole connu (liste publiée) : rien de plus ;
 *  - adresse sans code (une personne) : aucun site honnête ne demande ça ;
 *  - contrat inconnu : compté quand l'accès est sans limite ;
 *  - bénéficiaire signalé (GoPlus) : contrat malveillant.
 * Réseau : l'appelant fournit `codeOf` et `assess` (et leur délai).
 */
import { knownSpender } from './knownSpenders';
import type { RiskSignals } from './riskScore';

export async function spenderRisk(
  spender: string,
  broad: boolean,
  deps: { codeOf: (address: string) => Promise<string | null>; assess?: (address: string) => Promise<{ level: string } | null> },
): Promise<RiskSignals> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(spender) || /^0x0{40}$/.test(spender) || knownSpender(spender)) return {};
  const [code, flagged] = await Promise.all([deps.codeOf(spender).catch(() => null), deps.assess ? deps.assess(spender).catch(() => null) : null]);
  const out: RiskSignals = {};
  if (flagged?.level === 'danger') out.contractDanger = true;
  if (code === '0x') out.spenderNotContract = true;
  else if (broad) out.spenderUnknown = true;
  return out;
}
