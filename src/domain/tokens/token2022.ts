/**
 * Extension « frais de transfert » de Token-2022 (pur, testable).
 *
 * Un mint Token-2022 peut prélever un pourcentage sur CHAQUE transfert : le
 * programme retient le montant à l'arrivée, si bien que le destinataire reçoit
 * moins que ce qui a été envoyé. Sans en tenir compte, l'app annonce « tu
 * envoies 100 USDC » alors que 99,5 arrivent — un écart que l'utilisateur ne
 * découvre qu'en aval, et dont il conclut que le portefeuille a perdu la
 * différence.
 *
 * Le transfert lui-même fonctionne sans rien faire de particulier (le programme
 * retient tout seul) : ce qui manquait, c'est de le DIRE.
 */

/** Diviseur des points de base : 10 000 = 100 %. */
const BASIS_POINTS_DIVISOR = 10_000n;

export interface TransferFeeConfig {
  /** Prélèvement en points de base (100 = 1 %). */
  basisPoints: number;
  /** Plafond absolu en unités de base du jeton. */
  maximumFee: bigint;
}

interface RawFee {
  epoch?: unknown;
  maximumFee?: unknown;
  transferFeeBasisPoints?: unknown;
}

function toBigInt(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return BigInt(v.trim());
  return null;
}

function toEpoch(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function parseOne(raw: unknown): { epoch: number; config: TransferFeeConfig } | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as RawFee;
  const bp = toEpoch(f.transferFeeBasisPoints);
  const max = toBigInt(f.maximumFee);
  const epoch = toEpoch(f.epoch);
  if (bp === null || max === null || epoch === null) return null;
  if (bp > Number(BASIS_POINTS_DIVISOR)) return null; // > 100 % : donnée fausse
  return { epoch, config: { basisPoints: bp, maximumFee: max } };
}

/**
 * Extrait la configuration de frais applicable d'un `getAccountInfo` jsonParsed
 * sur le MINT, ou null si le mint n'en a pas.
 *
 * Deux barèmes cohabitent, `olderTransferFee` et `newerTransferFee`, et c'est
 * l'ÉPOQUE courante qui tranche : le nouveau barème ne s'applique qu'à partir de
 * son époque. Prendre systématiquement le plus récent annoncerait un
 * prélèvement qui n'est pas encore en vigueur.
 */
export function parseTransferFeeConfig(accountInfo: unknown, currentEpoch: number): TransferFeeConfig | null {
  const info = (accountInfo as { value?: { data?: { parsed?: { info?: { extensions?: unknown } } } } })?.value?.data
    ?.parsed?.info;
  const extensions = info?.extensions;
  if (!Array.isArray(extensions)) return null;

  const ext = extensions.find(
    (e) => e && typeof e === 'object' && (e as { extension?: unknown }).extension === 'transferFeeConfig',
  ) as { state?: { olderTransferFee?: unknown; newerTransferFee?: unknown } } | undefined;
  if (!ext?.state) return null;

  const older = parseOne(ext.state.olderTransferFee);
  const newer = parseOne(ext.state.newerTransferFee);

  if (newer && currentEpoch >= newer.epoch) return newer.config;
  if (older) return older.config;
  // Barème futur uniquement : rien n'est prélevé aujourd'hui.
  return newer ? { basisPoints: 0, maximumFee: 0n } : null;
}

/**
 * Montant retenu par le programme sur un transfert.
 *
 * Arrondi au SUPÉRIEUR et plafonné, comme le fait le programme. Arrondir vers le
 * bas afficherait un frais inférieur au réel, donc un montant reçu supérieur à
 * la réalité — l'erreur exactement dans le mauvais sens.
 */
export function transferFeeFor(amount: bigint, config: TransferFeeConfig | null): bigint {
  if (!config || amount <= 0n || config.basisPoints <= 0) return 0n;
  const bp = BigInt(config.basisPoints);
  const raw = (amount * bp + BASIS_POINTS_DIVISOR - 1n) / BASIS_POINTS_DIVISOR; // plafond
  return raw > config.maximumFee ? config.maximumFee : raw;
}

/** Montant qui arrivera réellement chez le destinataire. */
export function amountAfterTransferFee(amount: bigint, config: TransferFeeConfig | null): bigint {
  const fee = transferFeeFor(amount, config);
  return fee >= amount ? 0n : amount - fee;
}
