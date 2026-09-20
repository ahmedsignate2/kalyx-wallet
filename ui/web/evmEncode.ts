/** Encodage EVM minimal côté web (aucune signature ici — le téléphone signe). */

/** Montant décimal (ex. « 0.5 ») → unité brute (10^decimals), en BigInt, sans perte de précision. */
export function toRaw(dec: string, decimals: number): bigint {
  const [int, frac = ''] = dec.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(int || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

export function toWei(dec: string): bigint {
  return toRaw(dec, 18);
}

/** `transfer(address,uint256)` — sélecteur 0xa9059cbb. */
export function encodeErc20Transfer(to: string, raw: bigint): string {
  const addr = to.trim().toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amount = raw.toString(16).padStart(64, '0');
  return `0xa9059cbb${addr}${amount}`;
}

/** `approve(address,uint256)` — sélecteur 0x095ea7b3 (avant un swap depuis un token). */
export function encodeErc20Approve(spender: string, raw: bigint): string {
  const addr = spender.trim().toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amount = raw.toString(16).padStart(64, '0');
  return `0x095ea7b3${addr}${amount}`;
}

export function hexQuantity(v: bigint): string {
  return '0x' + v.toString(16);
}
