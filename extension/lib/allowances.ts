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
import type { Holding } from '../../lib/portfolio/holdings';

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
  /** Valeur que le contrat peut prendre AUJOURD'HUI : min(autorisation, solde) × prix ; null si le prix est inconnu. */
  exposed: number | null;
  /** Solde nul de ce token : l'autorisation ne touche rien aujourd'hui. */
  dormant: boolean;
  /** Âge de l'autorisation en jours (GoPlus), si connu. */
  ageDays: number | null;
  openSource?: boolean;
  level: AllowanceLevel;
  reasons: AllowanceReason[];
}

export type AllowanceLevel = 'high' | 'medium' | 'low';
export type AllowanceReason = 'risky' | 'unlimited' | 'unknown' | 'old' | 'dormant';

/** Au-delà, une autorisation a sans doute servi et n'est plus utile. */
const OLD_DAYS = 180;

/**
 * Pur : à quel point une autorisation mérite d'être révoquée, et pourquoi.
 * Un contrat signalé : toujours « à révoquer ». Sinon tout dépend de ce qui
 * est réellement exposé : une autorisation illimitée sur un solde réel, vers
 * un contrat anonyme ou ancien, est « à révoquer » ; la même sur un solde nul
 * reste « raisonnable » (elle ne prend rien aujourd'hui, on le dit).
 */
export function assessAllowance(a: { risky: boolean; unlimited: boolean; dormant: boolean; ageDays: number | null; spenderName?: string; openSource?: boolean; trusted?: boolean }): { level: AllowanceLevel; reasons: AllowanceReason[] } {
  const reasons: AllowanceReason[] = [];
  if (a.risky) reasons.push('risky');
  if (a.unlimited) reasons.push('unlimited');
  const unknown = !a.trusted && !a.spenderName && a.openSource !== true;
  if (unknown) reasons.push('unknown');
  const old = a.ageDays != null && a.ageDays > OLD_DAYS;
  if (old) reasons.push('old');
  if (a.dormant) reasons.push('dormant');
  if (a.risky) return { level: 'high', reasons };
  if (a.dormant) return { level: 'low', reasons };
  if (a.unlimited && (unknown || old)) return { level: 'high', reasons };
  if (a.unlimited || unknown || old) return { level: 'medium', reasons };
  return { level: 'low', reasons };
}

const EVM = /^0x[0-9a-fA-F]{40}$/;

export function makeAllowances(deps: { home: Pick<Home, 'current'>; execute: Omit<ExecuteDeps, 'tokenMeta'>; holdings?: (acct: NonNullable<Awaited<ReturnType<Home['current']>>>['acct']) => Promise<Holding[]>; fiat?: () => Promise<string>; now?: () => number }) {
  const now = deps.now ?? (() => Date.now());
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

  async function list(chainId: unknown): Promise<{ items: AllowanceView[]; incomplete: boolean; unavailable: boolean; exposedTotal: number | null; fiat: string }> {
    const chain = chainOf(chainId);
    const { cur, evm } = await owner();
    const adapter = getAdapter(chain.id);
    if (!(adapter instanceof EvmChainAdapter)) throw new RpcError(-32602, 'BAD_REQUEST');
    const [tokens, candidates, held] = await Promise.all([
      getErc20Tokens(chain, evm).catch(() => []),
      fetchApprovalCandidates(chain.evmChainId!, evm),
      deps.holdings ? deps.holdings(cur.acct).catch(() => [] as Holding[]) : Promise.resolve([] as Holding[]),
    ]);
    const report = await adapter.getApprovalsReport(evm, tokens, candidates);
    // Soldes : ceux lus à l'instant (Alchemy), sinon ceux du portefeuille ; prix : seulement ceux des tokens vérifiés.
    const balance = new Map(tokens.map((t) => [t.contract.toLowerCase(), t.raw]));
    const price = new Map<string, number>();
    for (const h of held) {
      if (h.chainId !== chain.id || !h.contract) continue;
      const k = h.contract.toLowerCase();
      if (!balance.has(k)) balance.set(k, h.raw);
      if (h.verified && h.price > 0) price.set(k, h.price);
    }
    const order: Record<AllowanceLevel, number> = { high: 0, medium: 1, low: 2 };
    const items = report.items
      .map((x: ApprovalItem): AllowanceView => {
        const k = x.token.toLowerCase();
        const bal = balance.get(k);
        const unlimited = isUnlimited(x.allowance);
        const reach = bal == null ? null : x.allowance < bal ? x.allowance : bal;
        const p = price.get(k);
        const exposed = reach == null || p == null ? null : (Number(reach) / 10 ** x.decimals) * p;
        const dormant = bal === 0n;
        const ageDays = x.approvedAt ? Math.max(0, Math.floor((now() / 1000 - x.approvedAt) / 86_400)) : null;
        const { level, reasons } = assessAllowance({ risky: !!x.risky, unlimited, dormant, ageDays, spenderName: x.spenderName, openSource: x.openSource, trusted: x.trusted });
        return {
          token: x.token,
          symbol: x.symbol,
          logo: x.logo && /^https:\/\//i.test(x.logo) ? x.logo : undefined,
          spender: x.spender,
          spenderName: x.spenderName,
          amount: unlimited ? '∞' : formatTokenAmount(x.allowance, x.decimals),
          unlimited,
          risky: !!x.risky,
          exposed: exposed != null && Number.isFinite(exposed) ? exposed : null,
          dormant,
          ageDays,
          ...(x.openSource !== undefined ? { openSource: x.openSource } : {}),
          level,
          reasons,
        };
      })
      .sort((a, b) => order[a.level] - order[b.level] || (b.exposed ?? -1) - (a.exposed ?? -1));
    // Ce qui est réellement exposé, au total (null si un seul montant non nul est sans prix : on ne sous-estime pas).
    const unknownValue = items.some((x) => x.exposed == null && !x.dormant);
    const exposedTotal = unknownValue ? null : items.reduce((s, x) => s + (x.exposed ?? 0), 0);
    return { items, incomplete: report.incomplete, unavailable: candidates === null, exposedTotal, fiat: deps.fiat ? await deps.fiat().catch(() => 'usd') : 'usd' };
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
