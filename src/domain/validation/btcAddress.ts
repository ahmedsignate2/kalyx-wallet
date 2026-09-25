/**
 * Validation d'adresses Bitcoin (mainnet) — TOUS les formats en circulation.
 *
 * Couvre :
 * - `1…`  P2PKH  (base58check, version 0x00) — le format historique ;
 * - `3…`  P2SH   (base58check, version 0x05) — multisig, et SegWit enveloppé,
 *          format encore massivement utilisé par les plateformes d'échange ;
 * - `bc1q…` P2WPKH / P2WSH (bech32, témoin v0) ;
 * - `bc1p…` P2TR (bech32m, témoin v1+).
 *
 * TROU CORRIGÉ. La version précédente refusait tout ce qui ne commençait pas
 * par `bc1` : « l'app ne génère que du bech32 ; l'envoi BTC viendra plus tard ».
 * Sauf que l'envoi BTC est arrivé, et pas cette ligne. Conséquence : impossible
 * d'envoyer vers une adresse `1…` ou `3…` — donc vers une bonne partie des
 * adresses de dépôt des plateformes et vers tout portefeuille un peu ancien.
 * L'utilisateur voyait « Adresse Bitcoin invalide » sur une adresse
 * parfaitement valide, sans aucun moyen de comprendre pourquoi.
 *
 * Ce que Kalyx GÉNÈRE reste du bech32 P2WPKH : il s'agit ici de savoir vers
 * quoi on peut ENVOYER, ce qui est une tout autre question.
 */
import { bech32, bech32m, base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { WalletError } from '../errors';

const base58 = base58check(sha256);

/** Octets de version base58check, réseau principal uniquement. */
const P2PKH_VERSION = 0x00;
const P2SH_VERSION = 0x05;

/**
 * Type de script verrouillant une adresse.
 *
 * Utile au-delà de la validation : la taille d'une sortie dépend du type, et
 * les frais se calculent sur cette taille (cf. `OUTPUT_VBYTES` dans btcTx).
 */
export type BtcAddressKind = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr';

export interface BtcAddressCheck {
  valid: boolean;
  reason?: 'EMPTY' | 'INVALID';
  /** Renseigné seulement si `valid`. */
  kind?: BtcAddressKind;
}

/** Décodage base58check d'une adresse héritée (`1…` / `3…`). */
function checkBase58(addr: string): BtcAddressCheck {
  let decoded: Uint8Array;
  try {
    decoded = base58.decode(addr);
  } catch {
    return { valid: false, reason: 'INVALID' };
  }
  // version (1 octet) + hash160 (20 octets), rien d'autre.
  if (decoded.length !== 21) return { valid: false, reason: 'INVALID' };
  if (decoded[0] === P2PKH_VERSION) return { valid: true, kind: 'p2pkh' };
  if (decoded[0] === P2SH_VERSION) return { valid: true, kind: 'p2sh' };
  // Versions testnet (0x6f, 0xc4) comprises : l'app est mainnet uniquement, et
  // accepter une adresse testnet enverrait des fonds réels dans le vide.
  return { valid: false, reason: 'INVALID' };
}

/** Décodage bech32 / bech32m d'une adresse SegWit (`bc1…`). */
function checkBech32(lower: string): BtcAddressCheck {
  // v0 = bech32, v1+ = bech32m. On essaie le codec adéquat.
  for (const codec of [bech32, bech32m] as const) {
    try {
      const decoded = codec.decode(lower as `bc1${string}`);
      if (decoded.prefix !== 'bc') continue;
      const version = decoded.words[0];
      const program = codec.fromWords(decoded.words.slice(1));
      if (codec === bech32 && version === 0) {
        if (program.length === 20) return { valid: true, kind: 'p2wpkh' };
        if (program.length === 32) return { valid: true, kind: 'p2wsh' };
        continue;
      }
      if (codec === bech32m && version >= 1 && version <= 16) {
        if (program.length < 2 || program.length > 40) continue;
        // v1 + 32 octets = Taproot. Les versions supérieures ne sont pas encore
        // définies : on les accepte comme sorties opaques, ce que prévoit BIP-350.
        return { valid: true, kind: version === 1 && program.length === 32 ? 'p2tr' : 'p2wsh' };
      }
    } catch {
      /* mauvais codec / checksum : on tente l'autre puis on rejette */
    }
  }
  return { valid: false, reason: 'INVALID' };
}

export function checkBtcAddress(input: string): BtcAddressCheck {
  const addr = (input ?? '').trim();
  if (addr.length === 0) return { valid: false, reason: 'EMPTY' };

  /*
   * Le bech32 est insensible à la casse, le base58 NON : `1A1z…` et `1a1z…`
   * sont deux chaînes différentes, dont une seule a un checksum valide. On ne
   * normalise donc la casse que pour la branche bech32.
   */
  const lower = addr.toLowerCase();
  if (lower.startsWith('bc1')) {
    // Casse mixte interdite par BIP-173 : elle rend le checksum ambigu.
    if (addr !== lower && addr !== addr.toUpperCase()) return { valid: false, reason: 'INVALID' };
    return checkBech32(lower);
  }
  return checkBase58(addr);
}

export function isValidBtcAddress(input: string): boolean {
  return checkBtcAddress(input).valid;
}

/** Type de script d'une adresse valide, sinon null. */
export function btcAddressKind(input: string): BtcAddressKind | null {
  return checkBtcAddress(input).kind ?? null;
}

/**
 * Forme canonique d'une adresse : bech32 en minuscules, base58 INTACT.
 *
 * Les générateurs de QR encodent le bech32 en majuscules (le QR est plus
 * dense), et le signeur attend la forme minuscule. Mais appliquer ce même
 * `toLowerCase()` à une adresse `1…` ou `3…` la détruit — c'est exactement ce
 * que faisait le parseur d'URI de paiement.
 */
export function normalizeBtcAddress(input: string): string {
  const addr = (input ?? '').trim();
  return addr.toLowerCase().startsWith('bc1') ? addr.toLowerCase() : addr;
}

export function assertValidBtcAddress(input: string): string {
  const addr = normalizeBtcAddress(input);
  if (!isValidBtcAddress(addr)) {
    throw new WalletError('INVALID_ADDRESS', 'Adresse Bitcoin invalide');
  }
  return addr;
}
