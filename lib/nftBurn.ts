/**
 * Brûler un NFT Solana indésirable et récupérer son loyer (cf. `solBurn.ts`).
 *
 * Deux temps, comme tout ce qui se signe dans Kalyx :
 *   1. `planSolBurn` lit le compte de jeton, SIMULE la transaction et chiffre
 *      ce qui revient (le loyer) et ce que ça coûte (les frais) ;
 *   2. `burnSol`, après le code, reconstruit la transaction avec un blockhash
 *      frais, vérifie que la clé dérivée est bien celle du propriétaire, signe,
 *      diffuse et attend la confirmation.
 *
 * Les refus sont des clés de traduction : `nftBurnNotFound`, `nftBurnFrozen`,
 * `nftBurnUnsupported`, `nftBurnNoSol`, `nftBurnWillFail`.
 */
import { base58, base64 } from '@scure/base';
import {
  getAdapter,
  getAdapterV2,
  withSigner,
  assertCurve,
  parseBurnTarget,
  buildBurnMessage,
  type BurnTarget,
  type SolanaChainAdapter,
} from '../src';
import { signAndSerialize } from '../src/domain/chains/solTx';
import { priorityInstructions, pickPriorityFee } from '../src/domain/chains/solPriority';
import { WalletError } from '../src/domain/errors';
import { useWallet, type Unlock } from './walletStore';

/** Unités de calcul par compte (Burn + CloseAccount), avec marge. */
const CU_PER_ACCOUNT = 25_000;
const BASE_FEE = 5_000n;

export interface SolBurnPlan {
  owner: string;
  target: BurnTarget;
  /** Loyer rendu, en lamports. */
  rentLamports: bigint;
  /** Frais estimés (base + priorité), en lamports. */
  feeLamports: bigint;
}

function solana(): SolanaChainAdapter {
  return getAdapter('solana') as SolanaChainAdapter;
}

function ownerAddress(): string {
  const w = useWallet.getState();
  const owner = w.accounts[w.activeAccountIndex]?.solAddress ?? '';
  if (!owner) throw new Error('nftBurnNotFound');
  return owner;
}

async function prefixAndFee(accounts: number): Promise<{ prefix: ReturnType<typeof priorityInstructions>; fee: bigint }> {
  const samples = await solana().rpc<unknown>('getRecentPrioritizationFees', [[]]).catch(() => null);
  const micro = pickPriorityFee(samples);
  const units = CU_PER_ACCOUNT * Math.max(1, accounts);
  return { prefix: priorityInstructions(units, micro), fee: BASE_FEE + (BigInt(units) * micro) / 1_000_000n };
}

/** Transaction non signée (signature à zéro), pour la simulation. */
function unsigned(message: Uint8Array): string {
  const bytes = new Uint8Array(1 + 64 + message.length);
  bytes[0] = 1;
  bytes.set(message, 65);
  return base64.encode(bytes);
}

export async function planSolBurn(mint: string): Promise<SolBurnPlan> {
  const owner = ownerAddress();
  const rpc = solana();
  const res = await rpc.rpc<{ value?: unknown }>('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  const target = parseBurnTarget(res?.value, owner, mint);
  if (target === 'notFound') throw new Error('nftBurnNotFound');
  if (target === 'frozen') throw new Error('nftBurnFrozen');
  if (target === 'unsupportedProgram') throw new Error('nftBurnUnsupported');

  const [{ prefix, fee }, balance] = await Promise.all([
    prefixAndFee(target.accounts.length),
    rpc.rpc<{ value?: number }>('getBalance', [owner, { commitment: 'confirmed' }]).then((b) => BigInt(b?.value ?? 0)),
  ]);
  // Les frais sont prélevés AVANT que le loyer ne revienne : il faut les avoir.
  if (balance < fee) throw new Error('nftBurnNoSol');

  const { blockhash } = (await rpc.rpc<{ value?: { blockhash?: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]))?.value ?? {};
  if (!blockhash) throw new WalletError('RPC_UNAVAILABLE', 'Blockhash Solana indisponible');
  const sim = await rpc
    .rpc<{ value?: { err?: unknown } }>('simulateTransaction', [unsigned(buildBurnMessage(owner, target, blockhash, prefix)), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true }])
    .catch(() => null);
  if (!sim || sim.value?.err) throw new Error('nftBurnWillFail');

  return { owner, target, rentLamports: target.rentLamports, feeLamports: fee };
}

export async function burnSol(plan: SolBurnPlan, unlock: Unlock): Promise<string> {
  // Le compte actif a pu changer pendant la confirmation : on brûle pour CELUI qui a été montré.
  if (ownerAddress() !== plan.owner) throw new Error('nftBurnNotFound');
  const rpc = solana();
  const [{ prefix }, latest] = await Promise.all([
    prefixAndFee(plan.target.accounts.length),
    rpc.rpc<{ value?: { blockhash?: string; lastValidBlockHeight?: number } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]),
  ]);
  const blockhash = latest?.value?.blockhash;
  if (!blockhash) throw new WalletError('RPC_UNAVAILABLE', 'Blockhash Solana indisponible');
  const message = buildBurnMessage(plan.owner, plan.target, blockhash, prefix);

  const signer = await useWallet.getState().deriveSigner(getAdapterV2('solana'), unlock);
  const raw = await withSigner(signer, async (s) => {
    assertCurve(s, 'ed25519');
    // La clé dérivée DOIT être celle du propriétaire du compte de jeton.
    if (base58.encode(s.publicKey) !== plan.owner) throw new WalletError('NOT_SUPPORTED', 'Clé Solana inattendue');
    return signAndSerialize(message, s.secretKey);
  });
  const sig = await rpc.rpc<string>('sendTransaction', [raw, { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 3 }]);
  if (!sig) throw new WalletError('BROADCAST_FAILED', 'Diffusion refusée par le réseau Solana');
  await rpc.confirmSignature(sig, latest?.value?.lastValidBlockHeight);
  return sig;
}
