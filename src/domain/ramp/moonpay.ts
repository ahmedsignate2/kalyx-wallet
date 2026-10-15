/**
 * ACHAT DE CRYPTO (MoonPay) — ce que l'app décide, sans réseau ni interface.
 *
 * Le serveur (ton-proxy/src/moonpay.ts) tient les clés et signe les URL ;
 * ici on choisit QUOI proposer : les actifs MoonPay qu'on sait recevoir (un
 * réseau que Kalyx gère, donc une adresse à soi), les moyens de paiement qui
 * marchent vraiment dans l'app, les limites de montant, et la lecture du retour
 * du widget.
 */

/** Une devise telle que la renvoie le worker (`/moonpay/currencies`). */
export interface RampCurrency {
  type: 'crypto' | 'fiat';
  code: string;
  name: string;
  minBuyAmount: number | null;
  maxBuyAmount: number | null;
  networkCode?: string | null;
  chainId?: string | null;
  contractAddress?: string | null;
  supportsTestMode?: boolean;
  isSuspended?: boolean;
}

export interface RampChainLike {
  id: string;
  family: string;
  evmChainId?: number;
  testnet?: boolean;
}

/** Un actif achetable ET recevable dans Kalyx. */
export interface BuyAsset {
  /** Code MoonPay (`eth`, `usdc_base`…). */
  code: string;
  symbol: string;
  name: string;
  /** Réseau Kalyx où l'achat arrive. */
  chainId: string;
  /** Contrat du jeton, `null` pour la monnaie native. */
  contract: string | null;
}

/** Réseaux non EVM : code réseau MoonPay → réseau Kalyx. */
const NON_EVM: Record<string, string> = { bitcoin: 'bitcoin', solana: 'solana', ton: 'ton' };

/** Stablecoins puis les plus demandés ; le reste par ordre alphabétique. */
const POPULAR = ['USDC', 'USDT', 'BTC', 'ETH', 'SOL', 'TON', 'POL', 'BNB'];

/**
 * Actifs MoonPay qu'on peut recevoir : réseau reconnu (identifiant EVM, ou
 * réseau non EVM géré), non suspendus, et — en mode test — disponibles dans
 * le bac à sable.
 */
export function buyableAssets(currencies: readonly RampCurrency[], chains: readonly RampChainLike[], opts: { sandbox: boolean }): BuyAsset[] {
  const out: BuyAsset[] = [];
  const mainnets = chains.filter((c) => !c.testnet);
  for (const c of currencies) {
    if (c.type !== 'crypto' || c.isSuspended) continue;
    if (opts.sandbox && c.supportsTestMode === false) continue;
    const evm = c.chainId && /^\d+$/.test(c.chainId) ? Number(c.chainId) : undefined;
    const chain =
      evm !== undefined
        ? mainnets.find((x) => x.family === 'evm' && x.evmChainId === evm)
        : mainnets.find((x) => x.id === NON_EVM[String(c.networkCode ?? '').toLowerCase()]);
    if (!chain) continue;
    const contract = c.contractAddress && /^0x[0-9a-fA-F]{40}$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c.contractAddress) ? c.contractAddress : null;
    out.push({ code: c.code, symbol: c.code.split('_')[0].toUpperCase(), name: c.name, chainId: chain.id, contract });
  }
  const rank = (s: string) => {
    const i = POPULAR.indexOf(s);
    return i < 0 ? POPULAR.length : i;
  };
  return out.sort((a, b) => rank(a.symbol) - rank(b.symbol) || a.symbol.localeCompare(b.symbol) || a.code.localeCompare(b.code));
}

/** Devise de paiement : celle de l'app si MoonPay la prend, sinon l'euro, sinon le dollar. */
export function pickFiat(currencies: readonly RampCurrency[], preferred: string): RampCurrency | null {
  const fiats = currencies.filter((c) => c.type === 'fiat');
  return (
    fiats.find((f) => f.code === preferred.toLowerCase()) ??
    fiats.find((f) => f.code === 'eur') ??
    fiats.find((f) => f.code === 'usd') ??
    fiats[0] ??
    null
  );
}

/** Montant hors des bornes de MoonPay pour cette devise, ou `null`. */
export function amountProblem(amount: number, fiat: Pick<RampCurrency, 'minBuyAmount' | 'maxBuyAmount'> | null): 'min' | 'max' | null {
  if (!fiat || !Number.isFinite(amount) || amount <= 0) return null;
  if (fiat.minBuyAmount != null && amount < fiat.minBuyAmount) return 'min';
  if (fiat.maxBuyAmount != null && amount > fiat.maxBuyAmount) return 'max';
  return null;
}

export type BuyPaymentMethod = 'credit_debit_card' | 'apple_pay' | 'google_pay' | 'sepa_bank_transfer' | 'gbp_bank_transfer';

/**
 * Moyens de paiement proposés. Apple Pay d'abord sur iOS (meilleur taux de
 * réussite, et il fonctionne dans la vue web) ; Google Pay sur Android — il
 * NE fonctionne PAS dans une vue web : le widget s'ouvre alors dans Chrome.
 */
export function paymentMethodsFor(os: string, fiat: string): BuyPaymentMethod[] {
  const out: BuyPaymentMethod[] = os === 'ios' ? ['apple_pay', 'credit_debit_card'] : os === 'android' ? ['credit_debit_card', 'google_pay'] : ['credit_debit_card'];
  if (fiat === 'eur') out.push('sepa_bank_transfer');
  if (fiat === 'gbp') out.push('gbp_bank_transfer');
  return out;
}

