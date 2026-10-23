/**
 * ENVOYER — EVM et Solana, pièce native et tokens.
 *
 * Le pipeline est celui de l'app (adaptateurs v2 du cœur) : préparer →
 * vérifier → signer → diffuser → suivre. Ce module y ajoute les verrous de
 * l'extension, dans cet ordre :
 *
 *  1. destinataire : ENS résolu (EVM), adresse validée par l'adaptateur ;
 *  2. LISTE BLANCHE, à la préparation ET juste avant la signature ;
 *  3. anti-empoisonnement : sosie d'une adresse déjà payée, d'une adresse de
 *     la liste ou d'un de ses comptes → danger, à accepter explicitement ;
 *  4. frais : palier Lent / Normal / Rapide, ou manuel (EVM) borné ;
 *  5. signature : clé tirée du coffre au dernier moment, vérifiée contre
 *     l'adresse affichée, effacée aussitôt après (`withSigner`).
 *
 * Le brouillon vit en mémoire du service worker, deux minutes au plus : un
 * brouillon perdu (service worker redémarré) se refait, il ne se devine pas.
 */
import { bytesToHex } from '@noble/hashes/utils';
import { EvmAdapterV2 } from '../../src/domain/chains/v2/EvmAdapterV2';
import { SolanaAdapterV2 } from '../../src/domain/chains/v2/SolanaAdapterV2';
import { withSigner } from '../../src/domain/chains/v2/signer';
import { signerFor } from './signer';
import { checkSolSignature, checkTxHash, evmChainFor, evmTxParam, SOLANA_CAIP, unsignedSolanaTx } from './companionCore';
import type { Companion } from './companion';
import type { EvmPayload } from '../../src/domain/chains/v2/EvmAdapterV2';
import type { SolanaPayload } from '../../src/domain/chains/v2/SolanaAdapterV2';
import type { ChainAdapterV2, FeeQuotes, SendDraft, SendSpeed, TokenRef, TxState } from '../../src/domain/chains/v2/types';
import { getAdapter, listChains } from '../../src/domain/chains/registry';
import type { ChainConfig } from '../../src/domain/chains/types';
import { looksLikeEnsName, resolveEnsName } from '../../src/domain/ens/ens';
import { detectPoisoning } from '../../src/domain/validation/poisoning';
import { parseAmount } from '../../src/domain/validation/amount';
import { formatTokenAmount } from '../../src/domain/validation/format';
import { WalletError } from '../../src/domain/errors';
import { addressKey, type Whitelist } from './whitelist';
import { chainLogo, type Acct, type Portfolio } from './portfolio';
import type { Home } from './home';
import type { Session } from './session';
import type { Wallets } from './wallets';

const DRAFT_TTL_MS = 120_000;
const GWEI = 1_000_000_000n;
/** Garde-fou du mode manuel : au plus 5 × le palier Rapide (une virgule mal placée coûte cher). */
const MANUAL_MAX_FACTOR = 5n;
/** Réseaux dont la pièce native est proposée même sans solde lu (le réseau peut être muet). */
const MAIN_NATIVES = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche', 'solana'];

export interface AssetView {
  key: string;
  chainId: string;
  chainName: string;
  chainLogo?: string;
  family: 'evm' | 'solana';
  symbol: string;
  name: string;
  decimals: number;
  contract?: string;
  logo?: string;
  /** Solde brut (texte) ; null = inconnu (réseau muet). */
  balance: string | null;
  balanceFmt: string | null;
  price: number;
}

export interface QuoteView {
  speeds: Record<SendSpeed, { cost: string; costFmt: string }>;
  nativeSymbol: string;
  /** EVM : valeurs du palier Normal, pour préremplir le mode manuel. */
  manual?: { maxFeeGwei: string; priorityGwei: string };
}

export interface ManualFee {
  maxFeeGwei: string;
  priorityGwei: string;
}

export interface PrepareInput {
  assetKey: string;
  to: string;
  amount: string;
  max?: boolean;
  speed?: SendSpeed;
  manual?: ManualFee;
}

export interface DraftView {
  id: string;
  chainId: string;
  chainName: string;
  from: string;
  to: string;
  /** Nom ENS saisi, résolu en `to`. */
  ens?: string;
  amount: string;
  amountFmt: string;
  symbol: string;
  fee: string;
  feeFmt: string;
  nativeSymbol: string;
  /** Destinataire jamais payé depuis ce compte ni présent dans la liste blanche. */
  newRecipient: boolean;
  /** Sosie d'une adresse connue : danger, à accepter explicitement. */
  poisoning?: { similarTo: string };
  warnings: string[];
  expiresAt: number;
  /** Mode compagnon : la confirmation se fait sur le téléphone. */
  onPhone?: boolean;
}

