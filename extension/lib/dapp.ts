/**
 * PONT VERS LES dAPPS — ce que répond Kalyx à une page web.
 *
 * Chaque demande arrive avec l'ORIGINE lue par Chrome (pas par la page). Ce
 * qu'un site obtient :
 *  - sans connexion : le réseau (eth_chainId), les lectures publiques relayées
 *    au RPC (liste blanche stricte, celle de l'app : lib/dappProvider) ;
 *  - connecté (accord donné dans la fenêtre Kalyx) : l'adresse du compte
 *    choisi, pour la famille demandée seulement ;
 *  - verrouillé : aucune adresse (eth_accounts = []), et une connexion
 *    demande d'abord le mot de passe dans la fenêtre.
 *
 * Les signatures (transactions, messages) arrivent au lot 6 avec la fenêtre
 * d'approbation complète : d'ici là, elles sont refusées proprement (4200).
 */
import { READONLY_METHODS, rpcProxy } from '../../lib/dappProvider';
import { listChains } from '../../src/domain/chains/registry';
import type { ChainConfig } from '../../src/domain/chains/types';
import { RpcError } from './rpcError';
import type { Approvals } from './approvals';
import type { Session } from './session';
import type { Sites, Family, Site } from './sites';
import type { Wallets } from './wallets';

