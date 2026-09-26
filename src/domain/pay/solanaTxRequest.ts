/**
 * Solana Pay — requêtes de TRANSACTION (`solana:https://…`).
 *
 * L'autre moitié de la spec, qui n'était pas gérée du tout : l'utilisateur
 * recevait « QR non reconnu ». Le déroulé est en deux temps — un GET pour
 * savoir qui demande, un POST qui rend une transaction DÉJÀ CONSTRUITE.
 *
 * C'EST LA DIFFÉRENCE QUI COMPTE. Dans un transfert, on construit la
 * transaction et on sait donc ce qu'elle fait. Ici, elle vient d'un serveur :
 * on ne signe pas ce qu'on a décidé, on signe ce qu'on nous a donné. Les
 * contrôles de ce module ne sont donc pas de la validation de formulaire, ils
 * sont la seule chose qui sépare un paiement d'un vidage de portefeuille.
 *
 * Pur : aucune dépendance au réseau, `fetch` est injecté.
 */

/** Ce que le marchand annonce avant qu'on lui donne quoi que ce soit. */
export interface TxRequestIdentity {
  label: string;
  /** URL d'icône, `https` uniquement. Absente si le serveur en donne une autre. */
  icon?: string;
}

/** Ce que le marchand renvoie à signer. */
export interface TxRequestPayload {
  /** Transaction sérialisée, en base64. */
  transaction: string;
  /** Texte à afficher avec la demande. Informatif, jamais vérifiable. */
  message?: string;
}

type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Au-delà, on abandonne : un terminal de paiement répond vite ou pas du tout. */
const TIMEOUT_MS = 10_000;

/**
 * Taille maximale acceptée pour une transaction encodée.
 *
 * Une transaction Solana tient dans 1 232 octets ; en base64 cela fait moins de
 * 1 700 caractères. Refuser au-delà évite qu'une réponse démesurée occupe la
 * mémoire avant même d'être décodée.
 */
const MAX_TX_BASE64 = 4_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  /*
   * Le minuteur est ANNULÉ dès que la promesse aboutit. Sans cela il reste
   * armé jusqu'à son échéance : sur une requête qui répond vite, c'est dix
   * secondes de minuteur inutile par appel — et en test, un processus qui
   * refuse de se terminer, ce qui est le symptôme de la même fuite.
   */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Délai dépassé')), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Chaîne non vide et raisonnablement courte, sinon undefined. */
function text(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t && t.length <= max ? t : undefined;
}

/**
 * Analyse la réponse du GET : qui demande le paiement.
 *
 * L'icône n'est retenue qu'en `https` : une URL en clair ou un `data:` affiché
 * dans l'interface ferait passer du contenu arbitraire pour l'identité d'un
 * marchand.
 */
export function parseTxRequestIdentity(json: unknown): TxRequestIdentity | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as { label?: unknown; icon?: unknown };
  const label = text(o.label, 120);
  if (!label) return null;
  const icon = text(o.icon, 2_000);
  return { label, icon: icon && /^https:\/\//i.test(icon) ? icon : undefined };
}

/** Analyse la réponse du POST : la transaction à signer. */
export function parseTxRequestPayload(json: unknown): TxRequestPayload | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as { transaction?: unknown; message?: unknown };
  const transaction = text(o.transaction, MAX_TX_BASE64);
  if (!transaction) return null;
  // Base64 strict : un contenu hors alphabet n'est pas une transaction.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(transaction)) return null;
  return { transaction, message: text(o.message, 300) };
}

/** Demande au marchand qui il est. Ne transmet RIEN sur l'utilisateur. */
export async function fetchTxRequestIdentity(
  url: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<TxRequestIdentity | null> {
  try {
    const res = await withTimeout(fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } }));
    if (!res.ok) return null;
    return parseTxRequestIdentity(await res.json());
  } catch {
    return null;
  }
}

/**
 * Envoie l'adresse du payeur et récupère la transaction.
 *
 * C'est le seul moment où l'on communique quelque chose de l'utilisateur, et
 * c'est ce que la spec prévoit : le marchand a besoin de l'adresse pour
 * construire la transaction. Rien d'autre ne sort.
 */