interface Held {
  draft: SendDraft;
  adapter: ChainAdapterV2;
  walletId: string;
  index: number;
  risky: boolean;
  until: number;
  /** « 0.1 ETH » : ce qui part, pour la notification d'issue. */
  what: string;
  /** Valeur de ce qui part, dans la devise affichée (plafond journalier) ; null si le prix est inconnu. */
  fiat: number | null;
}

/** Montant brut × prix, dans la devise affichée ; null sans prix. */
export const fiatOf = (raw: bigint, decimals: number, price: number): number | null => (price > 0 ? (Number(raw) / 10 ** decimals) * price : null);

export interface SendDeps {
  session: Session;
  wallets: Wallets;
  home: Home;
  portfolio: Portfolio;
  whitelist: Whitelist;
  now?: () => number;
  /** Injectables (tests) : adaptateur v2 d'un réseau, résolution ENS. */
  adapterFor?: (chain: ChainConfig) => ChainAdapterV2;
  resolveEns?: (name: string) => Promise<string | null>;
  /** Mode compagnon : le téléphone signe et diffuse à la place du coffre. */
  companion?: Companion;
  /** Transaction diffusée : suivie jusqu'à son issue (notification), même popup fermé. */
  onSent?: (w: { txid: string; chainId: string; chainName: string; what: string; explorer?: string; opaque?: unknown; expiresAt?: number }) => void;
}

const familyOf = (c: ChainConfig): 'evm' | 'solana' => {
  if (c.family === 'evm' || c.family === 'solana') return c.family;
  throw new WalletError('NOT_SUPPORTED', `Réseau non servi par l'extension : ${c.name}`);
};

const defaultAdapter = (c: ChainConfig): ChainAdapterV2 => (familyOf(c) === 'evm' ? new EvmAdapterV2(c) : new SolanaAdapterV2(c));

const toGwei = (wei: bigint) => formatTokenAmount(wei, 9).replace(/\s/g, '');
function fromGwei(s: string): bigint {
  try {
    return parseAmount(s, 9).raw;
  } catch {
    throw new WalletError('INVALID_AMOUNT', 'Frais manuels invalides');
  }
}