/** Signatures : servies au lot 6 (fenêtre d'approbation). */
const SIGNING = new Set(['eth_sendTransaction', 'eth_signTransaction', 'personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'wallet_sendCalls']);
const SOLANA_SIGNING = new Set(['sol_signTransaction', 'sol_signAndSendTransaction', 'sol_signMessage', 'sol_signIn']);

export type Emit = (origin: string, event: string, data: unknown) => void;

export interface DappDeps {
  session: Session;
  wallets: Wallets;
  sites: Sites;
  approvals: Approvals;
  emit: Emit;
  /** Injectable (tests) : relais JSON-RPC en lecture seule. */
  rpc?: (urls: string[], method: string, params: unknown[]) => Promise<unknown>;
}

const hex = (n: number) => `0x${n.toString(16)}`;

/** Réseaux EVM qu'un site peut demander : ceux du registre (réseaux principaux et de test). */
function evmChain(chainIdHex: string): ChainConfig | undefined {
  if (typeof chainIdHex !== 'string' || !/^0x[0-9a-fA-F]{1,16}$/.test(chainIdHex)) return undefined;
  const id = Number.parseInt(chainIdHex, 16);
  return listChains().find((c) => c.family === 'evm' && c.evmChainId === id);
}

export function makeDapp(deps: DappDeps) {
  const rpc = deps.rpc ?? ((urls: string[], method: string, params: unknown[]) => rpcProxy(urls, method, params));
  const unlocked = async () => (await deps.session.status()).unlocked;

  /** Adresse accordée, si le compte existe encore (portefeuille supprimé → plus rien). */
  async function granted(site: Site, family: Family): Promise<string | null> {
    const g = site[family];
    if (!g) return null;
    const w = (await deps.wallets.list()).find((x) => x.id === g.walletId);
    const a = w?.accounts.find((x) => x.index === g.index);
    const addr = family === 'evm' ? a?.evm : a?.solana;
    return addr && addr === g.address ? addr : null;
  }

  async function connect(origin: string, family: Family): Promise<string> {
    const site = await deps.sites.get(origin);
    const already = await granted(site, family);
    if (already && (await unlocked())) return already;
    // La fenêtre demande le mot de passe si besoin, puis l'accord et le compte.
    const g = await deps.approvals.request(origin, 'connect', family);
    const w = (await deps.wallets.list()).find((x) => x.id === g.walletId);
    const a = w?.accounts.find((x) => x.index === g.index);
    const address = family === 'evm' ? a?.evm : a?.solana;
    if (!address) throw new RpcError(4100, 'Ce compte n’a pas d’adresse pour ce réseau');
    await deps.sites.grant(origin, family, { walletId: g.walletId, index: g.index, address, at: Date.now() });
    if (family === 'evm') deps.emit(origin, 'accountsChanged', [address]);
    return address;
  }

  async function evm(origin: string, method: string, params: unknown[]): Promise<unknown> {
    const site = await deps.sites.get(origin);
    switch (method) {
      case 'eth_chainId':
        return site.chainId;
      case 'net_version':
        return String(Number.parseInt(site.chainId, 16));
      case 'eth_accounts': {
        const a = (await unlocked()) ? await granted(site, 'evm') : null;
        return a ? [a] : [];
      }
      case 'eth_requestAccounts':
        return [await connect(origin, 'evm')];
      case 'wallet_requestPermissions': {
        const p = params[0] as Record<string, unknown> | undefined;
        if (!p || typeof p !== 'object' || !('eth_accounts' in p)) throw new RpcError(-32602, 'Seule la permission eth_accounts existe');
        await connect(origin, 'evm');
        return [{ parentCapability: 'eth_accounts', invoker: origin }];
      }
      case 'wallet_getPermissions':
        return (await granted(site, 'evm')) ? [{ parentCapability: 'eth_accounts', invoker: origin }] : [];
      case 'wallet_revokePermissions':
        await deps.sites.revoke(origin, 'evm');
        deps.emit(origin, 'accountsChanged', []);
        return null;
      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain': {
        const p = params[0] as { chainId?: unknown } | undefined;
        const chain = evmChain(p?.chainId as string);
        // Un réseau inconnu de Kalyx n'est pas ajouté depuis une page : son RPC serait celui du site.
        if (!chain) throw new RpcError(4902, 'Réseau non pris en charge par Kalyx');
        const id = hex(chain.evmChainId!);
        if (id !== site.chainId) {
          await deps.sites.setChain(origin, id);
          deps.emit(origin, 'chainChanged', id);
        }
        return null;
      }
      case 'web3_clientVersion':
        return 'Kalyx/extension';
    }
    if (SIGNING.has(method)) throw new RpcError(4200, 'Signature depuis une dApp : bientôt disponible dans l’extension Kalyx');
    if (READONLY_METHODS.has(method)) {
      const chain = evmChain(site.chainId);
      if (!chain) throw new RpcError(4901, 'Réseau du site indisponible');
      return rpc(chain.rpcUrls, method, params);
    }
    throw new RpcError(4200, `Méthode non prise en charge : ${method.slice(0, 60)}`);
  }

  async function solana(origin: string, method: string, params: unknown[]): Promise<unknown> {
    const site = await deps.sites.get(origin);
    switch (method) {
      case 'sol_connect': {
        const silent = (params[0] as { silent?: unknown } | undefined)?.silent === true;
        const a = (await unlocked()) ? await granted(site, 'solana') : null;
        if (a) return { address: a };
        // Reconnexion silencieuse (au chargement de la page) : jamais de fenêtre.
        if (silent) return { address: null };
        return { address: await connect(origin, 'solana') };
      }
      case 'sol_disconnect':
        await deps.sites.revoke(origin, 'solana');
        return null;
    }
    if (SOLANA_SIGNING.has(method)) throw new RpcError(4200, 'Signature depuis une dApp : bientôt disponible dans l’extension Kalyx');
    throw new RpcError(4200, `Méthode non prise en charge : ${method.slice(0, 60)}`);
  }

  /** Point d'entrée : une demande d'une page, son origine lue par Chrome. */
  async function handle(origin: string, family: Family, method: string, params: unknown[]): Promise<unknown> {
    if (typeof method !== 'string' || method.length > 80) throw new RpcError(-32602, 'Méthode invalide');
    if (!Array.isArray(params)) params = [];
    return family === 'evm' ? evm(origin, method, params) : solana(origin, method, params);
  }

  /** État à envoyer à une page qui (re)branche son relais : réseau, et comptes si accordés. */
  async function hello(origin: string) {
    const site = await deps.sites.get(origin);
    const open = await unlocked();
    return {
      chainId: site.chainId,
      evm: open ? await granted(site, 'evm') : null,
      solana: open ? await granted(site, 'solana') : null,
    };
  }

  /** Verrouillage / déverrouillage : chaque site connecté voit ses comptes disparaître ou revenir. */
  async function lockChanged(origins: string[]) {
    const open = await unlocked();
    for (const origin of origins) {
      const site = await deps.sites.get(origin);
      const e = open ? await granted(site, 'evm') : null;
      if (site.evm) deps.emit(origin, 'accountsChanged', e ? [e] : []);
      const s = open ? await granted(site, 'solana') : null;
      if (site.solana) deps.emit(origin, 'solanaAccountsChanged', s ? [s] : []);
    }
  }

  /** Déconnexion depuis Kalyx (écran Sites connectés). */
  async function disconnect(origin: string) {
    await deps.sites.revoke(origin);
    deps.emit(origin, 'accountsChanged', []);
    deps.emit(origin, 'solanaAccountsChanged', []);
  }

  return { handle, hello, lockChanged, disconnect };
}

export type Dapp = ReturnType<typeof makeDapp>;
