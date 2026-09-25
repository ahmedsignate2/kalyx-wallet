/**
 * Signataire borné, remis à un adapter pour UNE opération.
 *
 * RÈGLE FONDATRICE : la phrase de récupération et la seed ne quittent JAMAIS
 * `lib/walletStore`. C'est lui qui les détient, lui qui dérive, et il ne passe
 * à l'adapter que le matériel strictement nécessaire à la signature demandée.
 *
 * L'alternative — donner la seed aux adapters pour qu'ils dérivent eux-mêmes —
 * aurait simplifié le store et préparé TON et Cosmos sans effort. Elle a été
 * écartée : elle répand le secret maître dans chaque adapter, donc dans chaque
 * chaîne future, écrite par qui que ce soit. Un `switch` par famille dans le
 * store est un coût de maintenance ; une seed qui circule est un coût de
 * sécurité, et les deux ne se comparent pas.
 *
 * Conséquence assumée : le store garde un aiguillage par famille
 * cryptographique. C'est une dizaine de lignes à étendre par chaîne ajoutée.
 */

/** Courbe utilisée pour signer. Dicte ce que le store doit dériver. */
export type SignerCurve = 'secp256k1' | 'ed25519';

/**
 * Matériel de signature secp256k1 — EVM, Bitcoin, et Cosmos le jour venu.
 *
 * En OCTETS et non en chaîne hexadécimale : une chaîne JavaScript est immuable
 * et ne peut pas être effacée de la mémoire, alors qu'un `Uint8Array` se remet
 * à zéro. Les adapters qui ont besoin d'hexadécimal (ethers) convertissent au
 * dernier moment.
 */
export interface Secp256k1Signer {
  curve: 'secp256k1';
  privateKey: Uint8Array;
  /** Clé publique COMPRESSÉE (33 octets). */
  publicKey: Uint8Array;
}

/** Matériel de signature ed25519 — Solana, et TON le jour venu. */
export interface Ed25519Signer {
  curve: 'ed25519';
  /** Graine privée 32 octets, ou clé étendue 64 octets selon la chaîne. */
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export type ChainSigner = Secp256k1Signer | Ed25519Signer;

/** Octets privés d'un signataire, quelle que soit sa courbe. */
function secretOf(signer: ChainSigner): Uint8Array {
  return signer.curve === 'secp256k1' ? signer.privateKey : signer.secretKey;
}

/**
 * Efface le matériel privé d'un signataire.
 *
 * Ne protège pas de tout — le ramasse-miettes a pu recopier le tampon — mais
 * réduit la fenêtre pendant laquelle la clé traîne en mémoire, ce qui compte sur
 * un appareil où d'autres processus peuvent lire un vidage mémoire.
 */
export function wipeSigner(signer: ChainSigner): void {
  secretOf(signer).fill(0);
}

/**
 * Exécute `fn` avec le signataire, et l'efface ENSUITE, succès ou échec.
 *
 * À préférer partout : c'est la seule forme qui garantit l'effacement sur le
 * chemin d'erreur, celui qu'on oublie toujours.
 */
export async function withSigner<T>(signer: ChainSigner, fn: (s: ChainSigner) => Promise<T>): Promise<T> {
  try {
    return await fn(signer);
  } finally {
    wipeSigner(signer);
  }
}

/**
 * Vérifie qu'un signataire correspond à la courbe attendue par l'adapter.
 *
 * Un contrôle de type suffirait au compilateur, pas à l'exécution : le store
 * choisit la dérivation d'après la famille de la chaîne, et une erreur
 * d'aiguillage produirait une signature valide sur la mauvaise courbe — donc
 * une transaction rejetée, ou signée par une clé qui n'est pas celle du compte
 * affiché.
 */
export function assertCurve<C extends SignerCurve>(
  signer: ChainSigner,
  curve: C,
): asserts signer is Extract<ChainSigner, { curve: C }> {
  if (signer.curve !== curve) {
    throw new Error(`Signataire ${signer.curve} fourni à une chaîne ${curve}`);
  }
}
