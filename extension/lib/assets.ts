/**
 * RÉSEAUX ET TOKENS AFFICHÉS : réseaux masqués, tokens masqués, tokens
 * ajoutés par contrat. Des préférences d'AFFICHAGE, sans valeur pour un
 * voleur (disque en clair, comme la devise) ; elles ne changent ni l'envoi
 * ni les signatures : un token masqué reste envoyable, un réseau masqué
 * reste utilisable par un site.
 *
 * Token ajouté : vérifié SUR LE CONTRAT (decimals, symbol, name lus par le
 * réseau) au moment de l'ajout, jamais d'après ce que l'utilisateur tape.
 * Il reste marqué « non vérifié par Kalyx » (n'importe qui peut créer un
 * token qui porte le nom d'un autre) et sans prix : aucune valeur inventée.
 */
import { Interface } from 'ethers';
import { getAdapter, hasChain, listChains } from '../../src/domain/chains/registry';
import type { EvmChainAdapter } from '../../src/domain/chains/EvmChainAdapter';
import type { ChainConfig } from '../../src/domain/chains/types';
import { isValidEvmAddress } from '../../src/domain/validation/address';
import { isSpamToken } from '../../src/domain/tokens/alchemyTokens';
import { WalletError } from './wallets';
import { chainLogo } from './portfolio';
import type { Store } from './storage';

export interface ViewPrefs {
  hiddenChains: string[];
  /** Identifiants de holdings (`réseau:contrat|native`), en minuscules. */
  hiddenTokens: string[];
}

export interface CustomToken {
  chainId: string;
  /** Adresse du contrat, en minuscules. */
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface TokenCheck extends CustomToken {
  /** Solde du compte affiché (unités brutes, en texte), si lisible. */
  raw?: string;
}

const K = { prefs: 'view.prefs', custom: 'tokens.custom' } as const;
export const MAX_CUSTOM = 30;
const MAX_HIDDEN = 500;

const META = new Interface(['function symbol() view returns (string)', 'function name() view returns (string)', 'function decimals() view returns (uint8)']);

/** Chaîne lue d'un contrat ; les anciens (MKR…) rendent un bytes32. */
function decodeText(fn: 'symbol' | 'name', hex: string): string {
  try {
    return String(META.decodeFunctionResult(fn, hex)[0]);
  } catch {
    const raw = hex.replace(/^0x/, '').slice(0, 64).replace(/(00)+$/, '');
    if (!raw || raw.length % 2) return '';
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw.match(/../g)!.map((x) => Number.parseInt(x, 16))));
    } catch {
      return '';
    }
  }
}

