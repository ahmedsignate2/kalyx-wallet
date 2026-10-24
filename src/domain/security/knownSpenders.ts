/**
 * Bénéficiaires d'autorisations CONNUS : routeurs et coffres des protocoles
 * les plus utilisés, adresses publiées par leurs équipes. Une autorisation
 * vers l'un d'eux est courante ; vers une adresse absente de cette liste,
 * Kalyx vérifie au moins que c'est un contrat (une personne n'a aucune
 * raison de recevoir le droit de dépenser tes tokens).
 *
 * Liste courte et vérifiable à dessein : un oubli rend juste l'avertissement
 * plus prudent, jamais plus laxiste.
 */
const KNOWN: Record<string, string> = {
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Permit2',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  '0x66a9893cc07d91d95644aedd05d03f95e1dba8af': 'Uniswap Universal Router',
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap SwapRouter02',
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch v5',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch v6',
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
  '0x216b4b4ba9f3e719726886d34a177484278bfcae': 'ParaSwap',
  '0x6a000f20005980200259b80c5102003040001068': 'ParaSwap',
  '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110': 'CoW Protocol',
  '0x1e0049783f008a0085193e00003d00cd54003c71': 'OpenSea',
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae': 'LI.FI',
  '0xcf5540fffcdc3d510b18bfca6d2b9987b0772559': 'Odos',
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave V3',
};

/** Nom du protocole si le bénéficiaire est connu, sinon null. */
export const knownSpender = (address: string): string | null => KNOWN[address.toLowerCase()] ?? null;
