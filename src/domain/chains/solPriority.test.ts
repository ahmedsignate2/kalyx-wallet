import {
  setComputeUnitLimitIx,
  setComputeUnitPriceIx,
  priorityInstructions,
  pickPriorityFee,
  COMPUTE_BUDGET_PROGRAM,
  PRIORITY_FEE_FLOOR,
  PRIORITY_FEE_CAP,
  CU_SOL_TRANSFER,
  CU_SPL_TRANSFER,
} from './solPriority';

describe('instructions ComputeBudget', () => {
  it('SetComputeUnitLimit : discriminant 2 + u32 little-endian', () => {
    const ix = setComputeUnitLimitIx(1_000);
    expect(ix.programId).toBe(COMPUTE_BUDGET_PROGRAM);
    expect(ix.keys).toEqual([]); // ComputeBudget ne touche aucun compte
    expect(Array.from(ix.data)).toEqual([2, 0xe8, 0x03, 0x00, 0x00]);
  });

  it('SetComputeUnitPrice : discriminant 3 + u64 little-endian', () => {
    const ix = setComputeUnitPriceIx(10_000n);
    expect(Array.from(ix.data)).toEqual([3, 0x10, 0x27, 0, 0, 0, 0, 0, 0]);
  });

  it('borne la limite dans le maximum protocolaire', () => {
    expect(Array.from(setComputeUnitLimitIx(99_000_000).data.slice(1))).toEqual(
      // 1 400 000 = 0x155CC0
      [0xc0, 0x5c, 0x15, 0x00],
    );
    expect(Array.from(setComputeUnitLimitIx(0).data.slice(1))).toEqual([1, 0, 0, 0]);
  });

  it('un prix négatif devient zéro plutôt qu\'un u64 monstrueux', () => {
    // Sans cette borne, le complément à deux produirait un prix astronomique.
    expect(Array.from(setComputeUnitPriceIx(-5n).data.slice(1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('les deux instructions, limite AVANT prix', () => {
    const ixs = priorityInstructions(CU_SOL_TRANSFER, 10_000n);
    expect(ixs).toHaveLength(2);
    expect(ixs[0].data[0]).toBe(2);
    expect(ixs[1].data[0]).toBe(3);
  });
});

describe('pickPriorityFee', () => {
  const sample = (prioritizationFee: number) => ({ slot: 1, prioritizationFee });

  it('retient le centile 75, pas la moyenne', () => {
    /*
     * La moyenne est écrasée par la masse de blocs à zéro et sous-estime
     * précisément le moment où la priorité compte. Ici : 8 valeurs, l'index
     * du centile 75 est 6 → 700000.
     */
    const samples = [0, 0, 0, 0, 100_000, 200_000, 700_000, 900_000].map(sample);
    expect(pickPriorityFee(samples)).toBe(700_000n);
  });

  it('applique le plancher quand le réseau est calme', () => {
    expect(pickPriorityFee([0, 0, 0, 0].map(sample))).toBe(PRIORITY_FEE_FLOOR);
    expect(pickPriorityFee([].map(sample))).toBe(PRIORITY_FEE_FLOOR);
  });

  it('applique le plafond contre une valeur aberrante', () => {
    expect(pickPriorityFee([9_999_999_999, 9_999_999_999].map(sample))).toBe(PRIORITY_FEE_CAP);
  });

  it('survit à une réponse RPC malformée', () => {
    // Un RPC muet ou bavard ne doit jamais empêcher d'envoyer.
    for (const bad of [null, undefined, 'nope', 42, {}, [null], [{}], [{ prioritizationFee: 'x' }], [{ prioritizationFee: NaN }], [{ prioritizationFee: -3 }]]) {
      expect(pickPriorityFee(bad)).toBe(PRIORITY_FEE_FLOOR);
    }
  });

  it('ignore les échantillons invalides mais garde les valides', () => {
    const mixed = [{ prioritizationFee: NaN }, { prioritizationFee: 50_000 }, null, { prioritizationFee: 50_000 }];
    expect(pickPriorityFee(mixed)).toBe(50_000n);
  });
});

describe('budgets d\'unités de calcul', () => {
  it('restent serrés : les frais valent prix × LIMITE demandée', () => {
    /*
     * Une limite large se paie en vrai, ce qui interdit de mettre 200 000 « au
     * cas où ». Ce test est là pour qu'une future hausse de ces constantes soit
     * un choix explicite, pas un glissement.
     */
    expect(CU_SOL_TRANSFER).toBeLessThanOrEqual(2_000);
    expect(CU_SPL_TRANSFER).toBeLessThanOrEqual(60_000);

    // Coût de priorité au plafond de prix, en lamports (prix × CU / 1e6).
    const lamportsAtCap = (cu: number) => (PRIORITY_FEE_CAP * BigInt(cu)) / 1_000_000n;
    expect(lamportsAtCap(CU_SOL_TRANSFER)).toBeLessThan(10_000n); // < 0,00001 SOL
    expect(lamportsAtCap(CU_SPL_TRANSFER)).toBeLessThan(300_000n); // < 0,0003 SOL
  });
});
