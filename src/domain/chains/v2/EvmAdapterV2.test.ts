import { Transaction } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { EvmAdapterV2 } from './EvmAdapterV2';
import { EvmChainAdapter } from '../EvmChainAdapter';
import { ETHEREUM, BNB } from '../configs';
import { mnemonicToSeedSync } from '../../../crypto/mnemonic';
import { deriveEvmAccount } from '../../../crypto/hd';
import { hexToBytes } from '@noble/hashes/utils';
import type { ChainSigner } from './signer';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
/*
 * Destinataire DIFFÉRENT du compte dérivé : `0x9858…` est l'adresse que cette
 * phrase produit à l'indice 0, s'en servir comme destinataire ferait tester des
 * envois à soi-même sans le vouloir — et masquerait le contrôle de propriété
 * sur le remplacement, qui compare justement les deux.
 */
const DEST = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const seed = mnemonicToSeedSync(PHRASE);
const account = deriveEvmAccount(seed, 0);

/** Signataire borné, tel que `walletStore` le fabriquera. */
function signer(): ChainSigner {
  const privateKey = hexToBytes(account.privateKey.replace(/^0x/, ''));
  return { curve: 'secp256k1', privateKey, publicKey: secp256k1.getPublicKey(privateKey, true) };
}

/** Adapter v2 dont la v1 sous-jacente ne touche pas au réseau. */
function stub(config = ETHEREUM, provider: Record<string, unknown> = {}) {
  const v1 = new EvmChainAdapter(config);
  (v1 as unknown as { call: unknown }).call = async (fn: (p: unknown) => unknown) => fn(provider);
  return new EvmAdapterV2(config, v1);
}

const baseProvider = {
  getTransactionCount: async () => 7,
  estimateGas: async () => 21_000n,
  getFeeData: async () => ({
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    gasPrice: 29_000_000_000n,
  }),
  getCode: async () => '0x',
};

describe('EvmAdapterV2 — forme v2', () => {
  it('déclare ce qu\'il sait faire, et rien d\'autre', () => {
    const a = stub();
    expect(a.capabilities.tokens).toBe(true);
    expect(a.capabilities.accelerate).toBe(true);
    // Notions propres à Cosmos et TON : l'EVM ne les a pas.
    expect(a.capabilities.memo).toBe(false);
    expect(a.capabilities.activatesDestination).toBe(false);
    expect(a.signerCurve).toBe('secp256k1');
  });

  it('toute capacité déclarée a sa méthode', () => {
    /*
     * La règle posée dans capabilities.ts : déclarer sans implémenter produit un
     * bouton qui échoue, ce qui est pire que pas de bouton. Ce test la fait
     * respecter au lieu de la laisser à la vigilance.
     */
    const a = stub();
    const required: [boolean, unknown][] = [
      [a.capabilities.tokens, a.listTokens],
      [a.capabilities.feeTiers, a.quoteFees],
      [a.capabilities.accelerate, a.prepareAcceleration],
      [a.capabilities.cancel, a.prepareCancellation],
      [a.capabilities.simulation, a.simulate],
      [a.capabilities.messageSigning !== 'none', a.signMessage],
    ];
    for (const [declared, method] of required) {
      if (declared) expect(typeof method).toBe('function');
    }
  });

  it('dérive le même compte que la v1', () => {
    expect(stub().deriveAccount(seed, 0).address).toBe(account.address);
  });
});

