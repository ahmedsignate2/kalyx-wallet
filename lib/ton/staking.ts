/**
 * Staking liquide Tonstakers : déposer des TON (reçus en tsTON), retirer en
 * brûlant des tsTON. Même chemin que les transactions de dApp : émulation —
 * ce qui sort réellement —, signature, diffusion.
 */
import { getAdapterV2, listChains, TonAdapterV2, withSigner } from '../../src';
import {
  stakeBody,
  unstakeBody,
  TONSTAKERS_STAKE_RESERVE,
  TONSTAKERS_UNSTAKE_TON,
  type UnstakeMode,
  type TonstakersPool,
} from '../../src/domain/chains/ton/tonstakers';
import type { DappDraft } from '../../src/domain/chains/v2/TonAdapterV2';
import { useWallet, type Unlock } from '../walletStore';
import { addressForChain } from '../accountAddress';

export interface StakingInfo {
  chainId: string;
  from: string;
  pool: TonstakersPool;
  poolAddress: string;
  /** Valeur d'1 tsTON en TON. */
  tsTonInTon: number | null;
  /** tsTON détenus (unités de base) et notre portefeuille tsTON. */
  tsTon: { raw: bigint; wallet: string } | null;
  tonBalance: bigint;
}

export function tonChainId(): string {
  const active = useWallet.getState().activeChain;
  const ton = listChains({ includeTestnets: true }).filter((c) => c.family === 'ton');
  return (ton.find((c) => c.id === active) ?? ton.find((c) => !c.testnet)!).id;
}

function context(chainId: string): { adapter: TonAdapterV2; from: string } {
  const a = getAdapterV2(chainId);
  if (!(a instanceof TonAdapterV2)) throw new Error('TON indisponible');
  const w = useWallet.getState();
  const chain = listChains({ includeTestnets: true }).find((c) => c.id === chainId)!;
  const from = addressForChain(w.accounts[w.activeAccountIndex], chain);
  if (!from) throw new Error('nftSendNoTon');
  return { adapter: a, from };
}

export async function loadStaking(chainId = tonChainId()): Promise<StakingInfo> {
  const { adapter, from } = context(chainId);
  const [{ pool, poolAddress, tsTonInTon }, jettons, balance] = await Promise.all([
    adapter.tonstakers(),
    adapter.jettons(from).catch(() => []),
    adapter.getBalance(from),
  ]);
  const held = jettons.find((j) => j.master === pool.tsTonMaster);
  return { chainId, from, pool, poolAddress, tsTonInTon, tsTon: held ? { raw: held.raw, wallet: held.wallet } : null, tonBalance: balance.raw };
}

/** Dépôt : `amount` TON au pool, + la réserve de traitement. Lève `stakeBelowMin` / `stakeNoFunds`. */
export async function planStake(info: StakingInfo, amount: bigint): Promise<DappDraft> {
  if (amount < info.pool.minStake) throw new Error('stakeBelowMin');
  if (info.tonBalance < amount + TONSTAKERS_STAKE_RESERVE) throw new Error('stakeNoFunds');
  const { adapter } = context(info.chainId);
  return adapter.prepareDappTransfer(info.from, {
    messages: [{ to: info.poolAddress, amount: amount + TONSTAKERS_STAKE_RESERVE, bounce: true, payload: stakeBody() }],
    validUntil: null,
  });
}

/** Retrait : brûler `amount` tsTON depuis notre portefeuille tsTON. Lève `unstakeNoTsTon` / `stakeNoFunds`. */
export async function planUnstake(info: StakingInfo, amount: bigint, mode: UnstakeMode): Promise<DappDraft> {
  if (!info.tsTon || info.tsTon.raw < amount || amount <= 0n) throw new Error('unstakeNoTsTon');
  if (info.tonBalance < TONSTAKERS_UNSTAKE_TON) throw new Error('stakeNoFunds');
  const { adapter } = context(info.chainId);
  return adapter.prepareDappTransfer(info.from, {
    messages: [{ to: info.tsTon.wallet, amount: TONSTAKERS_UNSTAKE_TON, bounce: true, payload: unstakeBody({ amount, owner: info.from, mode }) }],
    validUntil: null,
  });
}

export async function sendStaking(chainId: string, draft: DappDraft, unlock: Unlock): Promise<string> {
  const { adapter } = context(chainId);
  const signer = await useWallet.getState().deriveSigner(adapter, unlock);
  const signed = await withSigner(signer, (s) => adapter.signDappTransfer(draft, s));
  await adapter.broadcastDapp(signed);
  return signed.txid;
}
