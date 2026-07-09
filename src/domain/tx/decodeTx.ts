/**
 * Décodage LOCAL d'une transaction avant signature (mini-« simulation »).
 *
 * Sans API payante : on reconnaît les appels les plus courants — et surtout les
 * plus DANGEREUX (approbations, `setApprovalForAll`) — pour montrer à l'utilisateur
 * ce qu'il s'apprête à signer. Ne couvre pas tout (swaps complexes → « interaction
 * contrat, à vérifier »), mais couvre les vecteurs de drain classiques.
 */
export type DecodedTx =
  | { kind: 'empty'; to?: string; value: bigint } // simple envoi natif (données vides)
  | { kind: 'transfer'; token: string; to: string; amount: bigint } // ERC-20 transfer
  | { kind: 'transferFrom'; token: string; from: string; to: string; amount: bigint }
  | { kind: 'approve'; token: string; spender: string; amount: bigint; unlimited: boolean }
  | { kind: 'approveAll'; collection: string; operator: string; approved: boolean } // setApprovalForAll
  | { kind: 'nftTransfer'; collection: string; from: string; to: string; tokenId: bigint }
  | { kind: 'contract'; to?: string; value: bigint; selector: string }; // autre appel de contrat

const SEL = {
  transfer: '0xa9059cbb', // transfer(address,uint256)
  transferFrom: '0x23b872dd', // transferFrom(address,address,uint256)
  approve: '0x095ea7b3', // approve(address,uint256)
  approveAll: '0xa22cb465', // setApprovalForAll(address,bool)
  safeTransferFrom: '0x42842e0e', // safeTransferFrom(address,address,uint256) [ERC-721]
} as const;

// Au-delà de ce seuil, une approbation est « illimitée » (uint256/uint160 max…).
const UNLIMITED = 2n ** 160n - 2n;

function word(data: string, i: number): string {
  // i = index du mot de 32 octets (après le sélecteur de 4 octets).
  const start = 2 + 8 + i * 64;
  return data.slice(start, start + 64);
}
function addrAt(data: string, i: number): string {
  return '0x' + word(data, i).slice(24); // 20 derniers octets du mot
}
function uintAt(data: string, i: number): bigint {
  const w = word(data, i);
  return w ? BigInt('0x' + w) : 0n;
}

function asBigInt(v: bigint | string | undefined): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'string' && v.trim()) { try { return BigInt(v); } catch { return 0n; } }
  return 0n;
}

/** Décode une tx `{ to, value, data }` en intention lisible. */
export function decodeTx(tx: { to?: string; value?: bigint | string; data?: string }): DecodedTx {
  const to = tx.to;
  const value = asBigInt(tx.value);
  const data = (tx.data ?? '0x').toLowerCase();
  if (data === '0x' || data.length < 10) return { kind: 'empty', to, value };
  const sel = data.slice(0, 10);
  const token = to ?? '';
  try {
    if (sel === SEL.transfer) return { kind: 'transfer', token, to: addrAt(data, 0), amount: uintAt(data, 1) };
    if (sel === SEL.approve) {
      const amount = uintAt(data, 1);
      return { kind: 'approve', token, spender: addrAt(data, 0), amount, unlimited: amount >= UNLIMITED };
    }
    if (sel === SEL.approveAll) {
      return { kind: 'approveAll', collection: token, operator: addrAt(data, 0), approved: uintAt(data, 1) !== 0n };
    }
    if (sel === SEL.transferFrom || sel === SEL.safeTransferFrom) {
      const from = addrAt(data, 0);
      const dst = addrAt(data, 1);
      const third = uintAt(data, 2);
      // Heuristique : safeTransferFrom = NFT (tokenId) ; transferFrom générique = montant ERC-20.
      if (sel === SEL.safeTransferFrom) return { kind: 'nftTransfer', collection: token, from, to: dst, tokenId: third };
      return { kind: 'transferFrom', token, from, to: dst, amount: third };
    }
  } catch {
    /* décodage impossible → interaction contrat générique */
  }
  return { kind: 'contract', to, value, selector: sel };
}

/** Une intention décodée est-elle « à haut risque » (approbation d'accès) ? */
export function isRiskyTx(d: DecodedTx): boolean {
  return (d.kind === 'approve' && d.unlimited) || (d.kind === 'approveAll' && d.approved);
}
