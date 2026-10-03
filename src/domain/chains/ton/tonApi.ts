/**
 * Client TonAPI — à travers le proxy Kalyx (`ton-proxy/`), JAMAIS en direct :
 * la clé TonAPI reste dans le Worker.
 *
 * Formes de réponse RELEVÉES (27/09, `tonapi-live.json`), pas supposées :
 * - `/v2/accounts/{a}` : `status` (`active`, `uninit`, `nonexist`…),
 *   `interfaces` (`wallet_v5r1`…), `is_wallet`, `memo_required`, et un
 *   `balance` en NOMBRE JSON — lu dans le texte brut, sinon `JSON.parse`
 *   l'arrondirait au-delà de 2^53 nanotons (~9 millions de TON) ;
 * - `/v2/wallet/{a}/seqno` : `{ seqno }` ;
 * - `/v2/wallet/emulate` : `event.extra` = variation NETTE pour le compte, hors
 *   montant envoyé — donc −(frais). Fonctionne avec une signature à zéro ;
 * - `/v2/blockchain/messages/{hash}/transaction` : la transaction déclenchée
 *   par un message (hachage NORMALISÉ accepté), 404 tant qu'elle n'existe pas ;
 * - `/v2/accounts/{a}/events` : l'historique, déjà décodé en actions.
 */
import { WalletError } from '../../errors';
import type { TonAccountState, TonAccountStatus } from './tonCenter';
import type { TonWalletVersion } from './tonWallet';
import { parseJettonBalances, type TonJettonBalance } from './tonJettons';
import { normalizeTonDomain, parseDnsWallet, parseTonNfts, type TonNft } from './tonNfts';
import { parseStakingPool, type TonstakersPool } from './tonstakers';

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>;

const INTERFACES: Record<string, TonWalletVersion> = { wallet_v5r1: 'v5r1', wallet_v4r2: 'v4r2', wallet_v3r2: 'v3r2' };

export interface TonApiEvent {
  event_id: string;
  timestamp: number;
  in_progress?: boolean;
  /** Hachage NORMALISÉ du message externe à l'origine de l'événement — relevé : c'est exactement celui que rend un envoi. */
  ext_msg_hash?: string;
  actions: {
    type: string;
    status: string;
    TonTransfer?: { sender?: { address?: string }; recipient?: { address?: string }; amount?: number | string; comment?: string };
    /** `sender`/`recipient` = comptes PROPRIÉTAIRES ; `amount` en chaîne (relevé). */
    JettonTransfer?: {
      sender?: { address?: string };
      recipient?: { address?: string };
      amount?: string;
      comment?: string;
      jetton?: { address?: string; symbol?: string; decimals?: number; verification?: string };
    };
  }[];
  /** Événement signalé comme arnaque par TonAPI. */
  is_scam?: boolean;
}

/** Ce qu'une transaction ferait, selon l'émulation de TonAPI. */
export interface TonEmulation {
  fee: bigint;
  net: bigint;
  risk: {
    /** Le message vide TOUT le solde restant. */
    allBalance: boolean;
    /** TON qui quittent le portefeuille (nanotons). */
    ton: bigint;
    jettons: { amount: bigint; symbol: string; decimals: number; verified: boolean }[];
    /** Nombre de NFT qui partent. */
    nfts: number;
  };
  /** Une action de la chaîne échouerait. */
  failed: boolean;
}

/** Issue d'une transaction lue sur TonAPI. */
export interface TonApiTxOutcome {
  hash: string;
  utime: number;
  ok: boolean;
  reason?: string;
}

/** Entier JSON lu dans le TEXTE brut, sans passer par un nombre flottant. */
function bigField(text: string, field: string): bigint | null {
  const m = text.match(new RegExp(`"${field}"\\s*:\\s*"?(-?\\d+)"?`));
  return m ? BigInt(m[1]) : null;
}

/**
 * Segment de chemin pour une adresse. Le « : » d'une adresse BRUTE (`0:…`) reste
 * tel quel : encodé en `%3A`, la liste blanche du proxy ne reconnaissait plus
 * l'adresse et répondait 404.
 */
function seg(address: string): string {
  return encodeURIComponent(address).replace(/%3A/gi, ':');
}

