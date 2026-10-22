/**
 * AUTORISATIONS DE TOKENS (ERC-20) du compte actif : les voir, les révoquer.
 *
 * Une autorisation permet à un contrat de dépenser un token à ta place, sans
 * nouvelle signature : c'est ce que vident les sites malveillants. La liste
 * vient de GoPlus (annonces), CHAQUE montant est relu sur la chaîne avant
 * d'être montré (une autorisation déjà révoquée n'apparaît pas), et les
 * contrats signalés passent en tête.
 *
 * Révoquer = une transaction `approve(contrat, 0)` sur le token, signée par le
 * même moteur que les sites (clé du coffre, ou téléphone en mode compagnon).
 * Elle ne fait que RÉDUIRE un droit : aucun fonds ne bouge.
 */
import { EvmChainAdapter } from '../../src/domain/chains/EvmChainAdapter';
import { fetchApprovalCandidates } from '../../src/domain/security/goplus';
import { getErc20Tokens } from '../../src/domain/tokens/alchemyTokens';
import { isUnlimited, revokeCalldata, type ApprovalItem } from '../../src/domain/approvals/approvals';
import { formatTokenAmount } from '../../src/domain/validation/format';
import { getAdapter, listChains } from './chainRegistry';
import { execute, type ExecuteDeps } from './dappSign';
import { RpcError } from './rpcError';
import type { Home } from './home';

/** Réseaux couverts (GoPlus les connaît, ce sont ceux où les autorisations s'accumulent). */
export const ALLOWANCE_CHAINS = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche'];

export interface AllowanceView {
  token: string;
  symbol: string;
  logo?: string;
  spender: string;
  spenderName?: string;
  /** « ∞ » pour une autorisation illimitée, sinon le montant lisible. */
  amount: string;
  unlimited: boolean;
  risky: boolean;
}

const EVM = /^0x[0-9a-fA-F]{40}$/;

export function makeAllowances(deps: { home: Pick<Home, 'current'>; execute: Omit<ExecuteDeps, 'tokenMeta'> }) {
  const chainOf = (id: unknown) => {
    const c = listChains({ includeTestnets: false }).find((x) => x.id === id && x.family === 'evm' && ALLOWANCE_CHAINS.includes(x.id));
    if (!c?.evmChainId) throw new RpcError(-32602, 'BAD_REQUEST');
    return c;
  };

  async function owner() {
    const cur = await deps.home.current();
    const evm = cur?.acct.evm;
    if (!cur || !evm) throw new RpcError(4100, 'NO_ACCOUNT');
    return { cur, evm };
  }

  async function list(chainId: unknown): Promise<{ items: AllowanceView[]; incomplete: boolean; unavailable: boolean }> {
    const chain = chainOf(chainId);
    const { evm } = await owner();
    const adapter = getAdapter(chain.id);
    if (!(adapter instanceof EvmChainAdapter)) throw new RpcError(-32602, 'BAD_REQUEST');
    const [tokens, candidates] = await Promise.all([getErc20Tokens(chain, evm).catch(() => []), fetchApprovalCandidates(chain.evmChainId!, evm)]);
    const report = await adapter.getApprovalsReport(evm, tokens, candidates);
    const rank = (x: ApprovalItem) => (x.risky ? 0 : isUnlimited(x.allowance) ? 1 : 2);
    const items = [...report.items]
      .sort((a, b) => rank(a) - rank(b))
      .map((x) => ({
        token: x.token,
        symbol: x.symbol,
        logo: x.logo && /^https:\/\//i.test(x.logo) ? x.logo : undefined,
        spender: x.spender,
        spenderName: x.spenderName,
        amount: isUnlimited(x.allowance) ? '∞' : formatTokenAmount(x.allowance, x.decimals),
        unlimited: isUnlimited(x.allowance),
        risky: !!x.risky,
      }));
    return { items, incomplete: report.incomplete, unavailable: candidates === null };
  }

  /** `approve(spender, 0)` sur le token, depuis le compte actif ; rend le hachage de la transaction. */
  async function revoke(chainId: unknown, token: unknown, spender: unknown): Promise<string> {
    const chain = chainOf(chainId);
    if (typeof token !== 'string' || !EVM.test(token) || typeof spender !== 'string' || !EVM.test(spender)) throw new RpcError(-32602, 'BAD_REQUEST');
    const { cur, evm } = await owner();
    const req = { kind: 'evmTx' as const, from: evm, chainId: `0x${chain.evmChainId!.toString(16)}`, tx: { to: token, data: revokeCalldata(spender), value: '0x0' } };
    return (await execute(req, { walletId: cur.wallet.id, index: cur.index }, {}, deps.execute)) as string;
  }

  return { list, revoke };
}

export type Allowances = ReturnType<typeof makeAllowances>;
