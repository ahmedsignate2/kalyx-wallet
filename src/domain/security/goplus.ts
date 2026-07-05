/**
 * GoPlus Security — détection de risques AVANT signature/transaction.
 *
 * Endpoints publics (gopluslabs.io) : sécurité d'adresse (contrat malveillant,
 * phishing, blacklist…), honeypot de token, site de phishing. Sans clé
 * (quota public suffisant pour un wallet ; une clé app_key/app_secret ne sert
 * qu'à augmenter le débit). Échec réseau = « non vérifié » (jamais bloquant).
 *
 * Helpers de PARSE purs (testés) + fonctions réseau.
 */
const BASE = 'https://api.gopluslabs.io/api/v1';
const TIMEOUT = 6000;

export type RiskLevel = 'ok' | 'danger' | 'unknown';
export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

/** Drapeaux d'adresse GoPlus → libellés FR (valeur "1" = signalé). */
const ADDRESS_FLAGS: [string, string][] = [
  ['malicious_contract', 'Contrat malveillant signalé'],
  ['phishing_activities', 'Activités de phishing'],
  ['stealing_attack', 'Attaques de vol détectées'],
  ['honeypot_related_address', 'Lié à un honeypot'],
  ['blackmail_activities', 'Activités de chantage'],
  ['blacklist_doubt', 'Adresse en liste noire'],
  ['fake_kyc', 'Faux KYC'],
  ['financial_crime', 'Crime financier'],
  ['darkweb_transactions', 'Transactions dark web'],
  ['money_laundering', 'Blanchiment'],
  ['sanctioned', 'Adresse sanctionnée'],
  ['cybercrime', 'Cybercriminalité'],
];

export function parseAddressSecurity(json: unknown): RiskAssessment {
  const result = (json as { result?: Record<string, unknown> })?.result;
  if (!result || typeof result !== 'object') return { level: 'unknown', reasons: [] };
  const reasons = ADDRESS_FLAGS.filter(([k]) => String(result[k]) === '1').map(([, label]) => label);
  return { level: reasons.length ? 'danger' : 'ok', reasons };
}

export function parseTokenSecurity(json: unknown, contract: string): RiskAssessment {
  const map = (json as { result?: Record<string, Record<string, unknown>> })?.result;
  const t = map?.[contract.toLowerCase()];
  if (!t || typeof t !== 'object') return { level: 'unknown', reasons: [] };
  const reasons: string[] = [];
  if (String(t.is_honeypot) === '1') reasons.push('Honeypot (revente impossible)');
  if (String(t.cannot_sell_all) === '1') reasons.push('Revente totale bloquée');
  if (String(t.is_blacklisted) === '1') reasons.push('Token en liste noire');
  if (String(t.selfdestruct) === '1') reasons.push('Contrat auto-destructible');
  return { level: reasons.length ? 'danger' : 'ok', reasons };
}

export function parsePhishingSite(json: unknown): boolean {
  const r = (json as { result?: { phishing_site?: number | string } })?.result;
  return String(r?.phishing_site) === '1';
}

async function getJson(path: string): Promise<unknown> {
  const res = (await Promise.race([
    fetch(`${BASE}${path}`),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT)),
  ])) as Response;
  return res.json();
}

/** Sécurité d'une adresse (contrat visé par une tx). Jamais bloquant sur erreur. */
export async function assessAddress(chainId: number, address: string): Promise<RiskAssessment> {
  try {
    return parseAddressSecurity(await getJson(`/address_security/${address}?chain_id=${chainId}`));
  } catch {
    return { level: 'unknown', reasons: [] };
  }
}

/** Sécurité d'un token (honeypot…). */
export async function assessToken(chainId: number, contract: string): Promise<RiskAssessment> {
  try {
    return parseTokenSecurity(await getJson(`/token_security/${chainId}?contract_addresses=${contract}`), contract);
  } catch {
    return { level: 'unknown', reasons: [] };
  }
}

/** True si GoPlus signale l'URL comme site de phishing. */
export async function isPhishingSite(url: string): Promise<boolean> {
  try {
    return parsePhishingSite(await getJson(`/phishing_site?url=${encodeURIComponent(url)}`));
  } catch {
    return false;
  }
}
