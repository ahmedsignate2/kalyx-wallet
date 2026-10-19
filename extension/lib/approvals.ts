/**
 * DEMANDES EN ATTENTE D'UNE DÉCISION — et leur fenêtre.
 *
 * Une demande d'un site s'affiche dans une FENÊTRE SÉPARÉE de l'extension,
 * jamais par-dessus la page : un site ne peut ni la recouvrir, ni l'imiter, ni
 * cliquer à la place de l'utilisateur. Fermer la fenêtre vaut refus.
 *
 * L'action (connecter, signer) s'exécute PENDANT que la fenêtre est ouverte :
 * si elle échoue (solde insuffisant, contrat qui refuse), l'erreur s'affiche
 * dans la fenêtre, et l'utilisateur peut réessayer ou refuser — au lieu d'une
 * fenêtre fermée et d'un échec que seule la page aurait vu.
 *
 * Contre l'inondation : une connexion identique déjà en attente n'ouvre pas
 * une deuxième fenêtre, et un site n'a que quelques demandes en attente.
 * Après un REFUS, le même site ne peut pas rouvrir la même sorte de demande
 * tout de suite : 10 s, puis le double à chaque refus (5 min au plus) — un
 * site qui harcèle jusqu'au clic par lassitude n'obtient plus de fenêtre.
 */
import { reasonOf, RpcError, toRpcError } from './rpcError';
import type { Family } from './sites';

export type ApprovalKind = 'connect' | 'sign';

export interface ApprovalRequest {
  id: string;
  origin: string;
  kind: ApprovalKind;
  family: Family;
  createdAt: number;
  /** Demande figée (signature) : ce qui sera signé. */
  payload?: unknown;
}

/** Choix de l'utilisateur dans la fenêtre. */
export interface Approved {
  walletId: string;
  index: number;
  /** Approbation réduite à ce montant (unités du jeton, texte). */
  reduceTo?: string;
}
export type Decision = { approve: false } | ({ approve: true } & Approved);

export interface ApprovalDeps {
  /** Ouvre la fenêtre d'une demande ; rend son identifiant de fenêtre. */
  open: (id: string) => Promise<number | undefined>;
  close: (windowId: number) => Promise<void>;
  now?: () => number;
}

const MAX_PER_ORIGIN = 3;
const MAX_TOTAL = 20;
const COOLDOWN_MS = 10_000;
const COOLDOWN_MAX_MS = 5 * 60_000;
/** Refus oubliés au bout de ce temps sans nouveau refus. */
const COOLDOWN_RESET_MS = 30 * 60_000;

interface Entry {
  req: ApprovalRequest;
  windowId?: number;
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  run: (a: Approved) => Promise<unknown>;
  busy: boolean;
}

export function makeApprovals(deps: ApprovalDeps) {
  const now = deps.now ?? Date.now;
  const pending = new Map<string, Entry>();
  /** Refus récents par site et sorte de demande. */
  const refusals = new Map<string, { count: number; until: number; last: number }>();
  const rkey = (origin: string, kind: ApprovalKind, family: Family) => `${kind}|${family}|${origin}`;
  function noteRefusal(r: ApprovalRequest) {
    const k = rkey(r.origin, r.kind, r.family);
    const prev = refusals.get(k);
    const count = prev && now() - prev.last < COOLDOWN_RESET_MS ? prev.count + 1 : 1;
    refusals.set(k, { count, last: now(), until: now() + Math.min(COOLDOWN_MAX_MS, COOLDOWN_MS * 2 ** (count - 1)) });
    if (refusals.size > 500) refusals.delete(refusals.keys().next().value!);
  }

  function close(id: string, e: Entry) {
    pending.delete(id);
    if (e.windowId !== undefined) void deps.close(e.windowId).catch(() => {});
  }

  /**
   * Ouvre une demande. `run` s'exécute à l'accord ; sa valeur est la réponse
   * rendue au site. Refus ou fenêtre fermée : 4001.
   */
  async function request<T>(origin: string, kind: ApprovalKind, family: Family, run: (a: Approved) => Promise<T>, payload?: unknown): Promise<T> {
    if (kind === 'connect') {
      for (const p of pending.values()) if (p.req.origin === origin && p.req.kind === 'connect' && p.req.family === family) return p.promise as Promise<T>;
    }
    const cool = refusals.get(rkey(origin, kind, family));
    if (cool && now() < cool.until) throw new RpcError(4001, 'Refusé récemment dans Kalyx : réessaie plus tard');
    const mine = [...pending.values()].filter((p) => p.req.origin === origin).length;
    if (mine >= MAX_PER_ORIGIN || pending.size >= MAX_TOTAL) throw new RpcError(-32002, 'Une demande est déjà en attente dans Kalyx');
    const id = crypto.randomUUID();
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => ((resolve = res), (reject = rej)));
    const entry: Entry = { req: { id, origin, kind, family, createdAt: now(), payload }, promise, resolve, reject, run, busy: false };
    pending.set(id, entry);
    try {
      entry.windowId = await deps.open(id);
    } catch {
      pending.delete(id);
      throw new RpcError(-32603, 'Fenêtre de Kalyx impossible à ouvrir');
    }
    return promise as Promise<T>;
  }

  /**
   * Décision de la fenêtre. Accord : l'action s'exécute ; réussie, le site
   * reçoit sa réponse et la fenêtre se ferme ; échouée, l'erreur revient à la
   * fenêtre, qui reste ouverte.
   */
  async function respond(id: string, d: Decision): Promise<{ ok: true } | { ok: false; error: { code: number; message: string }; reason?: string }> {
    const e = pending.get(id);
    if (!e) return { ok: false, error: { code: 4100, message: 'REQUEST_EXPIRED' } };
    if (!d.approve) {
      noteRefusal(e.req);
      close(id, e);
      e.reject(new RpcError(4001, 'Refusé par l’utilisateur'));
      return { ok: true };
    }
    if (e.busy) return { ok: false, error: { code: -32002, message: 'BUSY' } };
    e.busy = true;
    try {
      const result = await e.run({ walletId: d.walletId, index: d.index, reduceTo: d.reduceTo });
      refusals.delete(rkey(e.req.origin, e.req.kind, e.req.family));
      close(id, e);
      e.resolve(result);
      return { ok: true };
    } catch (err) {
      e.busy = false;
      const reason = reasonOf(err);
      return { ok: false, error: toRpcError(err), ...(reason ? { reason } : {}) };
    }
  }

  function refuseWhere(pred: (e: Entry) => boolean) {
    for (const [id, e] of pending) if (pred(e) && !e.busy) void respond(id, { approve: false });
  }

  return {
    request,
    get: (id: string): ApprovalRequest | null => pending.get(id)?.req ?? null,
    respond,
    /** Fenêtre fermée par l'utilisateur : ses demandes sont refusées. */
    windowClosed: (windowId: number) => refuseWhere((e) => e.windowId === windowId),
    /** Le site s'est retiré (onglet fermé) : plus personne n'attend la réponse. */
    originGone: (origin: string) => refuseWhere((e) => e.req.origin === origin),
    size: () => pending.size,
  };
}

export type Approvals = ReturnType<typeof makeApprovals>;
