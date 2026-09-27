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
    const status = (['active', 'uninit', 'frozen', 'nonexist'].includes(j.status) ? j.status : 'uninit') as TonAccountStatus;
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
    const r = await this.call('POST', '/v2/wallet/emulate', { boc: externalBoc });
    const extra = r.status === 200 ? bigField(r.text, 'extra') : null;
    if (extra === null) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : émulation impossible (HTTP ${r.status})`);
    return extra < 0n ? -extra : 0n;
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

  async events(address: string, limit = 25): Promise<TonApiEvent[]> {
    const r = await this.call('GET', `/v2/accounts/${seg(address)}/events?limit=${limit}`);
    if (r.status !== 200 || !r.json) throw new WalletError('RPC_UNAVAILABLE', `TonAPI : historique illisible (HTTP ${r.status})`);
    return (r.json.events ?? []) as TonApiEvent[];
  }
}
