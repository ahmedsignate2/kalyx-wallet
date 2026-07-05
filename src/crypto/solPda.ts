/**
 * Adresses dérivées de programme (PDA) et comptes de tokens associés (ATA) Solana.
 *
 * Un ATA est le compte SPL déterministe d'un (propriétaire, mint). Il faut le
 * dériver pour envoyer un token SPL. Algorithme canonique (identique à
 * @solana/web3.js findProgramAddress) : on cherche le plus grand « bump » tel
 * que sha256(seeds || bump || programId || "ProgramDerivedAddress") NE soit PAS
 * un point ed25519 valide (donc hors-courbe = sans clé privée).
 */
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';

const PDA_MARKER = utf8ToBytes('ProgramDerivedAddress');
const TOKEN_PROGRAM = base58.decode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM = base58.decode('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/** true si les 32 octets sont un point ed25519 valide (donc SUR la courbe). */
export function isOnCurve(point: Uint8Array): boolean {
  try {
    ed25519.Point.fromHex(point);
    return true;
  } catch {
    return false;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Dérive une PDA (adresse + bump) pour des seeds et un programId (32 octets). */
export function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): { address: Uint8Array; bump: number } {
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(concat([...seeds, Uint8Array.of(bump), programId, PDA_MARKER]));
    if (!isOnCurve(hash)) return { address: hash, bump };
  }
  throw new Error('Aucune PDA trouvée (impossible)');
}

/**
 * Adresse du compte de token associé (ATA) pour (owner, mint), en base58.
 * seeds = [owner, TokenProgram, mint], program = AssociatedTokenProgram.
 */
export function getAssociatedTokenAddress(mint: string, owner: string): string {
  const ownerKey = base58.decode(owner);
  const mintKey = base58.decode(mint);
  if (ownerKey.length !== 32 || mintKey.length !== 32) throw new Error('owner/mint invalide (32 octets attendus)');
  const { address } = findProgramAddress([ownerKey, TOKEN_PROGRAM, mintKey], ASSOCIATED_TOKEN_PROGRAM);
  return base58.encode(address);
}