export async function fetchTxRequestPayload(
  url: string,
  account: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<TxRequestPayload | null> {
  try {
    const res = await withTimeout(
      fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ account }),
      }),
    );
    if (!res.ok) return null;
    return parseTxRequestPayload(await res.json());
  } catch {
    return null;
  }
}

/**
 * Raison d'un refus, sous forme de CODE.
 *
 * Pas une phrase : ce module ne connaît pas la langue de l'utilisateur, et les
 * messages qu'il portait en français sortaient tels quels quel que soit le
 * réglage. C'est la même faute que dans le magasin de Pay et dans
 * l'humanisation de l'historique.
 */
export type TxRequestRefusal =
  /** Transaction indéchiffrable : on ne signe pas ce qu'on ne sait pas lire. */
  | 'UNREADABLE'
  /** Aucun payeur de frais dans le message. */
  | 'NO_FEE_PAYER'
  /** Le payeur de frais n'est pas nous. */
  | 'NOT_YOUR_ACCOUNT'
  /** Un tiers doit encore signer : il choisirait quand l'opération s'exécute. */
  | 'THIRD_PARTY_PENDING';

export interface TxRequestCheck {
  ok: boolean;
  reason?: TxRequestRefusal;
}

/**
 * La transaction reçue est-elle signable sans danger ?
 *
 * Deux conditions, et elles ne sont pas décoratives :
 *
 * 1. **Nous devons être le PAYEUR DE FRAIS**, c'est-à-dire le compte n°0. Sur
 *    Solana, ce compte paie et signe ; s'il s'agissait de quelqu'un d'autre, on
 *    signerait une transaction dont on ne maîtrise ni le coût ni l'intention.
 * 2. **Aucune signature de TIERS ne doit rester à venir.**
 *
 * La seconde règle était trop large : elle refusait toute transaction à
 * plusieurs signataires. Or un terminal interactif co-signe légitimement — une
 * remise, un programme de fidélité — et sa signature est DÉJÀ posée quand il
 * nous envoie la transaction. Refuser ce cas, c'est refuser la moitié des
 * caisses que la spécification vise.
 *
 * Ce qui compte n'est pas le NOMBRE de signataires mais qu'aucune signature ne
 * MANQUE à part la nôtre : notre signature achève alors la transaction. S'il en
 * manque une autre, l'opération ne s'exécutera que lorsque ce tiers le décidera,
 * au moment qu'il choisira, et notre signature l'attendra jusque-là.
 *
 * Le décodage lui-même est fait par `describeSolanaTransaction`, qui sait déjà
 * lire un message et vérifier le payeur (il sert au chemin WalletConnect).
 */
export function checkTxRequest(
  description: { feePayer?: string; signerCount?: number; signaturesPresent?: boolean[] } | null,
  expectedAccount: string,
): TxRequestCheck {
  if (!description) return { ok: false, reason: 'UNREADABLE' };
  if (!description.feePayer) return { ok: false, reason: 'NO_FEE_PAYER' };
  if (description.feePayer !== expectedAccount) return { ok: false, reason: 'NOT_YOUR_ACCOUNT' };

  const signers = description.signerCount ?? 1;
  if (signers > 1) {
    /*
     * Le compte n°0 est le nôtre — vérifié juste au-dessus — et c'est celui que
     * nous allons signer. On n'examine donc que les emplacements 1..n-1.
     *
     * Sans la liste, on ne peut rien affirmer : on refuse, comme avant. Mieux
     * vaut bloquer un paiement légitime que signer une transaction dont un tiers
     * garderait la maîtrise du déclenchement.
     */
    const present = description.signaturesPresent;
    if (!present) return { ok: false, reason: 'THIRD_PARTY_PENDING' };
    for (let i = 1; i < signers; i++) {
      if (!present[i]) return { ok: false, reason: 'THIRD_PARTY_PENDING' };
    }
  }
  return { ok: true };
}
