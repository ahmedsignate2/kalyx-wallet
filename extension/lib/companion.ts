/**
 * MODE COMPAGNON — le lien WalletConnect avec l'app Kalyx du téléphone.
 *
 * L'extension PROPOSE une session (QR) ; le téléphone l'accepte et partage les
 * adresses de son compte actif. Ensuite, chaque signature d'un site ou envoi
 * est transmis au téléphone, qui affiche la demande et la fait valider.
 * Aucune clé, aucune phrase n'existe sur l'ordinateur pour ces comptes.
 *
 * Service worker MV3 : la connexion au relais WalletConnect garde le worker
 * en vie pendant les échanges (Chrome 116+) ; en attente d'une validation, un
 * appel léger toutes les 20 s le garde éveillé tant que la demande court.
 */
import type { WalletMeta, Wallets } from './wallets';
import { companionWallets, proposal, type PhoneWallet } from './companionCore';
import { RpcError } from './rpcError';
import { listChains } from '../../src/domain/chains/registry';

// Remplacé au build (wxt.config.ts : define de process.env) ; vide → mode compagnon indisponible.
const PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '';
const METADATA = {
  name: 'Kalyx — extension',
  description: 'Extension Kalyx en mode compagnon : les clés restent sur le téléphone.',
  url: 'https://kalyxwallet.com',
  icons: ['https://kalyxwallet.com/icon.png'],
};
/** Validation sur le téléphone : au-delà, la demande expire des deux côtés (jamais signée en retard). */
export const PHONE_TIMEOUT_MS = 5 * 60_000;
const PAIRING_TIMEOUT_MS = 5 * 60_000;
/** Relais WalletConnect injoignable : on le dit au lieu d'un QR qui ne vient jamais. */
const RELAY_TIMEOUT_MS = 20_000;

/** Le strict nécessaire du client WalletConnect (remplaçable dans les tests). */
export interface WcClient {
  connect(p: ReturnType<typeof proposal>): Promise<{ uri?: string; approval: () => Promise<{ topic: string; namespaces: Record<string, { accounts?: string[] }>; sessionProperties?: Record<string, unknown>; peer?: { metadata?: { name?: string; url?: string } } }> }>;
  /** `kalyxSite` : champ en plus, transmis tel quel par WalletConnect, lu par l'app Kalyx. */
  request<T>(a: { topic: string; chainId: string; request: { method: string; params: unknown; expiryTimestamp?: number; kalyxSite?: string } }): Promise<T>;
  disconnect(a: { topic: string; reason: { code: number; message: string } }): Promise<void>;
  on(event: 'session_delete' | 'session_expire', fn: (e: { topic: string }) => void): void;
  session: { getAll(): { topic: string; namespaces?: Record<string, { chains?: string[]; methods?: string[] }> }[] };
}

/** Le signe de vie part pour 6 h : le téléphone le reçoit à son prochain passage en ligne dans ce délai. */
export const HEARTBEAT_TTL_MS = 6 * 3_600_000;

async function defaultClient(metadata: typeof METADATA = METADATA): Promise<WcClient> {
  if (!PROJECT_ID) throw new RpcError(4900, 'COMPANION_UNAVAILABLE');
  const { default: SignClient } = await import('@walletconnect/sign-client');
  return (await SignClient.init({ projectId: PROJECT_ID, metadata })) as unknown as WcClient;
}

const withTimeout = <T>(p: Promise<T>, ms: number, code: string) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new RpcError(4001, code)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

/**
 * Téléphone qui vient d'accepter le QR, PAS ENCORE enregistré : l'utilisateur
 * confirme d'abord que c'est le sien (appareil et adresses affichés). Sans
 * cette étape, quiconque scanne le QR (partage d'écran, regard par-dessus
 * l'épaule) ferait passer SES adresses pour celles de l'utilisateur — qui
 * recevrait alors ses fonds chez lui.
 */
export interface CompanionCandidate {
  topic: string;
  /** Tous les portefeuilles du téléphone, avec leurs comptes. */
  wallets: PhoneWallet[];
  /** Premier compte (aperçu à l'écran de confirmation). */
  evm?: string;
  solana?: string;
  bitcoin?: string;
  evmChains: number[];
  peer: { name: string; url: string };
}
/** Délai pour confirmer ; au-delà, la liaison est coupée. */
const CONFIRM_TIMEOUT_MS = 3 * 60_000;

