/**
 * RÈGLE UNIQUE de casse des adresses (toute l'app passe par ici).
 *
 * La casse ne compte pas pour :
 *  - une adresse EVM (0x + 40 hexadécimaux) — le checksum EIP-55 n'est qu'un contrôle ;
 *  - une adresse Bitcoin bech32/bech32m (bc1…, tb1…, bcrt1…) écrite tout en
 *    minuscules OU tout en majuscules, avec l'alphabet bech32 ;
 *  - une adresse TON brute (0:…hex).
 * Partout ailleurs (Solana, Bitcoin base58…) la casse FAIT PARTIE de l'adresse.
 */
const EVM = /^0x[0-9a-fA-F]{40}$/;
const BECH32_LOWER = /^(bc|tb|bcrt)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{6,87}$/;
const BECH32_UPPER = /^(BC|TB|BCRT)1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{6,87}$/;
const TON_RAW = /^-?\d+:[0-9a-fA-F]{64}$/;

export function isCaseInsensitiveAddress(a: string): boolean {
  return EVM.test(a) || BECH32_LOWER.test(a) || BECH32_UPPER.test(a) || TON_RAW.test(a);
}

/** Forme de comparaison : minuscules seulement là où la casse ne compte pas. */
export function normalizeAddressCase(a: string): string {
  const t = (a ?? '').trim();
  return isCaseInsensitiveAddress(t) ? t.toLowerCase() : t;
}