export class TonApiClient {
  constructor(
    /** `https://<proxy>/<mainnet|testnet>` */
    private readonly base: string,
    private readonly fetchFn: FetchLike = (u, i) => fetch(u, i),
  ) {}

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; text: string; json: any }> {
    let res: { status: number; text(): Promise<string> };
    try {
      res = await this.fetchFn(`${this.base}${path}`, method === 'POST'
        ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : { method });
    } catch (e) {
      throw new WalletError('RPC_UNAVAILABLE', `TonAPI injoignable : ${e instanceof Error ? e.message : String(e)}`);
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, text, json };
  }

  async accountState(address: string): Promise<TonAccountState & { memoRequired?: boolean }> {
    const r = await this.call('GET', `/v2/accounts/${seg(address)}`);
    if (r.status !== 200 || !r.json) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : compte illisible (HTTP ${r.status})`);
    const j = r.json;
    /*
     * Statut INCONNU (réponse dégradée, schéma changé) : erreur, et non
     * « non initialisé » — ce dernier faisait envoyer sans rebond (bounce=false)
     * vers un contrat actif, et un dépôt refusé n'était jamais rendu.
     */
    if (!['active', 'uninit', 'frozen', 'nonexist'].includes(j.status)) {
      throw new WalletError('RPC_UNAVAILABLE', 'TonAPI : état du compte illisible');
    }
    const status = j.status as TonAccountStatus;
    const version = (j.interfaces as string[] | null)?.map((i) => INTERFACES[i]).find(Boolean);
    const state: TonAccountState & { memoRequired?: boolean } = {
      status,
      balance: bigField(r.text, 'balance') ?? 0n,
      used: Number(j.last_activity ?? 0) > 0,
      walletType: (j.interfaces as string[] | null)?.[0],
      version,
      notWallet: status === 'active' && j.is_wallet === false ? true : undefined,
      memoRequired: j.memo_required === true,
    };
    if (status === 'active' && version) {
      const s = await this.call('GET', `/v2/wallet/${seg(address)}/seqno`);
      if (s.status !== 200 || typeof s.json?.seqno !== 'number') throw new WalletError('RPC_UNAVAILABLE', 'TonAPI : seqno illisible');
      state.seqno = s.json.seqno;
    }
    return state;
  }

  /** Frais EXACTS par émulation d'un message externe (signature à zéro acceptée). */
  async emulateFee(externalBoc: string): Promise<bigint> {
    return (await this.emulate(externalBoc)).fee;
  }

  /**
   * Émulation complète : frais nets, et `risk` — ce qui QUITTE le portefeuille
   * (TON, jettons, NFT), calculé par TonAPI sur l'exécution réelle et non sur
   * ce que la dApp prétend. Forme relevée (`tonapi-live.json`, `emulateV3`).
   */
  async emulate(externalBoc: string): Promise<TonEmulation> {
    const r = await this.call('POST', '/v2/wallet/emulate', { boc: externalBoc });
    const extra = r.status === 200 ? bigField(r.text, 'extra') : null;
    if (extra === null) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : émulation impossible (HTTP ${r.status})`);
    const risk = r.json?.risk ?? {};
    const jettons = Array.isArray(risk.jettons) ? risk.jettons : [];
    return {
      // `extra` < 0 : ce que le compte perd hors montants envoyés ; > 0 : il reçoit plus qu'il ne paie.
      fee: extra < 0n ? -extra : 0n,
      net: extra,
      risk: {
        allBalance: risk.transfer_all_remaining_balance === true,
        ton: /^\d+$/.test(String(risk.ton ?? '')) ? BigInt(String(risk.ton)) : 0n,
        jettons: jettons
          .filter((j: any) => /^\d+$/.test(String(j?.quantity ?? '')))
          .map((j: any) => ({
            amount: BigInt(String(j.quantity)),
            symbol: String(j.jetton?.symbol ?? '?').slice(0, 24),
            decimals: Number.isInteger(j.jetton?.decimals) ? j.jetton.decimals : 9,
            verified: j.jetton?.verification === 'whitelist',
          })),
        nfts: Array.isArray(risk.nfts) ? risk.nfts.length : 0,
      },
      failed: Array.isArray(r.json?.event?.actions) && r.json.event.actions.some((a: any) => a?.status && a.status !== 'ok'),
    };
  }

  /** Diffuse un message externe. Le proxy relaie par TON Center si TonAPI sature. */
  async sendBoc(boc: string): Promise<void> {
    const r = await this.call('POST', '/v2/blockchain/message', { boc });
    if (r.status !== 200) throw new WalletError('BROADCAST_FAILED', `TON : diffusion refusée (HTTP ${r.status}) ${String(r.json?.error ?? '').slice(0, 160)}`);
  }

  /** Transaction déclenchée par un message, ou `null` tant qu'elle n'existe pas. */
  async transactionByMessage(msgHash: string): Promise<TonApiTxOutcome | null> {
    const r = await this.call('GET', `/v2/blockchain/messages/${encodeURIComponent(msgHash)}/transaction`);
    if (r.status === 404) return null;
    if (r.status !== 200 || !r.json) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : HTTP ${r.status}`);
    const t = r.json;
    const a = t.action_phase;
    let reason: string | undefined;
    if (t.compute_phase?.success === false) reason = `calcul, code ${t.compute_phase.exit_code ?? '?'}`;
    else if (t.aborted) reason = 'transaction interrompue';
    else if (a && (a.success === false || (a.skipped_actions ?? 0) > 0 || (a.result_code ?? 0) !== 0)) {
      reason = (a.skipped_actions ?? 0) > 0 ? 'fonds insuffisants' : `action, code ${a.result_code ?? '?'}`;
    }
    return { hash: String(t.hash), utime: Number(t.utime ?? 0), ok: !reason && t.success !== false, reason: reason ?? (t.success === false ? 'échec' : undefined) };
  }

  /** Soldes de jettons, prix dans `currency`, listes noires écartées. */
  async jettons(address: string, currency = 'usd'): Promise<TonJettonBalance[]> {
    const cur = /^[a-z]{3}$/i.test(currency) ? currency.toLowerCase() : 'usd';
    const r = await this.call('GET', `/v2/accounts/${seg(address)}/jettons?currencies=${cur}`);
    if (r.status !== 200 || !r.json) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : jetons illisibles (HTTP ${r.status})`);
    return parseJettonBalances(r.json, cur);
  }

  /**
   * Adresse (brute) du portefeuille du jetton `master` détenu par `owner`, lue
   * sur la chaîne via TonAPI — ou null s'il n'existe pas. Sert à vérifier une
   * adresse donnée par un tiers (ex. le portefeuille pTON d'un routeur STON.fi).
   */
  async jettonWalletOf(owner: string, master: string): Promise<string | null> {
    const r = await this.call('GET', `/v2/accounts/${seg(owner)}/jettons/${seg(master)}`);
    if (r.status === 404) return null;
    if (r.status !== 200 || !r.json) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : portefeuille de jetton illisible (HTTP ${r.status})`);
    const a = r.json?.wallet_address?.address;
    return typeof a === 'string' ? a : null;
  }

  /** NFT détenus (domaines .ton compris), arnaques écartées. */
  async nfts(address: string, limit = 100): Promise<TonNft[]> {
    const r = await this.call('GET', `/v2/accounts/${seg(address)}/nfts?limit=${limit}&offset=0&indirect_ownership=false`);
    if (r.status !== 200 || !r.json) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : NFT illisibles (HTTP ${r.status})`);
    return parseTonNfts(r.json);
  }

  /** Nom .ton → adresse du portefeuille désigné, ou null s'il n'existe pas / ne désigne rien. */
  async resolveDomain(name: string, testnet: boolean): Promise<string | null> {
    const domain = normalizeTonDomain(name);
    if (!domain) return null;
    const r = await this.call('GET', `/v2/dns/${domain}/resolve`);
    // « N'existe pas » seulement pour un refus qui le DIT (404, requête invalide) ; trop de requêtes,
    // accès refusé au proxy… sont une indisponibilité (« réessaie »), pas un nom inconnu.
    if (r.status === 404 || r.status === 400 || r.status === 422) return null;
    if (r.status !== 200) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : résolution impossible (HTTP ${r.status})`);
    return parseDnsWallet(r.json, testnet);
  }

  /** Symbole et décimales d'un jetton, pour un jetton qu'on ne détient pas encore. */
  async jettonInfo(master: string): Promise<{ symbol: string; decimals: number; verified: boolean } | null> {
    const r = await this.call('GET', `/v2/jettons/${seg(master)}`);
    const m = r.status === 200 ? r.json?.metadata : null;
    const decimals = Number(m?.decimals ?? 9);
    if (!m || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;
    return { symbol: String(m.symbol ?? '?').slice(0, 24), decimals, verified: r.json?.verification === 'whitelist' };
  }

  /** Pool de staking (Tonstakers) : APY, minimum, contrat du tsTON. */
  async stakingPool(pool: string): Promise<TonstakersPool> {
    const r = await this.call('GET', `/v2/staking/pool/${seg(pool)}`);
    const parsed = r.status === 200 ? parseStakingPool(r.json) : null;
    if (!parsed) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : pool illisible (HTTP ${r.status})`);
    return parsed;
  }

  /** Valeur d'un jeton en TON (ex. 1 tsTON = 1,16 TON), ou null si inconnue. */
  async priceInTon(master: string): Promise<number | null> {
    const r = await this.call('GET', `/v2/rates?tokens=${seg(master)}&currencies=ton`);
    const rates = r.status === 200 ? (r.json?.rates as Record<string, { prices?: { TON?: unknown } }> | undefined) : undefined;
    const hit = rates ? Object.values(rates)[0]?.prices?.TON : undefined;
    const n = Number(hit);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async events(address: string, limit = 25): Promise<TonApiEvent[]> {
    const r = await this.call('GET', `/v2/accounts/${seg(address)}/events?limit=${limit}`);
    if (r.status !== 200 || !r.json) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : historique illisible (HTTP ${r.status})`);
    return (r.json.events ?? []) as TonApiEvent[];
  }
}
