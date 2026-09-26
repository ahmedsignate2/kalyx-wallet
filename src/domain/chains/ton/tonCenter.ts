/**
 * Client TON Center (API v2 + v3), SANS clé — pour développer et tester.
 *
 * Décision du 26/09 : en production, un proxy Cloudflare Worker devant TonAPI
 * (la clé reste côté serveur, jamais dans un `EXPO_PUBLIC_` partagé par tous les
 * utilisateurs). Ce client ne sert qu'à valider TON de bout en bout d'ici là.
 *
 * ## Les formes de réponse ont été RELEVÉES, pas supposées
 *
 * Chaque cas traité ici a été observé en interrogeant TON Center le 26/09 :
 * - `walletInformation` rend `status` (`active`, `uninit`…), le solde, et pour
 *   un portefeuille actif `wallet_type` (« wallet v5 r1 »), `seqno`, `wallet_id` ;
 *   un compte non déployé n'a NI `wallet_type` NI `seqno` ; une adresse jamais
 *   utilisée a `last_transaction_lt` à « 0 » ;
 * - un contrat qui n'est pas un portefeuille répond HTTP 409 « not a wallet » ;
 * - une adresse illisible répond HTTP 422 ;
 * - `transactionsByMessage` accepte le hachage du message tel qu'envoyé OU
 *   normalisé (TEP-467), en base64 comme en hexadécimal ;
 * - `estimateFee` n'inclut PAS les frais d'acheminement des messages sortants
 *   (`fwd_fee` à 0) — voir la marge ajoutée par l'adaptateur.
 *
 * ## Une requête par seconde
 *
 * Sans clé, TON Center limite à une requête par seconde PAR ADRESSE IP. Les
 * appels sont donc espacés au niveau du MODULE (et non de l'instance : deux
 * adaptateurs, principal et test, partagent la même IP), et un HTTP 429 est
 * retenté avec un délai croissant.
 */
import { WalletError } from '../../errors';
import type { TonWalletVersion } from './tonWallet';

export type TonAccountStatus = 'active' | 'uninit' | 'frozen' | 'nonexist';

export interface TonAccountState {
  status: TonAccountStatus;
  balance: bigint;
  /** Le compte a déjà eu au moins une transaction. */
  used: boolean;
  /** Type de contrat tel que TON Center le nomme (« wallet v5 r1 »), si c'est un portefeuille déployé. */
  walletType?: string;
  /** Version reconnue, parmi celles que Kalyx sait signer. */
  version?: TonWalletVersion;
  seqno?: number;
  /** Compte actif, mais qui n'est PAS un portefeuille : un contrat. */
  notWallet?: boolean;
}

/** Sous-ensemble d'une transaction v3, tel que relevé. */
export interface TonCenterTx {
  hash: string;
  now: number;
  total_fees?: string;
  description: {
    aborted?: boolean;
    compute_ph?: { success?: boolean | null; exit_code?: number | null; skipped?: boolean; reason?: string | null };
    action?: { success?: boolean; no_funds?: boolean; result_code?: number; skipped_actions?: number } | null;
  };
  in_msg?: TonCenterMsg | null;
  out_msgs?: TonCenterMsg[];
}

export interface TonCenterMsg {
  hash?: string;
  hash_norm?: string;
  source?: string | null;
  destination?: string | null;
  value?: string | null;
  bounced?: boolean | null;
  message_content?: { decoded?: { type?: string; comment?: string } | null } | null;
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>;

const WALLET_TYPES: Record<string, TonWalletVersion> = {
  'wallet v5 r1': 'v5r1',
  'wallet v4 r2': 'v4r2',
  'wallet v3 r2': 'v3r2',
};

/** Prochain créneau libre, par hôte : la limite est par IP, pas par instance. */
const nextSlot = new Map<string, number>();

export class TonCenterClient {
  constructor(
    /** Racine de l'API, sans version : `https://toncenter.com/api`. */
    private readonly base: string,
    private readonly fetchFn: FetchLike = (u, i) => fetch(u, i),
    private readonly minIntervalMs = 1100,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async throttle(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const host = new URL(this.base).host;
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + this.minIntervalMs);
    if (slot > now) await this.sleep(slot - now);
  }

