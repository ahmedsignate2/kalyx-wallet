import { base58, base64 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { SolanaAdapterV2 } from './SolanaAdapterV2';
import { SolanaChainAdapter } from '../SolanaChainAdapter';
import { SOLANA } from '../configs';
import { COMPUTE_BUDGET_PROGRAM } from '../solPriority';
import { deriveSolanaSigner, deriveSolanaAccount } from '../../../crypto/solana';
import { getAssociatedTokenAddress } from '../../../crypto/solPda';
import { mnemonicToSeedSync } from '../../../crypto/mnemonic';
import type { ChainSigner } from './signer';
import type { ChainAdapterV2 } from './types';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seed = mnemonicToSeedSync(PHRASE);
const account = deriveSolanaAccount(seed, 0);
const DEST = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
const LEGACY = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function signer(): ChainSigner {
  const s = deriveSolanaSigner(seed, 0);
  return { curve: 'ed25519', secretKey: s.secretKey, publicKey: s.publicKey };
}

/** Adapter v2 dont la v1 sous-jacente ne touche pas au réseau. */
function stub(handlers: Record<string, (p: unknown[]) => unknown>) {
  const v1 = new SolanaChainAdapter(SOLANA);
  const calls: { method: string; params: unknown[] }[] = [];
  (v1 as unknown as { rpc: unknown }).rpc = async (method: string, params: unknown[]) => {
    calls.push({ method, params });
    const h = handlers[method];
    if (!h) throw new Error(`méthode RPC non prévue : ${method}`);
    return h(params);
  };
  return { adapter: new SolanaAdapterV2(SOLANA, v1), calls, v1 };
}

const blockhashOk = () => ({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1000 } });
const fees = () => [{ slot: 1, prioritizationFee: 20_000 }, { slot: 2, prioritizationFee: 80_000 }];

/** Clés de comptes du message d'un brouillon. */
function accountKeys(message: Uint8Array): string[] {
  let i = 3;
  const count = message[i];
  i += 1;
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    out.push(base58.encode(message.slice(i, i + 32)));
    i += 32;
  }
  return out;
}

describe('SolanaAdapterV2 — forme v2', () => {
  it('ne déclare NI accélération NI annulation, et c\'est correct', () => {
    /*
     * Ce n'est pas un manque : une transaction Solana non incluse expire d'elle-
     * même sans rien débiter. Il n'y a rien à accélérer, rien à annuler.
     */
    const { adapter } = stub({});
    expect(adapter.capabilities.accelerate).toBe(false);
    expect(adapter.capabilities.cancel).toBe(false);
    // En revanche elle active le compte du destinataire, elle, et le dit.
    expect(adapter.capabilities.activatesDestination).toBe(true);
    expect(adapter.signerCurve).toBe('ed25519');
  });

  it('toute capacité déclarée a sa méthode', () => {
    const { adapter } = stub({});
    if (adapter.capabilities.tokens) expect(typeof adapter.listTokens).toBe('function');
    if (adapter.capabilities.feeTiers) expect(typeof adapter.quoteFees).toBe('function');
    if (adapter.capabilities.simulation) expect(typeof adapter.simulate).toBe('function');
    if (adapter.capabilities.messageSigning !== 'none') expect(typeof adapter.signMessage).toBe('function');
    /*
     * Et l'inverse : aucune méthode pour une capacité non déclarée. Vu à
     * travers l'interface, parce que sur la classe concrète le compilateur
     * refuse déjà l'accès — ce qui est la preuve la plus forte, mais ne
     * s'exprime pas dans une assertion.
     */
    const parInterface: ChainAdapterV2 = adapter;
    expect(parInterface.prepareAcceleration).toBeUndefined();
    expect(parInterface.prepareCancellation).toBeUndefined();
  });
});

