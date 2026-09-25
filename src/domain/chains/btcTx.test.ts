import {
  estimateVsize,
  selectUtxos,
  DUST_SATS,
  DUST_BY_KIND,
  MAX_INPUTS,
  OUTPUT_VBYTES,
  type Utxo,
} from './btcTx';

const utxo = (value: number, i = 0): Utxo => ({ txid: 'a'.repeat(64), vout: i, value });

describe('estimateVsize', () => {
  it('croît avec entrées et sorties', () => {
    expect(estimateVsize(1, ['p2wpkh', 'p2wpkh'])).toBeLessThan(estimateVsize(2, ['p2wpkh', 'p2wpkh']));
    expect(estimateVsize(1, ['p2wpkh'])).toBeLessThan(estimateVsize(1, ['p2wpkh', 'p2wpkh']));
    // 1 entrée, 2 sorties P2WPKH ≈ 10.5 + 68 + 62 = 140.5 → 141
    expect(estimateVsize(1, ['p2wpkh', 'p2wpkh'])).toBe(141);
  });

  it('facture la VRAIE taille de chaque sortie selon son type', () => {
    // Toutes les sorties étaient comptées à 31 vB, celle du P2WPKH. Envoyer
    // vers une adresse héritée ou Taproot sous-estimait donc les frais.
    const base = estimateVsize(1, ['p2wpkh']);
    expect(estimateVsize(1, ['p2pkh'])).toBe(base + (OUTPUT_VBYTES.p2pkh - OUTPUT_VBYTES.p2wpkh));
    expect(estimateVsize(1, ['p2tr'])).toBe(base + (OUTPUT_VBYTES.p2tr - OUTPUT_VBYTES.p2wpkh));
    expect(estimateVsize(1, ['p2sh'])).toBeGreaterThan(base);
  });
});

describe('selectUtxos', () => {
  it('choisit une pièce et rend la monnaie', () => {
    const sel = selectUtxos([utxo(100000)], 20000n, 10);
    expect(sel).not.toBeNull();
    expect(sel!.inputs).toHaveLength(1);
    // sum(100000) = target(20000) + fee + change
    expect(20000n + sel!.fee + sel!.change).toBe(100000n);
    expect(sel!.change).toBeGreaterThanOrEqual(DUST_SATS);
  });

  it('accumule plusieurs pièces si nécessaire', () => {
    const sel = selectUtxos([utxo(10000, 0), utxo(9000, 1), utxo(8000, 2)], 20000n, 5);
    expect(sel).not.toBeNull();
    expect(sel!.inputs.length).toBeGreaterThanOrEqual(3);
  });

  it('absorbe une monnaie « poussière » dans les frais (pas de sortie change)', () => {
    // Choisit une valeur telle que le reste après target+fee soit < DUST.
    const feeRate = 10;
    const target = 50000n;
    // feeWithChange = estimateVsize(1, 2×P2WPKH)*10 = 141*10 = 1410 ; il faut
    // sum >= 51410 ET change = sum-50000-1410 < 294 (poussière) → sum in [51410, 51704).
    // sum = 51500 → change 90 (< 294) → absorbé ; fee = sum - target = 1500.
    const sel = selectUtxos([utxo(51500)], target, feeRate);
    expect(sel).not.toBeNull();
    expect(sel!.change).toBe(0n);
    expect(sel!.fee).toBe(1500n);
  });

  it('renvoie null si solde insuffisant (frais compris)', () => {
    expect(selectUtxos([utxo(20000)], 20000n, 10)).toBeNull(); // pas de marge pour les frais
    expect(selectUtxos([], 1000n, 10)).toBeNull();
  });

  it('refuse un montant nul ou négatif', () => {
    expect(selectUtxos([utxo(100000)], 0n, 10)).toBeNull();
  });

  it('une sortie plus grosse coûte plus cher, à montant et taux identiques', () => {
    // C'est l'effet qui manquait : le destinataire change, les frais suivent.
    const cheap = selectUtxos([utxo(100000)], 20000n, 10, 'p2wpkh');
    const dear = selectUtxos([utxo(100000)], 20000n, 10, 'p2tr');
    expect(cheap!.fee).toBeLessThan(dear!.fee);
    // Et rien ne se perd : tout est réparti entre montant, frais et monnaie.
    expect(20000n + dear!.fee + dear!.change).toBe(100000n);
  });
});

describe('poussière et bornes', () => {
  it('refuse une sortie destinataire sous le seuil de POUSSIÈRE', () => {
    /*
     * Sans ce contrôle, la transaction était construite, signée, puis REFUSÉE à
     * la diffusion (« non standard ») avec un message de nœud incompréhensible.
     */
    expect(selectUtxos([utxo(1_000_000)], 100n, 10, 'p2wpkh')).toBeNull();
    expect(selectUtxos([utxo(1_000_000)], DUST_SATS, 10, 'p2wpkh')).not.toBeNull();
  });

  it('le seuil dépend du TYPE d\'adresse', () => {
    // 546 en hérité, 294 en SegWit natif : un seuil unique acceptait des
    // sorties héritées que le réseau refuse.
    const heritee = 400n; // > 294 mais < 546
    expect(selectUtxos([utxo(1_000_000)], heritee, 10, 'p2wpkh')).not.toBeNull();
    expect(selectUtxos([utxo(1_000_000)], heritee, 10, 'p2pkh')).toBeNull();
    expect(DUST_BY_KIND.p2pkh).toBeGreaterThan(DUST_BY_KIND.p2wpkh);
  });

  it('ignore les pièces qui coûtent plus cher à dépenser qu\'elles ne valent', () => {
    // À 50 sat/vB, une entrée coûte ~3 400 sats : en ajouter une de 1 000
    // RÉDUIRAIT le montant disponible.
    const sel = selectUtxos([utxo(500_000, 0), utxo(1_000, 1), utxo(900, 2)], 100_000n, 50);
    expect(sel).not.toBeNull();
    expect(sel!.inputs).toHaveLength(1);
  });

  it('refuse plutôt que de construire une transaction non relayable', () => {
    // Au-delà d'un certain nombre d'entrées, la transaction dépasse la taille
    // standard et aucun nœud ne la propage.
    const many = Array.from({ length: MAX_INPUTS + 50 }, (_, i) => utxo(5_000, i));
    expect(selectUtxos(many, BigInt(5_000 * (MAX_INPUTS + 40)), 1)).toBeNull();
  });

  it('reste possible quand les pièces suffisent sous la limite', () => {
    const few = Array.from({ length: 10 }, (_, i) => utxo(50_000, i));
    expect(selectUtxos(few, 300_000n, 5)).not.toBeNull();
  });
});