/** Lettres, chiffres et quelques signes : ni contrôle, ni bidi, ni HTML. */
const clean = (s: string, max: number) => s.replace(/[^\p{L}\p{N} .$_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Réseaux dont on affiche les soldes : grand public, servis par l'extension. */
export function viewChains(): ChainConfig[] {
  return listChains({ includeTestnets: false }).filter((c) => (c.family === 'evm' || c.family === 'solana') && hasChain(c.id));
}

const evmMainnet = (id: unknown): ChainConfig | undefined => {
  if (typeof id !== 'string') return undefined;
  const c = viewChains().find((x) => x.id === id);
  return c?.family === 'evm' ? c : undefined;
};

export interface AssetsDeps {
  disk: Store;
  /** Injectables pour les tests (sinon : le contrat, lu sur le réseau). */
  readMeta?: (chainId: string, contract: string) => Promise<{ symbol: string; name: string; decimals: number }>;
  readBalance?: (chainId: string, contract: string, owner: string) => Promise<bigint>;
}

export function makeAssets(deps: AssetsDeps) {
  const readMeta =
    deps.readMeta ??
    (async (chainId: string, contract: string) => {
      const a = getAdapter(chainId) as EvmChainAdapter;
      const [d, s, n] = await Promise.all([
        a.callContract(contract, META.encodeFunctionData('decimals')),
        a.callContract(contract, META.encodeFunctionData('symbol')),
        a.callContract(contract, META.encodeFunctionData('name')).catch(() => '0x'),
      ]);
      // Une adresse sans contrat (compte ordinaire) rend « 0x » : pas un token.
      if (!d || d === '0x') throw new WalletError('NOT_A_TOKEN');
      return { decimals: Number(BigInt(d)), symbol: decodeText('symbol', s), name: decodeText('name', n) };
    });
  const readBalance = deps.readBalance ?? ((chainId: string, contract: string, owner: string) => (getAdapter(chainId) as EvmChainAdapter).getTokenBalanceStrict(contract, owner));

  async function prefs(): Promise<ViewPrefs> {
    const p = await deps.disk.get<Partial<ViewPrefs>>(K.prefs);
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { hiddenChains: list(p?.hiddenChains), hiddenTokens: list(p?.hiddenTokens) };
  }

  /** Réseaux affichables, chacun avec son état. */
  async function networks() {
    const { hiddenChains } = await prefs();
    return viewChains().map((c) => ({ id: c.id, name: c.name, family: c.family, logo: chainLogo(c.id), hidden: hiddenChains.includes(c.id) }));
  }

  /** Masquer un réseau : jamais le dernier affiché (l'écran serait vide sans raison visible). */
  async function setChainHidden(id: unknown, hidden: unknown) {
    if (typeof id !== 'string' || typeof hidden !== 'boolean' || !viewChains().some((c) => c.id === id)) throw new WalletError('BAD_REQUEST');
    const p = await prefs();
    const set = new Set(p.hiddenChains);
    if (hidden) set.add(id);
    else set.delete(id);
    if (viewChains().every((c) => set.has(c.id))) throw new WalletError('LAST_NETWORK');
    await deps.disk.set<ViewPrefs>(K.prefs, { ...p, hiddenChains: [...set] });
  }

  async function setTokenHidden(id: unknown, hidden: unknown) {
    if (typeof id !== 'string' || typeof hidden !== 'boolean' || !/^[a-z0-9-]{2,32}:(native|0x[0-9a-f]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/i.test(id)) throw new WalletError('BAD_REQUEST');
    const key = id.toLowerCase();
    const p = await prefs();
    const set = new Set(p.hiddenTokens);
    if (hidden) set.add(key);
    else set.delete(key);
    if (set.size > MAX_HIDDEN) throw new WalletError('BAD_REQUEST');
    await deps.disk.set<ViewPrefs>(K.prefs, { ...p, hiddenTokens: [...set] });
  }

  async function customs(): Promise<CustomToken[]> {
    const list = await deps.disk.get<CustomToken[]>(K.custom);
    return Array.isArray(list) ? list.filter((c) => c && typeof c.chainId === 'string' && /^0x[0-9a-f]{40}$/.test(c.contract)) : [];
  }

  /** Lit le token sur son contrat. Le symbole affiché est celui du contrat, nettoyé. */
  async function check(chainId: unknown, contract: unknown, owner?: string): Promise<TokenCheck> {
    const chain = evmMainnet(chainId);
    if (!chain || typeof contract !== 'string' || !isValidEvmAddress(contract.trim())) throw new WalletError('BAD_CONTRACT');
    const addr = contract.trim().toLowerCase();
    let meta: { symbol: string; name: string; decimals: number };
    try {
      meta = await readMeta(chain.id, addr);
    } catch (e) {
      if (e instanceof WalletError) throw e;
      // Le réseau n'a pas répondu, ou le contrat ne parle pas ERC-20.
      throw new WalletError('TOKEN_UNREADABLE');
    }
    const symbol = clean(meta.symbol, 12);
    const name = clean(meta.name, 48) || symbol;
    if (!symbol || !Number.isInteger(meta.decimals) || meta.decimals < 0 || meta.decimals > 36) throw new WalletError('NOT_A_TOKEN');
    // Nom d'arnaque (lien, « claim », « airdrop »…) : pas de place sur l'écran principal.
    if (isSpamToken({ symbol: meta.symbol, name: meta.name || meta.symbol, decimals: meta.decimals })) throw new WalletError('SUSPICIOUS_TOKEN');
    const out: TokenCheck = { chainId: chain.id, contract: addr, symbol, name, decimals: meta.decimals };
    if (owner) {
      try {
        out.raw = (await readBalance(chain.id, addr, owner)).toString();
      } catch {
        // Solde illisible : on ne l'affiche pas (jamais un faux 0).
      }
    }
    return out;
  }

  /** Ajout : le contrat est RELU ici (rien de ce que l'écran a montré n'est cru sur parole). */
  async function add(chainId: unknown, contract: unknown): Promise<CustomToken> {
    const tok = await check(chainId, contract);
    const list = await customs();
    if (list.some((c) => c.chainId === tok.chainId && c.contract === tok.contract)) throw new WalletError('TOKEN_EXISTS');
    if (list.length >= MAX_CUSTOM) throw new WalletError('TOO_MANY_TOKENS');
    const { raw: _raw, ...entry } = tok;
    await deps.disk.set(K.custom, [...list, entry]);
    // Un token ajouté, puis masqué, puis rajouté : il redevient visible.
    await setTokenHidden(`${entry.chainId}:${entry.contract}`, false);
    return entry;
  }

  async function remove(chainId: unknown, contract: unknown) {
    if (typeof chainId !== 'string' || typeof contract !== 'string') throw new WalletError('BAD_REQUEST');
    const addr = contract.toLowerCase();
    const list = await customs();
    await deps.disk.set(
      K.custom,
      list.filter((c) => !(c.chainId === chainId && c.contract === addr)),
    );
  }

  /**
   * Soldes des tokens ajoutés pour une adresse EVM. Un réseau qui ne répond
   * pas est rendu dans `failed` (le cliché précédent est alors gardé) :
   * jamais un solde nul inventé.
   */
  async function balances(evm: string | undefined, list?: CustomToken[]): Promise<{ items: (CustomToken & { raw: bigint })[]; failed: string[] }> {
    const all = list ?? (await customs());
    if (!evm || !all.length) return { items: [], failed: [] };
    const failed = new Set<string>();
    const items: (CustomToken & { raw: bigint })[] = [];
    await Promise.all(
      all.map(async (c) => {
        if (!hasChain(c.chainId)) return;
        try {
          items.push({ ...c, raw: await readBalance(c.chainId, c.contract, evm) });
        } catch {
          failed.add(c.chainId);
        }
      }),
    );
    return { items, failed: [...failed] };
  }

  return { prefs, networks, setChainHidden, setTokenHidden, customs, check, add, remove, balances };
}

export type Assets = ReturnType<typeof makeAssets>;