/** `metadata` : l'identité montrée au téléphone (l'extension, ou le tableau de bord web). */
export function makeCompanion(wallets: Wallets, opts: { client?: () => Promise<WcClient>; keepAlive?: () => void; metadata?: typeof METADATA } = {}) {
  let clientP: Promise<WcClient> | null = null;
  let pairing: Promise<CompanionCandidate> | null = null;
  let pending: { c: CompanionCandidate; label: string; timer: ReturnType<typeof setTimeout> } | null = null;

  const client = () => {
    clientP ??= (opts.client ?? (() => defaultClient(opts.metadata)))().then((c) => {
      // Session coupée depuis le téléphone (ou expirée) : le portefeuille compagnon le sait.
      const gone = (e: { topic: string }) => void wallets.markCompanionLost(e.topic).catch(() => {});
      c.on('session_delete', gone);
      c.on('session_expire', gone);
      return c;
    });
    clientP.catch(() => (clientP = null));
    return clientP;
  };

  /** Le QR à montrer ; l'accord du téléphone arrive ensuite (`wait`). */
  async function start(label: string): Promise<{ uri: string }> {
    const c = await withTimeout(client(), RELAY_TIMEOUT_MS, 'COMPANION_OFFLINE');
    const evmIds = listChains().filter((ch) => ch.family === 'evm' && !ch.testnet && ch.evmChainId).map((ch) => ch.evmChainId!);
    const { uri, approval } = await withTimeout(c.connect(proposal(evmIds)), RELAY_TIMEOUT_MS, 'COMPANION_OFFLINE');
    if (!uri) throw new RpcError(-32603, 'COMPANION_NO_URI');
    if (pending) void drop(pending.c.topic);
    pairing = withTimeout(approval(), PAIRING_TIMEOUT_MS, 'COMPANION_PAIRING_TIMEOUT').then(async (s) => {
      let acc: ReturnType<typeof companionWallets>;
      try {
        acc = companionWallets(s.namespaces, s.sessionProperties);
      } catch (e) {
        await c.disconnect({ topic: s.topic, reason: { code: 6000, message: 'Comptes illisibles' } }).catch(() => {});
        throw e;
      }
      if (!acc.wallets.length) {
        await c.disconnect({ topic: s.topic, reason: { code: 6000, message: 'Aucun compte partagé' } }).catch(() => {});
        throw new RpcError(4100, 'COMPANION_NO_ACCOUNT');
      }
      const meta = s.peer?.metadata ?? {};
      const peer = { name: String(meta.name ?? '').slice(0, 60), url: String(meta.url ?? '').slice(0, 120) };
      const first = acc.wallets[0].accounts[0];
      const cand: CompanionCandidate = { topic: s.topic, wallets: acc.wallets, evm: first?.evm, solana: first?.solana, bitcoin: first?.bitcoin, evmChains: acc.evmChains, peer };
      pending = { c: cand, label, timer: setTimeout(() => void drop(cand.topic), CONFIRM_TIMEOUT_MS) };
      return cand;
    });
    pairing.catch(() => {});
    return { uri };
  }

  async function drop(topic: string) {
    if (pending?.c.topic === topic) {
      clearTimeout(pending.timer);
      pending = null;
    }
    const c = await client().catch(() => null);
    await c?.disconnect({ topic, reason: { code: 6000, message: 'Liaison refusée dans l’extension' } }).catch(() => {});
  }

  /** L'utilisateur a vu l'appareil et les adresses : enregistrer (c'est le sien), ou couper. */
  async function confirm(topic: string, accept: boolean): Promise<WalletMeta[] | null> {
    if (!pending || pending.c.topic !== topic) throw new RpcError(4100, 'COMPANION_PAIRING_TIMEOUT');
    const { c, label, timer } = pending;
    clearTimeout(timer);
    pending = null;
    if (!accept) {
      await drop(topic);
      return null;
    }
    return wallets.addCompanion({ topic: c.topic, wallets: c.wallets, evmChains: c.evmChains, label });
  }

  /** Attend l'accord du téléphone (ou son refus, ou l'expiration du QR). Rien n'est enregistré avant `confirm`. */
  async function wait(): Promise<CompanionCandidate> {
    if (!pairing) throw new RpcError(-32603, 'COMPANION_NOT_STARTED');
    const keep = setInterval(() => opts.keepAlive?.(), 20_000);
    try {
      return await pairing;
    } finally {
      clearInterval(keep);
      pairing = null;
    }
  }

  /** Une demande transmise au téléphone ; il l'affiche et la fait valider. */
  async function request<T>(meta: WalletMeta, chainId: string, method: string, params: unknown, site?: string): Promise<T> {
    if (meta.kind !== 'companion' || !meta.topic) throw new RpcError(-32603, 'COMPANION_NOT_LINKED');
    if (meta.lost) throw new RpcError(4100, 'COMPANION_LOST');
    const c = await client();
    if (!c.session.getAll().some((s) => s.topic === meta.topic)) {
      await wallets.markCompanionLost(meta.topic).catch(() => {});
      throw new RpcError(4100, 'COMPANION_LOST');
    }
    const keep = setInterval(() => opts.keepAlive?.(), 20_000);
    try {
      const expiryTimestamp = Math.floor((Date.now() + PHONE_TIMEOUT_MS) / 1000);
      return await withTimeout(c.request<T>({ topic: meta.topic, chainId, request: { method, params, expiryTimestamp, ...(site ? { kalyxSite: site } : {}) } }), PHONE_TIMEOUT_MS + 5_000, 'COMPANION_TIMEOUT');
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      // Refus sur le téléphone : même code qu'un refus dans l'extension (4001).
      if (/reject|refus|denied|cancel/i.test(msg)) throw new RpcError(4001, 'COMPANION_REJECTED');
      throw e;
    } finally {
      clearInterval(keep);
    }
  }

  /** Délier : la session est fermée des deux côtés. */
  async function unlink(meta: WalletMeta): Promise<void> {
    if (!meta.topic) return;
    const c = await client().catch(() => null);
    await c?.disconnect({ topic: meta.topic, reason: { code: 6000, message: 'Déliée depuis l’extension' } }).catch(() => {});
  }

  /** Réinitialisation de l'extension : chaque session encore ouverte est fermée côté téléphone (au mieux, en 5 s max). */
  async function unlinkAll(): Promise<void> {
    if (!PROJECT_ID && !opts.client) return;
    const c = await withTimeout(client(), 5_000, 'COMPANION_OFFLINE').catch(() => null);
    if (!c) return;
    const all = c.session.getAll().map((s) => c.disconnect({ topic: s.topic, reason: { code: 6000, message: 'Extension réinitialisée' } }).catch(() => {}));
    await withTimeout(Promise.all(all), 5_000, 'COMPANION_OFFLINE').catch(() => {});
  }

  /**
   * SIGNE DE VIE vers chaque téléphone relié (démarrage du navigateur, puis
   * toutes les 3 h). Sans lui, le téléphone ne pouvait pas savoir si
   * l'extension existait encore : une extension supprimée restait affichée
   * « connectée » jusqu'à l'expiration de la session (7 jours).
   * Au passage, le client relit les sessions : une liaison coupée depuis le
   * téléphone est marquée « à relier » ici aussi.
   * `kalyx_ping` n'existe que dans les liaisons récentes ; les anciennes n'en reçoivent pas.
   */
  async function heartbeat(): Promise<number> {
    const linked = (await wallets.list()).filter((w) => w.kind === 'companion' && w.topic && !w.lost);
    if (!linked.length || (!PROJECT_ID && !opts.client)) return 0;
    const c = await withTimeout(client(), RELAY_TIMEOUT_MS, 'COMPANION_OFFLINE').catch(() => null);
    if (!c) return 0;
    const open = new Map(c.session.getAll().map((x) => [x.topic, x]));
    let sent = 0;
    for (const topic of new Set(linked.map((w) => w.topic!))) {
      const sess = open.get(topic);
      if (!sess) {
        await wallets.markCompanionLost(topic).catch(() => {});
        continue;
      }
      const evm = sess.namespaces?.eip155;
      const chainId = evm?.chains?.[0];
      if (!chainId || !evm?.methods?.includes('kalyx_ping')) continue;
      const expiryTimestamp = Math.floor((Date.now() + HEARTBEAT_TTL_MS) / 1000);
      // Sans attendre la réponse : le téléphone peut être hors ligne ; le relais garde le message.
      void c.request({ topic, chainId, request: { method: 'kalyx_ping', params: [], expiryTimestamp } }).catch(() => {});
      sent++;
    }
    return sent;
  }

  return { available: () => !!PROJECT_ID || !!opts.client, start, wait, confirm, request, unlink, unlinkAll, heartbeat };
}

export type Companion = ReturnType<typeof makeCompanion>;