export function makeSend(deps: SendDeps) {
  const now = deps.now ?? Date.now;
  const adapterFor = deps.adapterFor ?? defaultAdapter;
  const resolveEns = deps.resolveEns ?? ((n: string) => resolveEnsName(n));
  const adapters = new Map<string, ChainAdapterV2>();
  const adapter = (c: ChainConfig) => {
    let a = adapters.get(c.id);
    if (!a) adapters.set(c.id, (a = adapterFor(c)));
    return a;
  };
  const drafts = new Map<string, Held>();
  const sent = new Map<string, { chainId: string; opaque?: unknown; expiresAt?: number }>();

  async function account() {
    const cur = await deps.home.current();
    if (!cur) throw new WalletError('WRONG_ACCOUNT', 'Aucun compte');
    return cur;
  }

  const fromOf = (acct: Acct, family: 'evm' | 'solana') => {
    const from = family === 'evm' ? acct.evm : acct.solana;
    // Clé importée d'une seule famille : l'autre n'a pas d'adresse.
    if (!from) throw new WalletError('NOT_SUPPORTED', `WRONG_FAMILY:${family}`);
    return from;
  };

  /** Actifs envoyables : ceux lus et vérifiés, plus les natifs des réseaux principaux. */
  async function assets(): Promise<AssetView[]> {
    const { acct } = await account();
    const fiat = await deps.home.fiat();
    const held = (await deps.portfolio.holdings(acct, fiat)).filter((h) => h.verified && h.raw > 0n);
    const out = new Map<string, AssetView>();
    for (const h of held) {
      let c: ChainConfig;
      try {
        c = getAdapter(h.chainId).config;
      } catch {
        continue;
      }
      if (c.family !== 'evm' && c.family !== 'solana') continue;
      if ((c.family === 'evm' && !acct.evm) || (c.family === 'solana' && !acct.solana)) continue;
      const key = `${c.id}:${h.kind === 'native' || !h.contract ? 'native' : h.contract}`;
      out.set(key, {
        key,
        chainId: c.id,
        chainName: c.name,
        chainLogo: chainLogo(c.id),
        family: c.family,
        symbol: h.symbol,
        name: h.name,
        decimals: h.decimals,
        contract: h.kind === 'native' ? undefined : h.contract,
        logo: h.logo && /^https:\/\//i.test(h.logo) ? h.logo : undefined,
        balance: h.raw.toString(),
        balanceFmt: formatTokenAmount(h.raw, h.decimals),
        price: h.price,
      });
    }
    for (const id of MAIN_NATIVES) {
      const key = `${id}:native`;
      if (out.has(key)) continue;
      const c = listChains({ includeTestnets: false }).find((x) => x.id === id);
      if (!c || (c.family === 'evm' && !acct.evm) || (c.family === 'solana' && !acct.solana)) continue;
      out.set(key, { key, chainId: id, chainName: c.name, chainLogo: chainLogo(id), family: c.family as 'evm' | 'solana', symbol: c.nativeSymbol, name: c.nativeSymbol, decimals: c.nativeDecimals, balance: null, balanceFmt: null, price: 0 });
    }
    return [...out.values()];
  }

  async function assetOf(key: string): Promise<{ asset: AssetView; chain: ChainConfig; token: TokenRef | null }> {
    const asset = (await assets()).find((a) => a.key === key);
    if (!asset) throw new WalletError('INVALID_AMOUNT', 'Actif inconnu');
    const chain = getAdapter(asset.chainId).config;
    return { asset, chain, token: asset.contract ? { id: asset.contract, symbol: asset.symbol, decimals: asset.decimals } : null };
  }

  async function quote(assetKey: string, to?: string): Promise<QuoteView> {
    const { acct } = await account();
    const { chain, token } = await assetOf(assetKey);
    const a = adapter(chain);
    const from = fromOf(acct, familyOf(chain));
    if (!a.quoteFees) throw new WalletError('NOT_SUPPORTED', 'Frais non disponibles');
    const target = to && a.validateAddress(to) ? to : from;
    const q: FeeQuotes = await a.quoteFees(from, { to: target, amount: 1n, token });
    const view = (s: SendSpeed) => ({ cost: q[s].cost.toString(), costFmt: formatTokenAmount(q[s].cost, chain.nativeDecimals) });
    const normal = q.normal.opaque as { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } | undefined;
    return {
      speeds: { slow: view('slow'), normal: view('normal'), fast: view('fast') },
      nativeSymbol: chain.nativeSymbol,
      manual: chain.family === 'evm' && normal?.maxFeePerGas != null ? { maxFeeGwei: toGwei(normal.maxFeePerGas), priorityGwei: toGwei(normal.maxPriorityFeePerGas ?? 0n) } : undefined,
    };
  }

  /** Frais manuels EVM appliqués au brouillon : bornés, priorité ≤ maximum, solde revérifié. */
  async function applyManual(a: ChainAdapterV2, d: SendDraft, m: ManualFee, from: string): Promise<SendDraft> {
    const p = d.payload as { gasLimit: bigint; value: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint };
    const maxFee = fromGwei(m.maxFeeGwei);
    const prio = fromGwei(m.priorityGwei);
    if (maxFee <= 0n || prio < 0n || prio > maxFee) throw new WalletError('INVALID_AMOUNT', 'MANUAL_FEE_INVALID');
    const q = a.quoteFees ? await a.quoteFees(from, { to: d.to, amount: d.amount, token: d.token }) : null;
    const fast = (q?.fast.opaque as { maxFeePerGas?: bigint } | undefined)?.maxFeePerGas;
    if (fast && maxFee > fast * MANUAL_MAX_FACTOR) throw new WalletError('INVALID_AMOUNT', 'MANUAL_FEE_TOO_HIGH');
    const payload = p.gasPrice != null ? { ...p, gasPrice: maxFee } : { ...p, maxFeePerGas: maxFee, maxPriorityFeePerGas: prio };
    const fee = maxFee * p.gasLimit;
    const balance = await a.getBalance(from).then((b) => b.raw).catch(() => null);
    if (balance != null && balance < p.value + fee) {
      throw new WalletError(d.token ? 'INSUFFICIENT_GAS' : 'INSUFFICIENT_FUNDS', 'Solde insuffisant (frais inclus)');
    }
    return { ...d, payload, fee };
  }

  async function prepare(input: PrepareInput): Promise<DraftView> {
    const cur = await account();
    const { asset, chain, token } = await assetOf(input.assetKey);
    const family = familyOf(chain);
    const a = adapter(chain);
    const from = fromOf(cur.acct, family);

    // 1. Destinataire.
    let to = input.to.trim();
    let ens: string | undefined;
    if (family === 'evm' && looksLikeEnsName(to)) {
      const resolved = await resolveEns(to.toLowerCase()).catch(() => null);
      if (!resolved) throw new WalletError('INVALID_ADDRESS', 'ENS_NOT_FOUND');
      ens = to;
      to = resolved;
    }
    if (!a.validateAddress(to)) throw new WalletError('INVALID_ADDRESS', 'Adresse invalide pour ce réseau');

    // 2. Liste blanche.
    await deps.whitelist.assertAllowed(to);

    // 3. Montant (« Max » : solde moins les frais du palier, pour la pièce native).
    const speed = input.speed ?? 'normal';
    let amount: bigint;
    if (input.max) {
      if (asset.balance == null) throw new WalletError('INVALID_AMOUNT', 'Solde inconnu');
      amount = BigInt(asset.balance);
      if (!token) {
        const q = a.quoteFees ? await a.quoteFees(from, { to, amount: 1n, token: null }) : null;
        amount -= q ? q[speed].cost : 0n;
      }
      if (amount <= 0n) throw new WalletError('INSUFFICIENT_FUNDS', 'Solde insuffisant pour les frais');
    } else {
      amount = parseAmount(input.amount, asset.decimals).raw;
    }

    // 4. Brouillon (refus de l'adaptateur : solde, décimales, frais).
    let draft = await a.prepareSend(from, { to, amount, token, speed });
    if (input.manual && family === 'evm') draft = await applyManual(a, draft, input.manual, from);
    if (draft.warnings.some((w) => w.code === 'MEMO_REQUIRED')) throw new WalletError('MEMO_REQUIRED', 'Commentaire exigé');

    // 5. Anti-empoisonnement : sosie d'une adresse payée, de la liste, ou d'un compte à soi.
    const fiat = await deps.home.fiat();
    const own = [cur.acct.evm, cur.acct.solana].filter((x): x is string => !!x);
    const known = [...(await deps.portfolio.paidAddresses(cur.acct, fiat)), ...(await deps.whitelist.known()), ...own];
    const knownKeys = new Set(known.map(addressKey));
    const match = knownKeys.has(addressKey(to)) ? null : detectPoisoning(to, known);

    const id = bytesToHex(crypto.getRandomValues(new Uint8Array(12)));
    const until = now() + DRAFT_TTL_MS;
    drafts.set(id, { draft, adapter: a, walletId: cur.wallet.id, index: cur.index, risky: !!match, until, what: `${formatTokenAmount(draft.amount, asset.decimals)} ${asset.symbol}`, fiat: fiatOf(draft.amount, asset.decimals, asset.price) });
    for (const [k, v] of drafts) if (v.until < now()) drafts.delete(k);

    return {
      id,
      chainId: chain.id,
      chainName: chain.name,
      from,
      to: draft.to,
      ens,
      amount: draft.amount.toString(),
      amountFmt: formatTokenAmount(draft.amount, asset.decimals),
      symbol: asset.symbol,
      fee: draft.fee.toString(),
      feeFmt: formatTokenAmount(draft.fee, chain.nativeDecimals),
      nativeSymbol: chain.nativeSymbol,
      newRecipient: !knownKeys.has(addressKey(to)),
      poisoning: match ? { similarTo: match.lookalike } : undefined,
      warnings: draft.warnings.map((w) => w.code),
      expiresAt: Math.min(until, draft.expiresAt ?? Infinity),
      onPhone: cur.wallet.kind === 'companion' || undefined,
    };
  }

  async function confirm(id: string, acceptRisk = false): Promise<{ txid: string; explorer?: string }> {
    const held = drafts.get(id);
    drafts.delete(id); // un brouillon ne sert qu'une fois, même en cas d'échec
    if (!held || held.until < now() || (held.draft.expiresAt && held.draft.expiresAt < now())) throw new WalletError('REQUEST_EXPIRED', 'Brouillon expiré');
    if (held.risky && !acceptRisk) throw new WalletError('INVALID_ADDRESS', 'RISK_NOT_ACCEPTED');
    const cur = await account();
    // Le compte affiché a pu changer entre-temps : on ne signe que pour celui du brouillon.
    if (cur.wallet.id !== held.walletId || cur.index !== held.index) throw new WalletError('WRONG_ACCOUNT', 'Compte changé');
    // Dernier verrou : la liste blanche a pu changer depuis la préparation.
    await deps.whitelist.assertAllowed(held.draft.to);

    const chain = held.adapter.config;
    /*
     * Compte du TÉLÉPHONE (mode compagnon) : le brouillon préparé et contrôlé
     * ici (destinataire, liste blanche, anti-empoisonnement) part tel quel au
     * téléphone, qui le montre et le fait valider, puis le diffuse.
     */
    const meta = (await deps.wallets.list()).find((w) => w.id === held.walletId);
    if (meta?.kind === 'companion') {
      if (!deps.companion) throw new WalletError('NOT_SUPPORTED', 'COMPANION_UNAVAILABLE');
      let txid: string;
      let opaque: number | undefined;
      if (familyOf(chain) === 'evm') {
        const p = held.draft.payload as EvmPayload;
        const id = evmChainFor(meta.evmChains ?? [], p.chainId);
        const tx = evmTxParam({ from: held.draft.from, to: p.to, data: p.data, value: p.value, gas: p.gasLimit });
        txid = checkTxHash(await deps.companion.request(meta, `eip155:${id}`, 'eth_sendTransaction', [tx]));
      } else {
        const p = held.draft.payload as SolanaPayload;
        txid = checkSolSignature(await deps.companion.request(meta, SOLANA_CAIP, 'solana_signAndSendTransaction', { transaction: unsignedSolanaTx(p.message) }));
        opaque = p.lastValidBlockHeight;
      }
      sent.set(txid, { chainId: chain.id, opaque, expiresAt: held.draft.expiresAt });
      deps.portfolio.markStale(cur.acct);
      const explorer = chain.explorerUrl && /^[A-Za-z0-9]+$/.test(txid) ? `${chain.explorerUrl}/tx/${txid}` : undefined;
      deps.onSent?.({ txid, chainId: chain.id, chainName: chain.name, what: held.what, explorer, opaque, expiresAt: held.draft.expiresAt });
      return { txid, explorer };
    }
    // Clé vérifiée contre l'adresse du brouillon : jamais un autre compte que celui affiché.
    const signer = await signerFor(deps.session, deps.wallets, held.walletId, held.index, familyOf(chain), held.draft.from);
    const signed = await withSigner(signer, (s) => held.adapter.signSend(held.draft, s));
    const outcome = await held.adapter.broadcastSend(signed);
    sent.set(outcome.txid, { chainId: chain.id, opaque: outcome.opaque, expiresAt: outcome.expiresAt });
    deps.portfolio.markStale(cur.acct);
    const explorer = chain.explorerUrl && /^[A-Za-z0-9]+$/.test(outcome.txid) ? `${chain.explorerUrl}/tx/${outcome.txid}` : undefined;
    deps.onSent?.({ txid: outcome.txid, chainId: chain.id, chainName: chain.name, what: held.what, explorer, opaque: outcome.opaque, expiresAt: outcome.expiresAt });
    return { txid: outcome.txid, explorer };
  }

  /** Issue d'une transaction suivie (sans la mémoire de cette session : le service worker a pu dormir). */
  async function check(w: { txid: string; chainId: string; opaque?: unknown; expiresAt?: number }): Promise<'pending' | 'confirmed' | 'failed'> {
    const st = await adapter(getAdapter(w.chainId).config).waitForTx(w.txid, { opaque: w.opaque, expiresAt: w.expiresAt });
    if (st.status === 'pending') return 'pending';
    const cur = await deps.home.current();
    if (cur) deps.portfolio.markStale(cur.acct);
    return st.status === 'confirmed' ? 'confirmed' : 'failed';
  }

  /** Issue d'une transaction diffusée par cette session (attend jusqu'à ~2 min). */
  async function status(txid: string): Promise<TxState> {
    const s = sent.get(txid);
    if (!s) throw new WalletError('TX_UNCONFIRMED', 'Transaction inconnue');
    const a = adapter(getAdapter(s.chainId).config);
    const st = await a.waitForTx(txid, { opaque: s.opaque, expiresAt: s.expiresAt });
    if (st.status !== 'pending') {
      sent.delete(txid);
      const cur = await deps.home.current();
      if (cur) deps.portfolio.markStale(cur.acct);
    }
    return st;
  }

  /** Valeur d'un brouillon en attente (plafond journalier) ; undefined s'il n'existe plus. */
  const valueOf = (id: string): number | null | undefined => drafts.get(id)?.fiat;

  return { assets, quote, prepare, confirm, status, check, valueOf };
}

export type Send = ReturnType<typeof makeSend>;
