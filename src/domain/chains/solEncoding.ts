/**
 * Encodage « compact-u16 » des longueurs Solana, dans son propre module :
 * solTx et solMessage en ont tous deux besoin, et l'importer de solTx créait un
 * cycle solTx → solMessage → solTx (avertissement Metro, valeurs non
 * initialisées possibles selon l'ordre de chargement).
 */
/** Encodage compact-u16 (shortvec) des longueurs de tableaux Solana. */
export function encodeLength(len: number): number[] {
  const out: number[] = [];
  let rem = len;
  for (;;) {
    let elem = rem & 0x7f;
    rem >>>= 7;
    if (rem === 0) {
      out.push(elem);
      break;
    }
    elem |= 0x80;
    out.push(elem);
  }
  return out;
}
