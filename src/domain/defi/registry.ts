/**
 * Classification DeFi/Staking des tokens détenus.
 *
 * Deux étages :
 * 1. Registre de CONTRATS connus (source de vérité, prioritaire) — les grands
 *    tokens de staking liquide et d'épargne, adresses en minuscules.
 * 2. Heuristiques sur le nom/symbole (métadonnées du contrat) pour les
 *    familles génériques (aTokens Aave, Compound…). Affichage/groupage
 *    uniquement : un token spam qui usurpe un nom serait déjà visible dans la
 *    liste Crypto — aucune décision de fonds ne repose sur cette classification.
 */

export type DefiKind = 'staking' | 'defi';

export interface DefiPosition {
  kind: DefiKind;
  /** Nom du protocole affiché (Lido, Aave, Rocket Pool…). */
  protocol: string;
}

/** Contrats connus, par id de chaîne Kalyx → contrat (minuscules). */
const KNOWN: Record<string, Record<string, DefiPosition>> = {
  ethereum: {
    // Staking liquide
    '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { kind: 'staking', protocol: 'Lido' }, // stETH
    '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': { kind: 'staking', protocol: 'Lido' }, // wstETH
    '0xae78736cd615f374d3085123a210448e74fc6393': { kind: 'staking', protocol: 'Rocket Pool' }, // rETH
    '0xbe9895146f7af43049ca1c1ae358b0541ea49704': { kind: 'staking', protocol: 'Coinbase' }, // cbETH
    // Épargne / rendement
    '0x83f20f44975d03b1b09e64809b757c47f942beea': { kind: 'defi', protocol: 'Spark (sDAI)' }, // sDAI
  },
  polygon: {
    '0x3a58a54c066fdc0f2d55fc9c89f0415c92ebf3c4': { kind: 'staking', protocol: 'Lido' }, // stMATIC
  },
};

/** Heuristiques nom/symbole (après le registre). Ordre = priorité. */
const NAME_RULES: { test: RegExp; pos: DefiPosition }[] = [
  { test: /^aave /i, pos: { kind: 'defi', protocol: 'Aave' } }, // « Aave Ethereum USDC »
  { test: /^compound /i, pos: { kind: 'defi', protocol: 'Compound' } },
  { test: /^lido /i, pos: { kind: 'staking', protocol: 'Lido' } },
  { test: /^rocket pool /i, pos: { kind: 'staking', protocol: 'Rocket Pool' } },
  { test: /staked ether/i, pos: { kind: 'staking', protocol: 'Lido' } },
];
const SYMBOL_RULES: { test: RegExp; pos: DefiPosition }[] = [
  // aTokens Aave v3 : aEthUSDC, aPolWETH, aBasUSDbC, aBnbBTCB…
  { test: /^a(eth|pol|bas|bnb|arb|opt|ava)[a-z0-9]/i, pos: { kind: 'defi', protocol: 'Aave' } },
];

/**
 * Classe un token détenu. `null` = token « normal » (onglet Crypto).
 * @param chainId id Kalyx de la chaîne active ('ethereum', 'polygon'…)
 */
export function classifyToken(
  chainId: string,
  contract: string,
  name: string,
  symbol: string,
): DefiPosition | null {
  const known = KNOWN[chainId]?.[contract.toLowerCase()];
  if (known) return known;
  for (const r of NAME_RULES) if (r.test.test(name)) return r.pos;
  for (const r of SYMBOL_RULES) if (r.test.test(symbol)) return r.pos;
  return null;
}
