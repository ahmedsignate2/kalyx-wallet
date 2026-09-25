import { BitcoinAdapterV2, type BitcoinPendingContext } from './BitcoinAdapterV2';
import { BitcoinChainAdapter } from '../BitcoinChainAdapter';
import { BITCOIN } from '../configs';
import { deriveBtcSigner } from '../../../crypto/btc';
import { mnemonicToSeedSync } from '../../../crypto/mnemonic';
import { DUST_BY_KIND } from '../btcTx';
import type { ChainSigner } from './signer';
import type { ChainAdapterV2 } from './types';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const btcSigner = deriveBtcSigner(mnemonicToSeedSync(PHRASE), 0);
const ME = btcSigner.address;
const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

function signer(): ChainSigner {
  return { curve: 'secp256k1', privateKey: btcSigner.privateKey, publicKey: btcSigner.publicKey };
}

const FEES = { fastestFee: 40, halfHourFee: 20, hourFee: 10, minimumFee: 1 };
const UTXOS = [{ txid: 'b'.repeat(64), vout: 0, value: 2_000_000, status: { confirmed: true } }];

/** Adapter v2 dont la v1 sous-jacente ne touche pas au réseau. */
function stub(fetchJson: (path: string) => unknown = (p) => (p.includes('/utxo') ? UTXOS : FEES)) {
  const v1 = new BitcoinChainAdapter(BITCOIN);
  let broadcast = '';
  (v1 as unknown as { fetchJson: unknown }).fetchJson = async (p: string) => fetchJson(p);
  (v1 as unknown as { broadcastHex: unknown }).broadcastHex = async (h: string) => {
    broadcast = h;
    return 'TXID';
  };
  return { adapter: new BitcoinAdapterV2(BITCOIN, v1), hex: () => broadcast, v1 };
}

describe('BitcoinAdapterV2 — forme v2', () => {
  it('déclare ce que Bitcoin fait, et pas le reste', () => {
    const { adapter } = stub();
    expect(adapter.capabilities.tokens).toBe(false);
    expect(adapter.capabilities.accelerate).toBe(true);
    expect(adapter.capabilities.cancel).toBe(true);
    // Pas de simulation : aucun équivalent simple à `eth_call` sur un UTXO.
    expect(adapter.capabilities.simulation).toBe(false);
    const parInterface: ChainAdapterV2 = adapter;
    expect(parInterface.simulate).toBeUndefined();
    expect(parInterface.listTokens).toBeUndefined();
  });

  it('refuse un envoi de jeton : la notion n\'existe pas', async () => {
    const { adapter } = stub();
    await expect(
      adapter.prepareSend(ME, { to: DEST, amount: 10_000n, token: { id: 'x', symbol: 'X', decimals: 8 } }),
    ).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });
});

