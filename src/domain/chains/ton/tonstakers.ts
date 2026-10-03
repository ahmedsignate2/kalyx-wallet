/**
 * Tonstakers — staking liquide de TON : on dépose des TON, on reçoit des tsTON
 * dont la valeur en TON croît avec les récompenses ; on les « brûle » pour
 * retirer.
 *
 * Tout vient du SDK officiel (`tonstakers-sdk`, `constants.ts` / `tonstakers.ts`),
 * et les corps sont vérifiés contre des dépôts et retraits RÉELS
 * (`tonstakers-vectors.json`) :
 *  - dépôt : au POOL, `stake#47d54391 query_id:uint64 partner:uint64`, avec
 *    montant + 1 TON de réserve pour le traitement ;
 *  - retrait : à NOTRE portefeuille tsTON, `burn#595f07bc query_id:uint64
 *    amount:Coins response:MsgAddress (Maybe ^[wait_till_round_end:1 fill_or_kill:1])`,
 *    avec 1,05 TON joints.
 */
import { Buffer } from 'buffer';
import { Address, beginCell, type Cell } from '@ton/core';
import { parseRawTonAddress, parseTonAddress } from './tonAddress';

export const TONSTAKERS_POOL = { mainnet: 'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR', testnet: 'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3' } as const;
export const TONSTAKERS_STAKE_OP = 0x47d54391;
export const TONSTAKERS_UNSTAKE_OP = 0x595f07bc;
/** Réserve jointe au dépôt, pour le traitement par le pool (SDK : STAKE_FEE_RES). */
export const TONSTAKERS_STAKE_RESERVE = 1_000_000_000n;
/** TON joints au retrait (SDK : UNSTAKE_FEE_RES). */
export const TONSTAKERS_UNSTAKE_TON = 1_050_000_000n;
/** Code partenaire : 0 = aucun (le SDK met le sien par défaut). */
export const TONSTAKERS_PARTNER = 0n;

/**
 * Mode de retrait :
 *  - `standard` : immédiat si le pool a la liquidité, sinon ticket (NFT) payé en fin de cycle ;
 *  - `instant`  : immédiat ou rien (fill_or_kill) ;
 *  - `bestRate` : attendre la fin du cycle, au taux de fin de cycle (wait_till_round_end).
 */
export type UnstakeMode = 'standard' | 'instant' | 'bestRate';

export function stakeBody(queryId = 1n, partner = TONSTAKERS_PARTNER): Cell {
  return beginCell().storeUint(TONSTAKERS_STAKE_OP, 32).storeUint(queryId, 64).storeUint(partner, 64).endCell();
}

function addr(a: string): Address {
  const f = parseTonAddress(a) ?? parseRawTonAddress(a.toLowerCase());
  if (!f) throw new Error('Adresse TON invalide');
  return new Address(f.workchain, Buffer.from(f.hash));
}

export function unstakeBody(p: { amount: bigint; owner: string; mode: UnstakeMode; queryId?: bigint }): Cell {
  if (p.amount <= 0n) throw new Error('Montant de tsTON invalide');
  return beginCell()
    .storeUint(TONSTAKERS_UNSTAKE_OP, 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeCoins(p.amount)
    .storeAddress(addr(p.owner))
    .storeMaybeRef(beginCell().storeUint(p.mode === 'bestRate' ? 1 : 0, 1).storeUint(p.mode === 'instant' ? 1 : 0, 1).endCell())
    .endCell();
}

export interface TonstakersPool {
  apy: number;
  /** Dépôt minimum, en nanotons. */
  minStake: bigint;
  /** Contrat maître du tsTON, adresse brute. */
  tsTonMaster: string;
  stakers: number;
  /** Fin du cycle en cours, en secondes. */
  cycleEnd: number;
}

/** Réponse `/v2/staking/pool/{pool}` (forme relevée le 27/09). */
export function parseStakingPool(json: unknown): TonstakersPool | null {
  const p = (json as { pool?: any } | null)?.pool;
  if (!p || typeof p.liquid_jetton_master !== 'string') return null;
  const apy = Number(p.apy);
  return {
    apy: Number.isFinite(apy) ? apy : 0,
    minStake: /^\d+$/.test(String(p.min_stake ?? '')) ? BigInt(String(p.min_stake)) : 1_000_000_000n,
    tsTonMaster: p.liquid_jetton_master.toLowerCase(),
    stakers: Number(p.current_nominators) || 0,
    cycleEnd: Number(p.cycle_end) || 0,
  };
}