  /**
   * Requête, avec reprise sur HTTP 429 (la requête n'a pas été traitée, la
   * reprendre est sans risque). Une erreur réseau n'est reprise QUE pour une
   * lecture : rediffuser un message déjà parti ferait lire son refus (seqno
   * consommé) comme un échec, alors que la transaction est passée.
   */
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any }> {
    const url = `${this.base}${path}`;
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      let res: { status: number; text(): Promise<string> };
      try {
        res = await this.fetchFn(url, method === 'POST'
          ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : { method });
      } catch (e) {
        if (method === 'GET' && attempt < 2) { await this.sleep(1000 * (attempt + 1)); continue; }
        throw new WalletError('RPC_UNAVAILABLE', `TON Center injoignable : ${e instanceof Error ? e.message : String(e)}`);
      }
      if (res.status === 429 && attempt < 3) { await this.sleep(1200 * (attempt + 1)); continue; }
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { error: text.slice(0, 200) }; }
      return { status: res.status, json };
    }
  }

  /** État d'un compte : portefeuille (version, seqno) ou contrat, déployé ou non. */
  async accountState(address: string): Promise<TonAccountState> {
    const q = encodeURIComponent(address);
    const w = await this.call('GET', `/v3/walletInformation?address=${q}&use_v2=false`);
    if (w.status === 200 && w.json) {
      const j = w.json;
      const walletType: string | undefined = j.wallet_type ?? undefined;
      return {
        status: (j.status ?? 'uninit') as TonAccountStatus,
        balance: BigInt(j.balance ?? '0'),
        used: (j.last_transaction_lt ?? '0') !== '0',
        walletType,
        version: walletType ? WALLET_TYPES[walletType] : undefined,
        seqno: typeof j.seqno === 'number' ? j.seqno : undefined,
      };
    }
    if (w.status === 409) {
      // Actif, mais pas un portefeuille : on lit l'état brut du compte.
      const a = await this.call('GET', `/v3/account?address=${q}`);
      if (a.status !== 200 || !a.json) throw new WalletError('RPC_UNAVAILABLE', `TON Center : compte illisible (HTTP ${a.status})`);
      return {
        status: (a.json.status ?? 'active') as TonAccountStatus,
        balance: BigInt(a.json.balance ?? '0'),
        used: (a.json.last_transaction_lt ?? '0') !== '0',
        notWallet: true,
      };
    }
    if (w.status === 422) throw new WalletError('INVALID_ADDRESS', 'Adresse TON refusée par TON Center');
    throw new WalletError('RPC_UNAVAILABLE', `TON Center : HTTP ${w.status} ${String(w.json?.error ?? '').slice(0, 120)}`);
  }

  /**
   * Frais estimés par le nœud (entrée, stockage, calcul), en nanotons. Corps
   * signé par des zéros, `ignore_chksig` : aucune clé n'est nécessaire.
   */
  async estimateFee(address: string, bodyBoc: string): Promise<bigint> {
    const r = await this.call('POST', '/v2/estimateFee', { address, body: bodyBoc, ignore_chksig: true });
    const f = r.json?.result?.source_fees;
    if (r.status !== 200 || !r.json?.ok || !f) {
      throw new WalletError('RPC_UNAVAILABLE', `Estimation des frais impossible (HTTP ${r.status})`);
    }
    return [f.in_fwd_fee, f.storage_fee, f.gas_fee, f.fwd_fee].reduce((s: bigint, v: unknown) => s + BigInt(Number(v) || 0), 0n);
  }

  /** Diffuse un message externe (BOC base64). */
  async sendBoc(boc: string): Promise<{ messageHash?: string; messageHashNorm?: string }> {
    const r = await this.call('POST', '/v3/message', { boc });
    if (r.status !== 200) {
      throw new WalletError('BROADCAST_FAILED', `TON : diffusion refusée (HTTP ${r.status}) ${String(r.json?.error ?? '').slice(0, 160)}`);
    }
    return { messageHash: r.json?.message_hash, messageHashNorm: r.json?.message_hash_norm };
  }

  /** Transactions déclenchées par un message (hachage hex ou base64, brut ou normalisé). */
  async transactionsByMessage(msgHash: string): Promise<TonCenterTx[]> {
    const r = await this.call('GET', `/v3/transactionsByMessage?msg_hash=${encodeURIComponent(msgHash)}&direction=in&limit=5`);
    if (r.status !== 200) throw new WalletError('RPC_UNAVAILABLE', `TON Center : HTTP ${r.status}`);
    return (r.json?.transactions ?? []) as TonCenterTx[];
  }

  /** Dernières transactions d'un compte, et le carnet d'adresses (brute → conviviale). */
  async transactions(address: string, limit = 25): Promise<{ transactions: TonCenterTx[]; addressBook: Record<string, { user_friendly?: string }> }> {
    const r = await this.call('GET', `/v3/transactions?account=${encodeURIComponent(address)}&limit=${limit}&sort=desc`);
    if (r.status !== 200) throw new WalletError('RPC_UNAVAILABLE', `TON Center : HTTP ${r.status}`);
    return { transactions: (r.json?.transactions ?? []) as TonCenterTx[], addressBook: r.json?.address_book ?? {} };
  }
}