/** Ce moyen de paiement exige le navigateur du système (pas de vue web). */
export const needsSystemBrowser = (m: BuyPaymentMethod) => m === 'google_pay';

/**
 * Retour du widget : MoonPay redirige vers notre page de fin avec
 * `transactionId` et `transactionStatus`. `null` si l'URL n'est pas elle.
 */
export function parseBuyRedirect(url: string, redirectBase: string): { transactionId: string; status: string } | null {
  let u: URL, base: URL;
  try {
    u = new URL(url);
    base = new URL(redirectBase);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.host !== base.host || u.pathname.replace(/\/+$/, '') !== base.pathname.replace(/\/+$/, '')) return null;
  const id = u.searchParams.get('transactionId') ?? '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  const status = (u.searchParams.get('transactionStatus') ?? 'pending').replace(/[^A-Za-z]/g, '').slice(0, 32) || 'pending';
  return { transactionId: id, status };
}

/** Suivi de commande chez MoonPay. */
export function buyTrackerUrl(env: 'sandbox' | 'production', transactionId: string): string {
  const host = env === 'production' ? 'https://buy.moonpay.com' : 'https://buy-sandbox.moonpay.com';
  return `${host}/transaction_receipt?transactionId=${encodeURIComponent(transactionId)}`;
}

/** Hôtes que la vue web du widget peut charger sans sortir de l'app. */
export function isMoonpayHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'moonpay.com' || h.endsWith('.moonpay.com');
}

/* ── Parcours : token, puis réseau ─────────────────────────────────────── */

const USD_STABLES = new Set(['USDC', 'USDT', 'PYUSD', 'DAI', 'EURC']);
export const isStablecoin = (symbol: string) => USD_STABLES.has(symbol.toUpperCase());

/** Un token achetable, et les réseaux où on peut le recevoir (ordre du catalogue). */
export interface BuyToken {
  symbol: string;
  name: string;
  networks: BuyAsset[];
}

/** Regroupe les actifs par token : « USDC » une fois, ses réseaux ensuite. */
export function groupBuyTokens(assets: readonly BuyAsset[]): BuyToken[] {
  const out: BuyToken[] = [];
  for (const a of assets) {
    const g = out.find((x) => x.symbol === a.symbol);
    if (g) g.networks.push(a);
    else out.push({ symbol: a.symbol, name: a.name.replace(/\s*\(.*\)\s*$/, ''), networks: [a] });
  }
  // Le réseau « d'origine » d'abord (Ethereum pour ETH et les stablecoins).
  for (const g of out) g.networks.sort((x, y) => Number(y.chainId === 'ethereum') - Number(x.chainId === 'ethereum'));
  return out;
}

/** Ordre de grandeur des frais d'un réseau, pour aider à choisir. */
export function networkFeeTier(chainId: string): 'high' | 'low' | 'variable' {
  if (chainId === 'ethereum') return 'high';
  if (chainId === 'bitcoin') return 'variable';
  return 'low';
}

/* ── Suivi : de la commande MoonPay aux 4 étapes affichées ─────────────── */

export type BuyStepState = 'done' | 'active' | 'todo' | 'failed';

export interface RampTxLike {
  status: string;
  stages?: readonly { stage: string; status: string }[];
}

/**
 * Quatre étapes : paiement validé, achat en cours, crypto envoyée,
 * finalisation. Lues dans les étapes de MoonPay quand il les donne, sinon
 * déduites de son statut.
 */
export function buyProgress(tx: RampTxLike): { steps: BuyStepState[]; outcome: 'pending' | 'completed' | 'failed' } {
  const outcome = tx.status === 'completed' ? 'completed' : tx.status === 'failed' ? 'failed' : 'pending';
  const st = (name: string): BuyStepState | null => {
    const s = tx.stages?.find((x) => x.stage === name)?.status;
    if (!s) return null;
    return s === 'success' ? 'done' : s === 'in_progress' ? 'active' : s === 'failed' ? 'failed' : 'todo';
  };
  let steps: BuyStepState[];
  if (tx.stages && tx.stages.length) {
    const order = st('stage_one_ordering');
    const verif = st('stage_two_verification');
    const pay: BuyStepState = order === 'failed' || verif === 'failed' ? 'failed' : verif === 'done' ? 'done' : 'active';
    steps = [pay, st('stage_three_processing') ?? 'todo', st('stage_four_delivery') ?? 'todo', outcome === 'completed' ? 'done' : 'todo'];
    // Une seule étape « en cours » à la fois : la première qui n'est pas finie.
    if (outcome === 'pending' && !steps.some((s) => s === 'active' || s === 'failed')) {
      const i = steps.findIndex((s) => s === 'todo');
      if (i >= 0) steps[i] = 'active';
    }
  } else if (outcome === 'completed') {
    steps = ['done', 'done', 'done', 'done'];
  } else if (outcome === 'failed') {
    steps = ['failed', 'todo', 'todo', 'todo'];
  } else if (tx.status === 'pending') {
    steps = ['done', 'active', 'todo', 'todo'];
  } else {
    steps = ['active', 'todo', 'todo', 'todo'];
  }
  if (outcome === 'failed' && !steps.includes('failed')) {
    const i = steps.findIndex((s) => s !== 'done');
    steps[i < 0 ? 3 : i] = 'failed';
  }
  return { steps, outcome };
}
