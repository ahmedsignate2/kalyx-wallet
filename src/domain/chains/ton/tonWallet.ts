/**
 * TON — adresse d'un portefeuille à partir de sa clé publique.
 *
 * ## L'adresse n'est pas dérivée de la clé
 *
 * Sur TON, une adresse est le hachage de l'état initial d'un contrat :
 * `hash(StateInit(code, data))`. Le `code` est celui du contrat de portefeuille,
 * le `data` contient la clé publique et un identifiant de sous-portefeuille. La
 * même clé donne donc une adresse DIFFÉRENTE par version de contrat, et un fonds
 * reçu sur la v4R2 n'apparaît pas sur la W5.
 *
 * ## Quelle version
 *
 * - **W5 (`v5r1`) pour créer** : c'est le défaut de Tonkeeper dans toutes ses
 *   applications (mobile, web, extension, bureau, mini-app Telegram), relu dans
 *   son code. Une phrase Kalyx importée dans Tonkeeper y retrouve donc la même
 *   adresse.
 * - **v4R2 et v3R2 à relire à l'import** : ce sont les versions sur lesquelles
 *   dorment les fonds des portefeuilles créés avant la W5. Tonkeeper calcule
 *   aussi ces adresses à l'import. Sans elles, une phrase ancienne montrerait un
 *   compte vide.
 *
 * ## Ce que ce fichier calcule, et pourquoi sans dépendance
 *
 * Pour l'ADRESSE, le code du contrat n'intervient que par son hachage et sa
 * profondeur : la cellule `StateInit` référence le code, elle ne le contient pas.
 * Deux constantes par version suffisent donc — relevées dans `@ton/core`, et
 * vérifiées par les tests contre les adresses que `@ton/ton` calcule pour les
 * mêmes clés. Le code complet ne sera nécessaire qu'au DÉPLOIEMENT (premier
 * envoi), qui reste à écrire.
 */
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes } from '@noble/hashes/utils';
import type { TonAddress } from './tonAddress';

export type TonWalletVersion = 'v5r1' | 'v4r2' | 'v3r2';

/** Version créée par Kalyx : celle de Tonkeeper. */
export const TON_DEFAULT_WALLET_VERSION: TonWalletVersion = 'v5r1';

/** Versions dont on calcule l'adresse à l'import, la plus récente d'abord. */
export const TON_IMPORT_WALLET_VERSIONS: readonly TonWalletVersion[] = ['v5r1', 'v4r2', 'v3r2'];

/** Hachage de représentation et profondeur de la cellule de code de chaque contrat. */
const CODE: Record<TonWalletVersion, { hash: Uint8Array; depth: number }> = {
  v5r1: { hash: hexToBytes('20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f'), depth: 6 },
  v4r2: { hash: hexToBytes('feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0'), depth: 7 },
  v3r2: { hash: hexToBytes('84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599'), depth: 0 },
};

/** `subwallet_id` par défaut des v3/v4 : 698983191, soit `0x29A9A317`. */
export const TON_DEFAULT_SUBWALLET_ID = 698983191;

/** Identifiant global du réseau, qui entre dans le `wallet_id` de la W5. */
const NETWORK_GLOBAL_ID = { mainnet: -239, testnet: -3 } as const;

/**
 * `wallet_id` de la W5 : `network_global_id XOR contexte`, où le contexte
 * « client » vaut `[1][workchain:8][version:8][sous-portefeuille:15]` sur 32 bits.
 * Recopié de `storeWalletIdV5R1` (`@ton/ton`). Sur le réseau principal, workchain
 * 0, sous-portefeuille 0 : 2147483409. Le réseau de test donne un AUTRE
 * `wallet_id`, donc une autre adresse — contrairement aux v3/v4.
 */
export function tonW5WalletId(opts: { testnet?: boolean; workchain?: number; subwallet?: number } = {}): number {
  const workchain = opts.workchain ?? 0;
  const subwallet = opts.subwallet ?? 0;
  if (!Number.isInteger(subwallet) || subwallet < 0 || subwallet > 0x7fff) throw new Error('Sous-portefeuille W5 hors limites');
  const context = (1 << 31) | ((workchain & 0xff) << 23) | ((0 /* v5r1 */ & 0xff) << 15) | subwallet;
  const network = opts.testnet ? NETWORK_GLOBAL_ID.testnet : NETWORK_GLOBAL_ID.mainnet;
  return (network ^ context) >>> 0;
}

