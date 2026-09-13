/**
 * Earn engine (couche app) — soldes, positions, APY, devis et EXÉCUTION
 * des dépôts/retraits pour tous les protocoles du catalogue (`src/domain/earn`).
 *
 * Règles :
 *  - Aucun protocole codé en dur ici : tout vient d'`EARN_CATALOG`.
 *  - Un devis (`EarnQuote`) est TOUJOURS produit avant de signer : l'UI montre
 *    exactement ce qui sera envoyé (montant, sortie attendue, gas, frais).
 *  - Route `contract` = appel direct (Lido/Benqi/Aave) : 0 frais Kalyx, 0 slippage.
 *  - Route `lifi` = swap agrégé, 0 % Kalyx aussi (`isEarn`) : les frais Kalyx 0,3 %
 *    n'existent QUE sur l'écran Swap/Bridge, jamais dans Earn.
 *  - EVM : allowance vérifiée → approve exact si besoin → tx → attente 1 bloc.
 *  - Solana : signature → SIMULATION obligatoire → envoi → confirmation (poll).
 *  - Ne renvoie « succès » que si la chaîne a confirmé. Jamais de faux succès.
 */
import {
  getAdapter,
  getLifiQuote,
  NATIVE_TOKEN,
  EvmChainAdapter,
  SolanaChainAdapter,
  SwapError,
  EARN_CATALOG,
  NATIVE,
  isNative,
  estimateGasReserve,
  encodeLidoSubmit,
  encodeBenqiSubmit,
  encodeAaveSupply,
  encodeAaveWithdraw,
  encodeAaveGetReserveData,
  decodeAaveReserveData,
  fetchLlamaPoolApy,
  MAX_UINT256,
  type EarnProtocol,
  type EarnAction,
  type EarnQuote,
  type EarnPosition,
  type EarnTx,
  type RawTxRequest,
} from '../../src';
import type { Unlock } from '../walletStore';
import { useWallet } from '../walletStore';
import { submitSolanaSigned } from '../solanaSubmit';

export interface EarnAccount {
  evmAddress: string;
  solAddress?: string;
}

export type EarnStatus = 'quoting' | 'approving' | 'approvalWait' | 'sending' | 'confirming';

/** Mint « SOL natif » côté LI.FI. */
const SOL_NATIVE_MINT = '11111111111111111111111111111111';
const LIFI_SOLANA_CHAIN = 1151111081099710;

/** Rent exemption d'un compte de token SPL (165 octets) — bloqué à la création de l'ATA. */
const SOL_ATA_RENT = 2_039_280n;

function addressFor(p: EarnProtocol, acct: EarnAccount): string {
  if (p.chainId === 'solana') {
    if (!acct.solAddress) throw new Error('Ce compte n’a pas d’adresse Solana.');
    return acct.solAddress;
  }
  return acct.evmAddress;
}

function evm(p: EarnProtocol): EvmChainAdapter {
  const a = getAdapter(p.chainId);
  if (!(a instanceof EvmChainAdapter)) throw new Error(`Réseau EVM attendu : ${p.chainId}`);
  return a;
}

function sol(): SolanaChainAdapter {
  return getAdapter('solana') as SolanaChainAdapter;
}

/** Adresse token au format LI.FI (natif → 0x000… / SOL → System Program). */
function lifiToken(p: EarnProtocol, address: string): string {
  if (address !== NATIVE) return address;
  return p.chainId === 'solana' ? SOL_NATIVE_MINT : NATIVE_TOKEN;
}

function lifiChain(p: EarnProtocol): number {
  if (p.chainId === 'solana') return LIFI_SOLANA_CHAIN;
  return evm(p).config.evmChainId!;
}

// ─── Soldes ────────────────────────────────────────────────────────────

type SplCache = Map<string, Promise<{ mint: string; raw: bigint }[]>>;

/** Liste SPL d'un owner, lue UNE fois par chargement (getSplTokens = RPC + métadonnées Jupiter). */
function splTokensOf(owner: string, cache?: SplCache) {
  if (!cache) return sol().getSplTokens(owner);
  let pr = cache.get(owner);
  if (!pr) {
    pr = sol().getSplTokens(owner);
    cache.set(owner, pr);
  }
  return pr;
}

