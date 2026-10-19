/**
 * DEMANDES EN ATTENTE D'UNE DÉCISION — et leur fenêtre.
 *
 * Une demande d'un site s'affiche dans une FENÊTRE SÉPARÉE de l'extension,
 * jamais par-dessus la page : un site ne peut ni la recouvrir, ni l'imiter, ni
 * cliquer à la place de l'utilisateur. Fermer la fenêtre vaut refus.
 *
 * Contre l'inondation : une demande identique (même site, même objet) déjà en
 * attente n'en ouvre pas une deuxième, et un site n'a que quelques demandes en
 * attente à la fois.
 */
import { RpcError } from './rpcError';
import type { Family } from './sites';

export interface ApprovalRequest {
  id: string;
  origin: string;
  kind: 'connect';
  family: Family;
  createdAt: number;
}

export type Decision = { approve: false } | { approve: true; walletId: string; index: number };
type Grant = { walletId: string; index: number };

export interface ApprovalDeps {
  /** Ouvre la fenêtre d'une demande ; rend son identifiant de fenêtre. */
  open: (id: string) => Promise<number | undefined>;
  close: (windowId: number) => Promise<void>;
  now?: () => number;
}

const MAX_PER_ORIGIN = 3;
const MAX_TOTAL = 20;

export function makeApprovals(deps: ApprovalDeps) {
  const now = deps.now ?? Date.now;
  const pending = new Map<string, { req: ApprovalRequest; windowId?: number; promise: Promise<Grant>; resolve: (g: Grant) => void; reject: (e: unknown) => void }>();

  async function request(origin: string, kind: ApprovalRequest['kind'], family: Family): Promise<Grant> {
    for (const p of pending.values()) if (p.req.origin === origin && p.req.kind === kind && p.req.family === family) return p.promise;
    const mine = [...pending.values()].filter((p) => p.req.origin === origin).length;
    if (mine >= MAX_PER_ORIGIN || pending.size >= MAX_TOTAL) throw new RpcError(-32002, 'Une demande est déjà en attente dans Kalyx');
    const id = crypto.randomUUID();
    let resolve!: (g: Grant) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<Grant>((res, rej) => ((resolve = res), (reject = rej)));
    const entry = { req: { id, origin, kind, family, createdAt: now() }, promise, resolve, reject, windowId: undefined as number | undefined };
    pending.set(id, entry);
    try {
      entry.windowId = await deps.open(id);
    } catch {
      pending.delete(id);
      throw new RpcError(-32603, 'Fenêtre de Kalyx impossible à ouvrir');
    }
    return promise;
  }

  function settle(id: string, d: Decision) {
    const p = pending.get(id);
    if (!p) return false;
    pending.delete(id);
    if (d.approve) p.resolve({ walletId: d.walletId, index: d.index });
    else p.reject(new RpcError(4001, 'Refusé par l’utilisateur'));
    if (p.windowId !== undefined) void deps.close(p.windowId).catch(() => {});
    return true;
  }

  return {
    request,
    get: (id: string): ApprovalRequest | null => pending.get(id)?.req ?? null,
    respond: settle,
    /** Fenêtre fermée par l'utilisateur : ses demandes sont refusées. */
    windowClosed(windowId: number) {
      for (const [id, p] of pending) if (p.windowId === windowId) settle(id, { approve: false });
    },
    /** Le site s'est retiré (onglet fermé) : plus personne n'attend la réponse. */
    originGone(origin: string) {
      for (const [id, p] of pending) if (p.req.origin === origin) settle(id, { approve: false });
    },
    size: () => pending.size,
  };
}

export type Approvals = ReturnType<typeof makeApprovals>;