/** Tampon de bits minimal : juste ce qu'il faut pour les cellules de ce fichier. */
class Bits {
  private readonly bytes: number[] = [];
  length = 0;
  bit(b: 0 | 1): this {
    if (this.length % 8 === 0) this.bytes.push(0);
    if (b) this.bytes[this.bytes.length - 1] |= 0x80 >> this.length % 8;
    this.length++;
    return this;
  }
  uint(value: number, n: number): this {
    for (let i = n - 1; i >= 0; i--) this.bit(Math.floor(value / 2 ** i) % 2 === 1 ? 1 : 0);
    return this;
  }
  raw(data: Uint8Array): this {
    for (const byte of data) this.uint(byte, 8);
    return this;
  }
  /**
   * Octets de données de la représentation : si la longueur n'est pas un
   * multiple de 8, un bit 1 marque la fin, suivi de zéros jusqu'à l'octet.
   */
  padded(): Uint8Array {
    const out = Uint8Array.from(this.bytes);
    if (this.length % 8 !== 0) out[out.length - 1] |= 0x80 >> this.length % 8;
    return out;
  }
}

interface CellRef { hash: Uint8Array; depth: number }

/**
 * Hachage de représentation d'une cellule ordinaire de niveau 0 :
 * `sha256(d1 ‖ d2 ‖ données complétées ‖ profondeurs des refs ‖ hachages des refs)`,
 * avec `d1 = nombre de refs` et `d2 = ⌈bits/8⌉ + ⌊bits/8⌋`.
 */
function cell(bits: Bits, refs: CellRef[] = []): CellRef {
  const data = bits.padded();
  const body = new Uint8Array(2 + data.length + refs.length * 34);
  body[0] = refs.length;
  body[1] = Math.ceil(bits.length / 8) + Math.floor(bits.length / 8);
  body.set(data, 2);
  let o = 2 + data.length;
  for (const r of refs) { body[o++] = (r.depth >> 8) & 0xff; body[o++] = r.depth & 0xff; }
  for (const r of refs) { body.set(r.hash, o); o += 32; }
  return { hash: sha256(body), depth: refs.length ? 1 + Math.max(...refs.map((r) => r.depth)) : 0 };
}

/** Cellule `data` initiale du contrat, pour cette clé. */
function dataCell(publicKey: Uint8Array, version: TonWalletVersion, testnet: boolean): CellRef {
  const b = new Bits();
  if (version === 'v5r1') {
    // is_signature_allowed:1 · seqno:32 · wallet_id:32 · public_key:256 · extensions (dict vide):1
    b.bit(1).uint(0, 32).uint(tonW5WalletId({ testnet }), 32).raw(publicKey).bit(0);
  } else {
    // seqno:32 · subwallet_id:32 · public_key:256, puis (v4 seulement) plugins (dict vide):1
    b.uint(0, 32).uint(TON_DEFAULT_SUBWALLET_ID, 32).raw(publicKey);
    if (version === 'v4r2') b.bit(0);
  }
  return cell(b);
}

/**
 * Adresse (workchain 0) du portefeuille de cette clé publique pour cette version.
 * À formater avec `formatTonAddress` — non rebondissante (`UQ…`) pour l'afficher,
 * c'est la forme recommandée pour un portefeuille et celle que montre Tonkeeper.
 */
export function tonWalletAddress(
  publicKey: Uint8Array,
  version: TonWalletVersion,
  opts: { testnet?: boolean } = {},
): Pick<TonAddress, 'workchain' | 'hash'> {
  if (publicKey.length !== 32) throw new Error('Clé publique ed25519 de 32 octets attendue');
  // StateInit : split_depth absent (0), special absent (0), code présent (1),
  // data présent (1), library vide (0) — puis les deux références.
  const stateInit = cell(new Bits().bit(0).bit(0).bit(1).bit(1).bit(0), [CODE[version], dataCell(publicKey, version, !!opts.testnet)]);
  return { workchain: 0, hash: stateInit.hash };
}