describe('SolanaAdapterV2 — prepareSend natif', () => {
  const handlers = {
    getLatestBlockhash: blockhashOk,
    getRecentPrioritizationFees: fees,
  };

  it('le brouillon porte la priorité, les frais et une PÉREMPTION', async () => {
    const { adapter } = stub(handlers);
    const d = await adapter.prepareSend(account.address, { to: DEST, amount: 500_000_000n });
    expect(d.amount).toBe(500_000_000n);
    expect(d.token).toBeNull();
    expect(d.fee).toBeGreaterThan(5_000n); // frais de base + priorité
    // Un blockhash périme : un écran ne doit pas proposer de signer un
    // brouillon mort.
    expect(d.expiresAt).toBeGreaterThan(Date.now());
    expect(accountKeys(d.payload.message)).toContain(COMPUTE_BUDGET_PROGRAM);
  });

  it('avertit quand le destinataire n\'est PAS un portefeuille', async () => {
    // Une PDA — compte de jeton, compte de programme — que personne ne peut
    // signer : y envoyer du SOL, c'est le perdre.
    const ata = getAssociatedTokenAddress(USDC, account.address);
    const { adapter } = stub(handlers);
    const d = await adapter.prepareSend(account.address, { to: ata, amount: 1n });
    const w = d.warnings.find((x) => x.code === 'DESTINATION_NOT_WALLET');
    expect(w?.severity).toBe('danger');
  });

  it('refuse AVANT tout appel réseau', async () => {
    const { adapter, calls } = stub({});
    await expect(adapter.prepareSend(account.address, { to: 'nope', amount: 1n })).rejects.toMatchObject({
      code: 'INVALID_ADDRESS',
    });
    await expect(adapter.prepareSend(account.address, { to: DEST, amount: 0n })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    expect(calls).toHaveLength(0);
  });

  it('demande le blockhash en « confirmed »', async () => {
    const { adapter, calls } = stub(handlers);
    await adapter.prepareSend(account.address, { to: DEST, amount: 1n });
    expect(calls.find((c) => c.method === 'getLatestBlockhash')!.params).toEqual([{ commitment: 'confirmed' }]);
  });
});

describe('SolanaAdapterV2 — prepareSend jeton', () => {
  const token = { id: USDC, symbol: 'USDC', decimals: 6 };
  const base = {
    getLatestBlockhash: blockhashOk,
    getRecentPrioritizationFees: fees,
    getEpochInfo: () => ({ epoch: 700 }),
  };

  it('annonce la création du compte du destinataire quand il manque', async () => {
    // Le coût est réel et il surprend : il sort de notre poche.
    const { adapter } = stub({
      ...base,
      getAccountInfo: (p) =>
        (p[0] as string) === USDC ? { value: { owner: LEGACY } } : { value: null },
    });
    const d = await adapter.prepareSend(account.address, { to: DEST, amount: 1_000_000n, token });
    expect(d.warnings.map((w) => w.code)).toContain('ACTIVATES_DESTINATION');
  });

  it('n\'annonce RIEN quand le compte existe déjà', async () => {
    const { adapter } = stub({
      ...base,
      getAccountInfo: () => ({ value: { owner: LEGACY } }),
    });
    const d = await adapter.prepareSend(account.address, { to: DEST, amount: 1_000_000n, token });
    expect(d.warnings.map((w) => w.code)).not.toContain('ACTIVATES_DESTINATION');
  });

  it('remonte le montant REÇU quand le jeton prélève', async () => {
    /*
     * Sans ce champ, l'app annonce 100 et 99,5 arrivent, et l'utilisateur en
     * conclut que le portefeuille a perdu la différence.
     */
    const { adapter } = stub({
      ...base,
      getAccountInfo: (p) =>
        (p[0] as string) === USDC
          ? {
              value: {
                owner: LEGACY,
                data: {
                  parsed: {
                    info: {
                      extensions: [
                        {
                          extension: 'transferFeeConfig',
                          state: { newerTransferFee: { epoch: 0, transferFeeBasisPoints: 50, maximumFee: '99999999' } },
                        },
                      ],
                    },
                  },
                },
              },
            }
          : { value: { owner: LEGACY } },
    });
    const d = await adapter.prepareSend(account.address, { to: DEST, amount: 1_000_000n, token });
    expect(d.amount).toBe(1_000_000n);
    expect(d.amountReceived).toBe(995_000n); // 0,5 % retenus
    expect(d.warnings.map((w) => w.code)).toContain('TOKEN_TRANSFER_FEE');
  });

  it('un budget d\'unités plus large pour un jeton que pour le natif', async () => {
    const { adapter } = stub({ ...base, getAccountInfo: () => ({ value: { owner: LEGACY } }) });
    const natif = await adapter.quoteFees(account.address, { to: DEST, amount: 1n });
    const jeton = await adapter.quoteFees(account.address, { to: DEST, amount: 1n, token });
    expect(jeton.normal.cost).toBeGreaterThan(natif.normal.cost);
  });
});

describe('SolanaAdapterV2 — signature et diffusion', () => {
  const handlers = { getLatestBlockhash: blockhashOk, getRecentPrioritizationFees: fees };

  it('la signature ed25519 couvre exactement le message du brouillon', async () => {
    const { adapter } = stub(handlers);
    const d = await adapter.prepareSend(account.address, { to: DEST, amount: 1_000n });
    const s = await adapter.signSend(d, signer());

    const wire = base64.decode(s.raw);
    expect(wire[0]).toBe(1); // une signature
    const sig = wire.slice(1, 65);
    const message = wire.slice(65);
    expect(Array.from(message)).toEqual(Array.from(d.payload.message));
    expect(ed25519.verify(sig, message, account.address ? base58.decode(account.address) : new Uint8Array(32))).toBe(true);
  });

  it('refuse un signataire secp256k1', async () => {
    const { adapter } = stub(handlers);
    const d = await adapter.prepareSend(account.address, { to: DEST, amount: 1n });
    const mauvais: ChainSigner = {
      curve: 'secp256k1',
      privateKey: new Uint8Array(32).fill(1),
      publicKey: new Uint8Array(33),
    };
    await expect(adapter.signSend(d, mauvais)).rejects.toThrow(/secp256k1.*ed25519/);
  });

  it('BROADCAST_FAILED si le réseau ne rend aucune signature', async () => {
    const { adapter } = stub({ ...handlers, sendTransaction: () => '' });
    const d = await adapter.prepareSend(account.address, { to: DEST, amount: 1n });
    const s = await adapter.signSend(d, signer());
    await expect(adapter.broadcastSend(s)).rejects.toMatchObject({ code: 'BROADCAST_FAILED' });
  });
});

describe('SolanaAdapterV2 — waitForTx', () => {
  it('traduit une expiration en `expired`, pas en échec', async () => {
    /*
     * La distinction compte : expirée = les fonds n'ont PAS bougé et on peut
     * réessayer ; échouée = la transaction a été incluse et a coûté ses frais.
     */
    const { adapter } = stub({
      getSignatureStatuses: () => ({ value: [null] }),
      getBlockHeight: () => 99_999,
    });
    // La HAUTEUR de bloc, transmise par `broadcastSend` : sans elle, on sonde
    // jusqu'au délai maximal sans jamais pouvoir conclure.
    await expect(adapter.waitForTx('SIG', { opaque: 1000 })).resolves.toEqual({ status: 'expired' });
  });

  it('traduit un rejet de la chaîne en `failed`', async () => {
    const { adapter } = stub({
      getSignatureStatuses: () => ({ value: [{ err: { InstructionError: [0, 'Custom'] } }] }),
    });
    const r = await adapter.waitForTx('SIG');
    expect(r.status).toBe('failed');
  });

  it('confirme', async () => {
    const { adapter } = stub({
      getSignatureStatuses: () => ({ value: [{ err: null, confirmationStatus: 'confirmed' }] }),
    });
    await expect(adapter.waitForTx('SIG')).resolves.toEqual({ status: 'confirmed' });
  });
});