async function tokenBalance(p: EarnProtocol, tokenAddress: string, owner: string, splCache?: SplCache): Promise<bigint> {
  if (p.chainId === 'solana') {
    if (tokenAddress === NATIVE) return (await sol().getBalance(owner)).raw;
    const list = await splTokensOf(owner, splCache);
    return list.find((t) => t.mint === tokenAddress)?.raw ?? 0n;
  }
  if (tokenAddress === NATIVE) return (await evm(p).getBalance(owner)).raw;
  return evm(p).getTokenBalance(tokenAddress, owner);
}

/** Solde du sous-jacent (ce que l'on peut déposer). */
export function getUnderlyingBalance(p: EarnProtocol, acct: EarnAccount): Promise<bigint> {
  return tokenBalance(p, p.underlying.address, addressFor(p, acct));
}

/** Solde du token de reçu (= la position). */
export function getReceiptBalance(p: EarnProtocol, acct: EarnAccount): Promise<bigint> {
  return tokenBalance(p, p.receipt.address, addressFor(p, acct));
}

/** Solde natif de la chaîne du protocole (pour le gas). */
export function getGasBalance(p: EarnProtocol, acct: EarnAccount): Promise<bigint> {
  return tokenBalance(p, NATIVE, addressFor(p, acct));
}

export interface EarnBalances {
  /** protocolId → solde du sous-jacent. */
  underlying: Record<string, bigint>;
  /** protocolId → solde natif (gas). */
  gas: Record<string, bigint>;
}

/**
 * Charge soldes + positions pour TOUT le catalogue, en parallèle, tolérant
 * aux pannes (un RPC muet n'efface pas les autres). Solana : une seule
 * lecture des tokens SPL partagée entre les protocoles.
 */
export async function loadAll(acct: EarnAccount): Promise<{ balances: EarnBalances; positions: EarnPosition[] }> {
  const underlying: Record<string, bigint> = {};
  const gas: Record<string, bigint> = {};
  const positions: EarnPosition[] = [];

  // Cache par (chaîne, token, owner) pour ne pas relire le même solde N fois.
  const cache = new Map<string, Promise<bigint>>();
  const splCache: SplCache = new Map();
  const read = (p: EarnProtocol, token: string) => {
    const owner = addressFor(p, acct);
    const key = `${p.chainId}:${token}:${owner}`;
    let pr = cache.get(key);
    if (!pr) {
      pr = tokenBalance(p, token, owner, splCache).catch(() => 0n);
      cache.set(key, pr);
    }
    return pr;
  };

  await Promise.all(
    EARN_CATALOG.map(async (p) => {
      try {
        addressFor(p, acct);
      } catch {
        return; // pas d'adresse Solana sur ce compte (wallet clé privée)
      }
      const [u, g, r] = await Promise.all([read(p, p.underlying.address), read(p, NATIVE), read(p, p.receipt.address)]);
      underlying[p.id] = u;
      gas[p.id] = g;
      if (r > 0n) positions.push({ protocolId: p.id, balance: r, decimals: p.receipt.decimals });
    }),
  );
  return { balances: { underlying, gas }, positions };
}

// ─── APY ───────────────────────────────────────────────────────────────

/** APY par protocole (null = indisponible, l'UI affiche « — », jamais un chiffre inventé). */
export async function loadApys(): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  await Promise.all(
    EARN_CATALOG.map(async (p) => {
      try {
        if (p.apy.source === 'fixed') {
          out[p.id] = p.apy.value;
        } else if (p.apy.source === 'aave-v3' && p.contract) {
          // On-chain d'abord (exact, temps réel), DefiLlama en repli.
          const hex = await evm(p).callContract(p.contract, encodeAaveGetReserveData(p.underlying.address)).catch(() => null);
          const r = hex ? decodeAaveReserveData(hex) : null;
          out[p.id] = r ? r.supplyApy : await fetchLlamaPoolApy(p.apy.pool);
        } else {
          out[p.id] = await fetchLlamaPoolApy(p.apy.pool);
        }
      } catch {
        out[p.id] = null;
      }
    }),
  );
  return out;
}

// ─── MAX déposable ─────────────────────────────────────────────────────

