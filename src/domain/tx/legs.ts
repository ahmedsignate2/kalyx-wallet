/**
 * D'une liste de MOUVEMENTS à une transaction lisible.
 *
 * Un indexeur rend des transferts, pas des transactions : un swap, c'est un
 * token qui sort et un autre qui entre, sous le même hachage. L'historique les
 * dédoublonnait par hachage et gardait le premier venu — l'échange devenait un
 * simple envoi, et l'autre moitié disparaissait. Ici on les regroupe, et on dit
 * ce que la transaction a FAIT.
 */
import type { TxLeg, TxParsed } from '../chains/types';

/** Un mouvement avec ses adresses (l'indexeur les donne par transfert). */
export interface RawLeg extends TxLeg {
  from: string;
  to: string;
  /** Destination ET source = le propriétaire. */
  self?: boolean;
}

export interface TxBase {
  hash: string;
  timestamp: number;
  status: TxParsed['status'];
  /** Voir `TxSummary.byOwner`. */
  byOwner?: boolean;
}

/** Clé d'un actif : la monnaie native n'a pas de contrat. */
const assetKey = (l: TxLeg) => (l.contract ? l.contract.toLowerCase() : `native:${l.asset ?? ''}`);

export function txFromLegs(base: TxBase, raw: RawLeg[]): TxParsed | null {
  if (raw.length === 0) return null;
  /*
   * L'appel au contrat porte souvent 0 en monnaie native : ce n'est pas un
   * mouvement, seulement le véhicule des transferts de tokens qui suivent.
   */
  const moving = raw.length > 1 ? raw.filter((l) => l.value > 0n || l.nft || l.contract) : raw;
  const legs = moving.length ? moving : raw;
  const outs = legs.filter((l) => l.direction === 'out' && !l.self);
  const ins = legs.filter((l) => l.direction === 'in' && !l.self);
  const fungible = (l: RawLeg) => !l.nft;
  const swap =
    outs.some(fungible) && ins.some(fungible) && outs.filter(fungible).some((o) => ins.filter(fungible).some((i) => assetKey(i) !== assetKey(o)));
  const primary = swap ? outs.find(fungible)! : legs[0];
  const direction: TxParsed['direction'] = primary.self ? 'self' : primary.direction;
  const type = swap ? 'SWAP' : primary.nft ? 'NFT' : primary.contract ? 'TRANSFER' : undefined;
  const tx: TxParsed = {
    hash: base.hash,
    timestamp: base.timestamp,
    status: base.status,
    from: primary.from,
    to: primary.to,
    value: primary.value,
    direction,
    ...(base.byOwner !== undefined ? { byOwner: base.byOwner } : {}),
    ...(type ? { type } : {}),
    ...(primary.asset !== undefined ? { asset: primary.asset } : {}),
    ...(primary.decimals !== undefined ? { decimals: primary.decimals } : {}),
    ...(primary.contract ? { contract: primary.contract } : {}),
    ...(primary.tokenId ? { tokenId: primary.tokenId } : {}),
  };
  if (legs.length > 1) {
    tx.legs = legs.map(({ from: _f, to: _t, self: _s, ...leg }) => leg);
  }
  return tx;
}

/** La jambe ENTRANTE principale d'un swap (ce qu'on a reçu en échange). */
export function swapReceived(tx: Pick<TxParsed, 'legs'>): TxLeg | undefined {
  return tx.legs?.find((l) => l.direction === 'in' && !l.nft);
}