describe('BitcoinAdapterV2 — prepareSend', () => {
  it('sélectionne les pièces et expose les frais réels', async () => {
    const { adapter } = stub();
    const d = await adapter.prepareSend(ME, { to: DEST, amount: 100_000n });
    expect(d.amount).toBe(100_000n);
    expect(d.payload.selection.inputs).toHaveLength(1);
    expect(d.fee).toBe(d.payload.selection.fee);
    // Rien ne se perd : entrée = montant + frais + monnaie.
    expect(100_000n + d.fee + d.payload.selection.change).toBe(2_000_000n);
  });

  it('refuse la POUSSIÈRE avant toute signature, selon le type d\'adresse', async () => {
    const { adapter } = stub();
    // 400 sats : au-dessus du seuil SegWit natif, en dessous du seuil hérité.
    await expect(adapter.prepareSend(ME, { to: DEST, amount: 400n })).resolves.toBeDefined();
    await expect(adapter.prepareSend(ME, { to: P2PKH, amount: 400n })).rejects.toMatchObject({
      code: 'AMOUNT_TOO_SMALL',
    });
    expect(DUST_BY_KIND.p2pkh).toBeGreaterThan(DUST_BY_KIND.p2wpkh);
  });

  it('refuse une adresse invalide et un montant nul', async () => {
    const { adapter } = stub();
    await expect(adapter.prepareSend(ME, { to: 'nope', amount: 10_000n })).rejects.toMatchObject({
      code: 'INVALID_ADDRESS',
    });
    await expect(adapter.prepareSend(ME, { to: DEST, amount: 0n })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
  });

  it('solde insuffisant : refus explicite', async () => {
    const { adapter } = stub((p) =>
      p.includes('/utxo') ? [{ txid: 'c'.repeat(64), vout: 0, value: 5_000, status: { confirmed: true } }] : FEES,
    );
    await expect(adapter.prepareSend(ME, { to: DEST, amount: 1_000_000n })).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
  });

  it('le palier choisi change réellement les frais', async () => {
    const { adapter } = stub();
    const lent = await adapter.prepareSend(ME, { to: DEST, amount: 100_000n, speed: 'slow' });
    const rapide = await adapter.prepareSend(ME, { to: DEST, amount: 100_000n, speed: 'fast' });
    expect(lent.payload.feeRate).toBe(FEES.hourFee);
    expect(rapide.payload.feeRate).toBe(FEES.fastestFee);
    expect(lent.fee).toBeLessThan(rapide.fee);
  });

  it('quoteFees chiffre sur une VRAIE sélection, pas sur une entrée supposée', async () => {
    /*
     * Le coût dépend du nombre d'entrées retenues : annoncer le prix d'une
     * entrée quand le paiement en demandera cinq tromperait de 4 × 68 vB.
     */
    const many = Array.from({ length: 5 }, (_, i) => ({
      txid: `${i}`.repeat(64),
      vout: 0,
      value: 60_000,
      status: { confirmed: true },
    }));
    const { adapter } = stub((p) => (p.includes('/utxo') ? many : FEES));
    const q = await adapter.quoteFees(ME, { to: DEST, amount: 250_000n });
    const d = await adapter.prepareSend(ME, { to: DEST, amount: 250_000n });
    expect(d.payload.selection.inputs.length).toBeGreaterThan(1);
    expect(q.normal.cost).toBe(d.fee);
  });
});

describe('BitcoinAdapterV2 — signature', () => {
  it('signe, et la transaction diffusée porte le bon montant', async () => {
    const { adapter, hex } = stub();
    const d = await adapter.prepareSend(ME, { to: DEST, amount: 100_000n });
    const s = await adapter.signSend(d, signer());
    const out = await adapter.broadcastSend(s);
    expect(out.txid).toBe('TXID');

    const btc = await import('@scure/btc-signer');
    const tx = btc.Transaction.fromRaw(Buffer.from(hex(), 'hex'), { allowUnknownOutputs: true });
    expect(tx.getOutput(0).amount).toBe(100_000n);
    // Entrées marquées remplaçables (BIP-125).
    expect(tx.getInput(0).sequence).toBeLessThan(0xfffffffe);
  });

  it('la diffusion rend le CONTEXTE de remplacement', async () => {
    // Sans les entrées et le taux payé, aucune accélération ne sera
    // constructible : les UTXO dépensés disparaissent de l'ensemble disponible.
    const { adapter } = stub();
    const d = await adapter.prepareSend(ME, { to: DEST, amount: 100_000n });
    const out = await adapter.broadcastSend(await adapter.signSend(d, signer()));
    const ctx = out.opaque as BitcoinPendingContext;
    expect(ctx.inputs).toHaveLength(1);
    expect(ctx.target).toBe(100_000n);
    expect(ctx.feeRate).toBe(FEES.halfHourFee);
  });

  it('refuse un signataire ed25519', async () => {
    const { adapter } = stub();
    const d = await adapter.prepareSend(ME, { to: DEST, amount: 100_000n });
    const mauvais: ChainSigner = { curve: 'ed25519', secretKey: new Uint8Array(64), publicKey: new Uint8Array(32) };
    await expect(adapter.signSend(d, mauvais)).rejects.toThrow(/ed25519.*secp256k1/);
  });
});

describe('BitcoinAdapterV2 — remplacement', () => {
  const context: BitcoinPendingContext = {
    dest: DEST,
    target: 100_000n,
    feeRate: 10,
    inputs: [{ txid: 'b'.repeat(64), vout: 0, value: 2_000_000 }],
    fee: 1_410n,
  };
  const pending = { txid: 'TXID', opaque: context };

  it('accélérer : mêmes entrées, même destinataire, taux strictement plus élevé', async () => {
    const { adapter } = stub();
    const d = await adapter.prepareAcceleration(ME, pending);
    expect(d.payload.selection.inputs).toEqual(context.inputs);
    expect(d.to).toBe(DEST);
    expect(d.amount).toBe(100_000n); // le montant envoyé ne bouge pas
    expect(d.payload.feeRate).toBeGreaterThan(context.feeRate);
    expect(d.fee).toBeGreaterThan(0n);
  });

  it('annuler : mêmes entrées, tout revient à SOI', async () => {
    const { adapter } = stub();
    const d = await adapter.prepareCancellation(ME, pending);
    expect(d.payload.selection.inputs).toEqual(context.inputs);
    expect(d.to).toBe(ME);
    // L'opération ne transfère rien : elle consomme les entrées pour rendre
    // l'originale caduque, et récupère le reste.
    expect(d.amount + d.fee).toBe(2_000_000n);
    expect(d.payload.selection.change).toBe(0n);
  });

  it('refuse quand les entrées ne sont pas connues', async () => {
    // C'est le cas qui a justifié `PendingRef.opaque` : un txid seul ne suffit
    // pas à reconstruire un remplacement Bitcoin.
    const { adapter } = stub();
    await expect(adapter.prepareAcceleration(ME, { txid: 'TXID' })).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    });
    await expect(
      adapter.prepareAcceleration(ME, { txid: 'TXID', opaque: { ...context, inputs: [] } }),
    ).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('refuse d\'accélérer si la monnaie ne couvre pas la hausse', async () => {
    // On n'accélère jamais en rognant le montant envoyé.
    const { adapter } = stub((p) => (p.includes('/utxo') ? UTXOS : { fastestFee: 500, halfHourFee: 400, hourFee: 300 }));
    await expect(
      adapter.prepareAcceleration(ME, {
        txid: 'TXID',
        opaque: { ...context, inputs: [{ txid: 'b'.repeat(64), vout: 0, value: 100_100 }] },
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('refuse quand le taux est déjà au plafond', async () => {
    const { adapter } = stub((p) =>
      p.includes('/utxo') ? UTXOS : { fastestFee: 2_000, halfHourFee: 2_000, hourFee: 2_000 },
    );
    await expect(
      adapter.prepareAcceleration(ME, { txid: 'TXID', opaque: { ...context, feeRate: 2_000 } }),
    ).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });
});

describe('BitcoinAdapterV2 — waitForTx', () => {
  it('confirmée', async () => {
    const { adapter } = stub((p) => (p.startsWith('/tx/') ? { status: { confirmed: true } } : FEES));
    await expect(adapter.waitForTx('TXID')).resolves.toEqual({ status: 'confirmed' });
  });

  it('dans le mempool : en attente', async () => {
    const { adapter } = stub((p) => (p.startsWith('/tx/') ? { status: { confirmed: false } } : FEES));
    await expect(adapter.waitForTx('TXID')).resolves.toEqual({ status: 'pending' });
  });

  it('inconnue du nœud : en attente, JAMAIS « échouée »', async () => {
    /*
     * Une transaction Bitcoin est incluse ou ne l'est pas : elle ne peut pas
     * être incluse ET rejetée. Ne pas la trouver veut dire qu'on ne sait pas,
     * et prétendre qu'elle a échoué serait une affirmation fausse.
     */
    const { adapter } = stub((p) => {
      if (p.startsWith('/tx/')) throw new Error('404');
      return FEES;
    });
    await expect(adapter.waitForTx('TXID')).resolves.toEqual({ status: 'pending' });
  });
});

describe('BitcoinAdapterV2 — signature de message', () => {
  it('BIP-137 par défaut, BIP-322 sur demande', async () => {
    // Défaut BIP-137 : c'est la forme que comprennent les vérificateurs
    // anciens, et se tromper de protocole produit une preuve illisible.
    const { adapter } = stub();
    const ecdsa = await adapter.signMessage('test', signer());
    const bip322 = await adapter.signMessage('test', signer(), 'bip322');
    expect(ecdsa).not.toBe(bip322);
    expect(Buffer.from(ecdsa, 'base64').length).toBe(65);
    expect(Buffer.from(bip322, 'base64').length).toBeGreaterThan(65);
  });
});