/** L'adresse possède-t-elle déjà un compte de token (ATA) pour ce mint ? */
async function hasSolanaTokenAccount(owner: string, mint: string): Promise<boolean> {
  const res = await sol().rpc<{ value?: unknown[] }>('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  return (res?.value?.length ?? 0) > 0;
}

/**
 * Réserve de monnaie native à GARDER pour qu'un dépôt passe (unité brute) —
 * 100 % dynamique, estimée sur le RPC du réseau (`estimateGasReserve`) :
 * - Solana : frais + priorité du moment, PLUS le rent de création de l'ATA du
 *   token reçu si l'adresse n'en a pas encore (0.00204 SOL).
 * - EVM : estimation exacte de l'appel direct (estimateGas × 1,5) quand
 *   possible, sinon l'estimation générique du réseau.
 */
export async function nativeReserve(p: EarnProtocol, acct: EarnAccount, balance: bigint): Promise<bigint> {
  if (!isNative(p.underlying)) return 0n;
  const base = (await estimateGasReserve(getAdapter(p.chainId))).raw;
  if (p.chainId === 'solana') {
    if (!acct.solAddress) return base + SOL_ATA_RENT;
    const hasAta = await hasSolanaTokenAccount(acct.solAddress, p.receipt.address).catch(() => false);
    return hasAta ? base : base + SOL_ATA_RENT;
  }
  if (p.deposit.via === 'contract' && balance > 0n) {
    try {
      const tx = buildContractDeposit(p, balance / 2n, acct.evmAddress);
      const { feeWei } = await evm(p).estimateContractGas({ to: tx.to, data: tx.data, value: tx.value }, acct.evmAddress);
      if (feeWei > 0n) return (feeWei * 3n) / 2n;
    } catch {
      /* repli sur l'estimation générique */
    }
  }
  return base;
}

/** Montant max déposable : solde du sous-jacent moins la réserve native (si natif). */
export async function maxDeposit(p: EarnProtocol, acct: EarnAccount, balance: bigint): Promise<bigint> {
  if (!isNative(p.underlying) || balance <= 0n) return balance;
  const reserve = await nativeReserve(p, acct, balance);
  return balance > reserve ? balance - reserve : 0n;
}

// ─── Devis ─────────────────────────────────────────────────────────────

function buildContractDeposit(p: EarnProtocol, amount: bigint, owner: string): Extract<EarnTx, { type: 'evm' }> {
  const chainId = evm(p).config.evmChainId!;
  if (!p.contract) throw new Error(`Contrat manquant pour ${p.name}`);
  if (p.kind === 'lending') {
    return { type: 'evm', to: p.contract, data: encodeAaveSupply(p.underlying.address, amount, owner), value: 0n, chainId };
  }
  if (p.id === 'lido-steth') return { type: 'evm', to: p.contract, data: encodeLidoSubmit(), value: amount, chainId };
  if (p.id === 'benqi-savax') return { type: 'evm', to: p.contract, data: encodeBenqiSubmit(), value: amount, chainId };
  throw new Error(`Dépôt direct non implémenté pour ${p.name}`);
}

function buildContractWithdraw(p: EarnProtocol, amount: bigint, owner: string, all: boolean): Extract<EarnTx, { type: 'evm' }> {
  const chainId = evm(p).config.evmChainId!;
  if (!p.contract) throw new Error(`Contrat manquant pour ${p.name}`);
  if (p.kind === 'lending') {
    // MAX → uint256.max : Aave retire TOUT (intérêts accumulés depuis le devis inclus).
    return { type: 'evm', to: p.contract, data: encodeAaveWithdraw(p.underlying.address, all ? MAX_UINT256 : amount, owner), value: 0n, chainId };
  }
  throw new Error(`Retrait direct non implémenté pour ${p.name}`);
}

async function contractQuote(
  p: EarnProtocol,
  action: EarnAction,
  amount: bigint,
  acct: EarnAccount,
  opts: { all: boolean },
): Promise<EarnQuote> {
  const owner = acct.evmAddress;
  const tx = action === 'deposit' ? buildContractDeposit(p, amount, owner) : buildContractWithdraw(p, amount, owner, opts.all);
  const tokenIn = action === 'deposit' ? p.underlying : p.receipt;
  const tokenOut = action === 'deposit' ? p.receipt : p.underlying;

  // Approve nécessaire uniquement pour déposer un ERC-20 (Aave supply).
  const approvalAddress = action === 'deposit' && !isNative(tokenIn) ? p.contract! : null;

  // Estimation du gas : si un approve est requis et absent, estimateGas de la
  // tx principale revert → on garde 0n (l'UI affiche « estimé à la signature »).
  let gasNative = 0n;
  let gasLimit: bigint | undefined;
  try {
    const est = await evm(p).estimateContractGas({ to: tx.to, data: tx.data, value: tx.value }, owner);
    gasNative = est.feeWei;
    gasLimit = est.gasLimit;
  } catch {
    if (approvalAddress) {
      // Sans allowance, la simulation d'un supply revert : on affiche une
      // estimation forfaitaire (approve ≈ 50k + supply ≈ 250k gas) au tarif « normal ».
      try {
        const fees = await evm(p).getFeeOptions(300_000n);
        gasNative = fees.normal.costWei;
      } catch {
        /* estimé à la signature */
      }
    } else if (isNative(tokenIn) && action === 'deposit') {
      // Dépôt natif qui ne se simule pas = presque toujours « montant + gas > solde ».
      const bal = await getGasBalance(p, acct).catch(() => -1n);
      const reserve = (await estimateGasReserve(getAdapter(p.chainId))).raw;
      if (bal >= 0n && amount + reserve > bal) {
        throw new SwapError('INSUFFICIENT_GAS', 'Solde insuffisant pour couvrir le montant et les frais réseau.');
      }
    }
  }

  // Sortie attendue : Aave 1:1 ; Lido stETH ≈ 1:1 ; sAVAX = ratio d'échange (lu via eth_call submit).
  let amountOut = amount;
  if (action === 'deposit' && p.kind === 'staking') {
    try {
      // eth_call (payable simulé) de la tx de dépôt renvoie le montant reçu :
      // Lido = shares (≈ 1:1 en stETH affiché), Benqi = sAVAX (ratio < 1).
      const hex = await evm(p).callContract(tx.to, tx.data, { from: owner, value: tx.value });
      const v = BigInt(hex);
      if (v > 0n && p.id !== 'lido-steth') amountOut = v; // stETH est rebasing : l'utilisateur voit ~1:1
    } catch {
      /* 1:1 par défaut */
    }
  }

  return {
    protocolId: p.id,
    action,
    amountIn: amount,
    tokenIn,
    amountOut,
    tokenOut,
    approvalAddress,
    gasNative,
    gasUsd: 0,
    feeUsd: 0,
    routeLabel: p.kind === 'lending' ? 'Contrat Aave v3 (direct)' : `Contrat ${p.name} (direct)`,
    tx: { ...tx, gasLimit },
  };
}

async function lifiQuote(p: EarnProtocol, action: EarnAction, amount: bigint, acct: EarnAccount): Promise<EarnQuote> {
  const from = addressFor(p, acct);
  const tokenIn = action === 'deposit' ? p.underlying : p.receipt;
  const tokenOut = action === 'deposit' ? p.receipt : p.underlying;
  const chain = lifiChain(p);
  const q = await getLifiQuote({
    fromChainId: chain,
    toChainId: chain,
    fromToken: lifiToken(p, tokenIn.address),
    toToken: lifiToken(p, tokenOut.address),
    fromAmount: amount,
    fromAddress: from,
    isEarn: true, // 0 % Kalyx sur TOUT Earn (dépôt comme retrait) — les 0,3 % ne concernent que Swap/Bridge
  });
  if (!q) throw new SwapError('NO_ROUTE', `Aucune route pour ${tokenIn.symbol} → ${tokenOut.symbol}`);

  let tx: EarnTx;
  if (q.tx.type === 'solana') tx = { type: 'solana', data: q.tx.data };
  else if (q.tx.type === 'evm') tx = { type: 'evm', to: q.tx.to, data: q.tx.data, value: q.tx.value, chainId: Number(q.tx.chainId), gasLimit: q.tx.gasLimit };
  else throw new SwapError('NO_ROUTE', 'Type de transaction non supporté');

  // Approve : ERC-20 en entrée sur EVM uniquement (LI.FI renvoie une adresse même pour Solana/natif).
  const needsApproval = p.chainId !== 'solana' && !isNative(tokenIn) && !!q.approvalAddress;

  return {
    protocolId: p.id,
    action,
    amountIn: amount,
    tokenIn,
    amountOut: q.toAmount,
    tokenOut,
    approvalAddress: needsApproval ? q.approvalAddress : null,
    gasNative: q.gasCostNative,
    gasUsd: q.gasCostUsd,
    feeUsd: q.feeCostUsd,
    routeLabel: `${q.toolName} via LI.FI`,
    tx,
  };
}

/**
 * Devis pour `action` sur `p`. `all` = l'utilisateur a choisi MAX au retrait
 * (Aave : retire tout, intérêts inclus).
 */
export async function quote(
  p: EarnProtocol,
  action: EarnAction,
  amount: bigint,
  acct: EarnAccount,
  opts: { all?: boolean } = {},
): Promise<EarnQuote> {
  if (amount <= 0n) throw new Error('Montant invalide');
  const route = action === 'deposit' ? p.deposit : p.withdraw;
  if (route.via === 'none') throw new Error(route.reason);
  if (route.via === 'contract') return contractQuote(p, action, amount, acct, { all: !!opts.all });
  return lifiQuote(p, action, amount, acct);
}

// ─── Exécution ─────────────────────────────────────────────────────────

export interface EarnResult {
  hash: string;
  explorerUrl?: string;
}

async function executeSolana(q: EarnQuote, unlock: Unlock, onStatus?: (s: EarnStatus) => void): Promise<string> {
  if (q.tx.type !== 'solana') throw new Error('Transaction Solana attendue');
  const store = useWallet.getState();
  onStatus?.('sending');
  // Signature avec blockhash rafraîchi (le devis LI.FI peut dater de >60 s).
  const signed = await store.signSolanaTransaction(unlock, q.tx.data, true);
  // Simulation obligatoire → envoi → confirmation (partagé avec le swap).
  return submitSolanaSigned(signed, onStatus);
}

async function executeEvm(p: EarnProtocol, q: EarnQuote, unlock: Unlock, onStatus?: (s: EarnStatus) => void): Promise<string> {
  if (q.tx.type !== 'evm') throw new Error('Transaction EVM attendue');
  const store = useWallet.getState();
  const adapter = evm(p);
  const owner = store.accounts.find((a) => a.index === store.activeAccountIndex)?.evmAddress;
  if (!owner) throw new Error('Aucun compte');

  // 0) Gas natif : message clair AVANT de signer quoi que ce soit.
  const gasBal = await adapter.getBalance(owner).then((b) => b.raw).catch(() => -1n);
  const needNative = (q.tx.value ?? 0n) + (q.gasNative > 0n ? q.gasNative : 0n);
  if (gasBal >= 0n && gasBal < needNative) {
    throw new Error(`Solde en ${adapter.config.nativeSymbol} insuffisant pour payer les frais réseau.`);
  }

  // 1) Approve exact si l'allowance actuelle est insuffisante (jamais d'approve infini).
  if (q.approvalAddress && !isNative(q.tokenIn)) {
    const allowance = await adapter.getAllowance(q.tokenIn.address, owner, q.approvalAddress);
    if (allowance < q.amountIn) {
      onStatus?.('approving');
      const approveReq: RawTxRequest = {
        to: q.tokenIn.address,
        data: adapter.buildApproveData(q.approvalAddress, q.amountIn),
        value: 0n,
        chainId: q.tx.chainId,
      };
      const approveHash = await store.sendRawTxOn(unlock, p.chainId, approveReq);
      onStatus?.('approvalWait');
      await adapter.waitForTx(approveHash);
      // Le reçu est là, mais un nœud public peut encore servir l'ancienne allowance :
      // on attend qu'elle soit VISIBLE avant d'estimer/envoyer la tx principale.
      const seen = await adapter.waitForAllowance(q.tokenIn.address, owner, q.approvalAddress, q.amountIn);
      if (!seen) throw new Error("L'autorisation est confirmée mais pas encore visible sur le réseau. Réessaie dans quelques secondes.");
    }
  }

  // 2) Transaction principale.
  onStatus?.('sending');
  const req: RawTxRequest = {
    to: q.tx.to,
    data: q.tx.data,
    value: q.tx.value,
    chainId: q.tx.chainId,
    // Après un approve, l'estimation initiale (faite sans allowance) est fausse → on laisse le réseau ré-estimer.
    gasLimit: q.approvalAddress ? undefined : q.tx.gasLimit,
  };
  const hash = await store.sendRawTxOn(unlock, p.chainId, req);

  // 3) Confirmation (1 bloc). waitForTx lève si la tx a revert.
  onStatus?.('confirming');
  await adapter.waitForTx(hash);
  return hash;
}

/** Exécute un devis. Résout UNIQUEMENT après confirmation on-chain ; lève sinon. */
export async function execute(q: EarnQuote, unlock: Unlock, onStatus?: (s: EarnStatus) => void): Promise<EarnResult> {
  const p = EARN_CATALOG.find((x) => x.id === q.protocolId);
  if (!p) throw new Error(`Protocole inconnu : ${q.protocolId}`);
  const hash = p.chainId === 'solana' ? await executeSolana(q, unlock, onStatus) : await executeEvm(p, q, unlock, onStatus);
  return { hash, explorerUrl: getAdapter(p.chainId).config.explorerUrl };
}