describe('EvmAdapterV2 — prepareSend', () => {
  it('pièce native : le brouillon porte montant, frais et charge utile', async () => {
    const a = stub(ETHEREUM, baseProvider);
    const d = await a.prepareSend(account.address, { to: DEST, amount: 10n ** 16n });
    expect(d.to.toLowerCase()).toBe(DEST.toLowerCase());
    expect(d.amount).toBe(10n ** 16n);
    expect(d.token).toBeNull();
    expect(d.payload.nonce).toBe(7);
    expect(d.payload.value).toBe(10n ** 16n);
    expect(d.payload.data).toBe('0x');
    expect(d.fee).toBe(30_000_000_000n * d.payload.gasLimit);
  });

  it('jeton : la transaction va au CONTRAT, le destinataire est dans les données', async () => {
    /*
     * Distinction que la v1 n'exprimait pas dans son type : `to` de la
     * transaction est le contrat, le destinataire réel est encodé dans
     * `transfer(address,uint256)`. Le brouillon remonte les deux séparément.
     */
    const a = stub(ETHEREUM, { ...baseProvider, estimateGas: async () => 55_000n });
    const d = await a.prepareSend(account.address, {
      to: DEST,
      amount: 1_000_000n,
      token: { id: USDC, symbol: 'USDC', decimals: 6 },
    });
    expect(d.payload.to.toLowerCase()).toBe(USDC.toLowerCase());
    expect(d.payload.value).toBe(0n);
    expect(d.payload.data.startsWith('0xa9059cbb')).toBe(true); // transfer()
    expect(d.to.toLowerCase()).toBe(DEST.toLowerCase()); // destinataire réel
    expect(d.token?.symbol).toBe('USDC');
  });

  it('chaîne legacy : gasPrice, et pas de champs 1559', async () => {
    const a = stub(BNB, {
      ...baseProvider,
      getFeeData: async () => ({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: 3_000_000_000n }),
    });
    const d = await a.prepareSend(account.address, { to: DEST, amount: 1n });
    expect(d.payload.gasPrice).toBe(3_000_000_000n);
    expect(d.payload.maxFeePerGas).toBeUndefined();
  });

  it('la limite de gaz est estimée, avec un plancher', async () => {
    const a = stub(ETHEREUM, { ...baseProvider, estimateGas: async () => 50_000n });
    const d = await a.prepareSend(account.address, { to: DEST, amount: 1n });
    expect(d.payload.gasLimit).toBeGreaterThan(21_000n);
  });

  it('une estimation en échec ne bloque pas l\'envoi', async () => {
    const a = stub(ETHEREUM, {
      ...baseProvider,
      estimateGas: async () => {
        throw new Error('execution reverted');
      },
    });
    const d = await a.prepareSend(account.address, { to: DEST, amount: 1n });
    expect(d.payload.gasLimit).toBe(21_000n);
  });

  it('avertit quand le destinataire est un CONTRAT', async () => {
    const a = stub(ETHEREUM, { ...baseProvider, getCode: async () => '0x6080' });
    const d = await a.prepareSend(account.address, { to: DEST, amount: 1n });
    expect(d.warnings.map((w) => w.code)).toContain('DESTINATION_NOT_WALLET');
  });

  it('refuse AVANT toute signature', async () => {
    const a = stub(ETHEREUM, baseProvider);
    await expect(a.prepareSend(account.address, { to: 'pas-une-adresse', amount: 1n })).rejects.toMatchObject({
      code: 'INVALID_ADDRESS',
    });
    await expect(a.prepareSend(account.address, { to: DEST, amount: 0n })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
  });
});

describe('EvmAdapterV2 — signSend', () => {
  it('signe en type 2 et l\'émetteur récupéré est bien le compte', async () => {
    const a = stub(ETHEREUM, baseProvider);
    const d = await a.prepareSend(account.address, { to: DEST, amount: 10n ** 15n });
    const s = await a.signSend(d, signer());
    const parsed = Transaction.from(s.raw);
    expect(parsed.type).toBe(2);
    expect(parsed.from).toBe(account.address);
    expect(parsed.nonce).toBe(7);
    expect(parsed.chainId).toBe(1n);
  });

  it('signe en type 0 sur une chaîne legacy', async () => {
    const a = stub(BNB, {
      ...baseProvider,
      getFeeData: async () => ({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: 3_000_000_000n }),
    });
    const d = await a.prepareSend(account.address, { to: DEST, amount: 1n });
    const parsed = Transaction.from((await a.signSend(d, signer())).raw);
    expect(parsed.type).toBe(0);
    expect(parsed.gasPrice).toBe(3_000_000_000n);
  });

  it('refuse un signataire ed25519 : la courbe est vérifiée à l\'exécution', async () => {
    // Une erreur d'aiguillage dans le store produirait sinon une signature
    // valide sur la mauvaise courbe.
    const a = stub(ETHEREUM, baseProvider);
    const d = await a.prepareSend(account.address, { to: DEST, amount: 1n });
    const mauvais: ChainSigner = { curve: 'ed25519', secretKey: new Uint8Array(64), publicKey: new Uint8Array(32) };
    await expect(a.signSend(d, mauvais)).rejects.toThrow(/ed25519.*secp256k1/);
  });
});

describe('EvmAdapterV2 — remplacement', () => {
  const original = {
    hash: '0xabc',
    from: account.address,
    to: DEST,
    value: 10n ** 15n,
    nonce: 3,
    data: '0x',
    gasLimit: 21_000n,
    maxFeePerGas: 20_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    gasPrice: undefined,
    chainId: 1,
  };

  function withOriginal() {
    const a = stub(ETHEREUM, baseProvider);
    (a as unknown as { v1: { getTransaction: unknown } }).v1.getTransaction = async () => original;
    return a;
  }

  it('accélérer : MÊME nonce, même destinataire, frais plus élevés', async () => {
    // Un nonce différent créerait une seconde transaction au lieu d'en
    // remplacer une.
    const d = await withOriginal().prepareAcceleration(account.address, '0xabc');
    expect(d.payload.nonce).toBe(3);
    expect(d.payload.to).toBe(DEST);
    expect(d.payload.value).toBe(original.value);
    expect(d.payload.maxFeePerGas!).toBeGreaterThan(original.maxFeePerGas);
  });

  it('annuler : même nonce, envoi à SOI-MÊME de valeur nulle', async () => {
    const d = await withOriginal().prepareCancellation(account.address, '0xabc');
    expect(d.payload.nonce).toBe(3);
    expect(d.payload.to).toBe(account.address);
    expect(d.payload.value).toBe(0n);
    expect(d.payload.data).toBe('0x');
    expect(d.payload.gasLimit).toBe(21_000n); // une annulation ne fait rien
  });

  it('refuse de remplacer la transaction d\'un AUTRE compte', async () => {
    const a = stub(ETHEREUM, baseProvider);
    (a as unknown as { v1: { getTransaction: unknown } }).v1.getTransaction = async () => ({
      ...original,
      from: DEST, // un autre compte que celui qui demande
    });
    await expect(a.prepareAcceleration(account.address, '0xabc')).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    });
  });
});

describe('EvmAdapterV2 — quoteFees', () => {
  it('trois paliers croissants', async () => {
    const a = stub(ETHEREUM, baseProvider);
    const q = await a.quoteFees(account.address, { to: DEST, amount: 1n });
    expect(q.slow.cost).toBeLessThanOrEqual(q.normal.cost);
    expect(q.normal.cost).toBeLessThanOrEqual(q.fast.cost);
  });

  it('le palier choisi est HONORÉ, pas recalculé', async () => {
    // Recalculer depuis un réseau qui a bougé ferait payer autre chose que ce
    // que l'utilisateur a vu au moment de choisir.
    const a = stub(ETHEREUM, baseProvider);
    const q = await a.quoteFees(account.address, { to: DEST, amount: 1n });
    const d = await a.prepareSend(account.address, { to: DEST, amount: 1n, speed: 'fast' });
    const attendu = (q.fast.opaque as { maxFeePerGas: bigint }).maxFeePerGas;
    expect(d.payload.maxFeePerGas).toBe(attendu);
  });
});
