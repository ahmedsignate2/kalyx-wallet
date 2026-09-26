/**
 * Adresses TON : analyse, écriture, validation.
 *
 * PUR ET TESTÉ, et c'est indispensable : une adresse TON porte des DRAPEAUX que
 * les autres chaînes n'ont pas, et s'y tromper coûte des fonds.
 *
 * Forme conviviale : 36 octets en base64url — un octet de marqueur, un de
 * workchain, 32 octets de hachage, 2 octets de CRC16-XMODEM.
 *
 * Le marqueur porte deux bits qui changent tout :
 *
 * - **rebondissante** (`EQ…`, marqueur 0x11) : si le contrat destinataire
 *   n'existe pas ou refuse le message, les fonds REVIENNENT à l'expéditeur,
 *   moins les frais.
 * - **non rebondissante** (`UQ…`, marqueur 0x51) : les fonds restent sur
 *   l'adresse même si le compte n'est pas encore déployé.
 *
 * La même adresse s'écrit donc de DEUX façons, toutes deux valides. Un
 * validateur qui se contenterait du CRC laisserait passer les deux sans rien
 * dire — c'est pourquoi ce module rend le drapeau au lieu de le jeter.
 *
 * Le même octet porte un drapeau TESTNET (+0x80). Comme pour Bitcoin, une
 * adresse de test doit être refusée sur le réseau principal ; ici encore, il faut
 * la lire pour pouvoir la refuser.
 *
 * Voir `docs/10-TON.md` §3 avant d'y toucher.
 */
import { base64, base64urlnopad } from '@scure/base';

/** Marqueur d'une adresse rebondissante (`EQ…` en workchain 0). */
const TAG_BOUNCEABLE = 0x11;
/** Marqueur d'une adresse non rebondissante (`UQ…` en workchain 0). */
const TAG_NON_BOUNCEABLE = 0x51;
/** Bit ajouté au marqueur pour une adresse de réseau de test. */
const TAG_TESTNET = 0x80;

export interface TonAddress {
  /** Workchain : 0 pour la chaîne de base, -1 pour la masterchain. */
  workchain: number;
  /** Hachage de l'état initial du contrat, 32 octets. */
  hash: Uint8Array;
  /** L'écriture d'origine demandait-elle le rebond ? */
  bounceable: boolean;
  /** L'écriture d'origine désignait-elle le réseau de test ? */
  testnet: boolean;
}

/**
 * CRC16-XMODEM, celui que TON utilise pour ses adresses.
 *
 * Polynôme 0x1021, registre initial à zéro, sans réflexion ni ou-exclusif final.
 * Ce n'est PAS le CRC16 « classique » (0xA001 réfléchi) : les confondre produit
 * un contrôle qui échoue sur toutes les adresses réelles.
 */
export function crc16Xmodem(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * Analyse une adresse conviviale, ou `null`.
 *
 * Ne lève jamais : une adresse vient d'un QR, d'un collage ou d'une dApp, et
 * aucune de ces sources ne mérite qu'une exception traverse l'écran.
 *
 * Accepte les deux alphabets base64 : la spécification demande base64url, mais
 * la forme avec `+` et `/` circule aussi, et la refuser ferait échouer des
 * adresses parfaitement valides sous les yeux de l'utilisateur.
 */
export function parseTonAddress(input: string): TonAddress | null {
  const s = (input ?? '').trim();
  // 36 octets → 48 caractères en base64, avec ou sans remplissage.
  if (!/^[A-Za-z0-9_\-+/]{48}={0,2}$/.test(s)) return null;

  let bytes: Uint8Array;
  try {
    const normalised = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    bytes = base64urlnopad.decode(normalised);
  } catch {
    return null;
  }
  if (bytes.length !== 36) return null;

  const crcGiven = (bytes[34] << 8) | bytes[35];
  if (crc16Xmodem(bytes.subarray(0, 34)) !== crcGiven) return null;

  let tag = bytes[0];
  const testnet = (tag & TAG_TESTNET) !== 0;
  if (testnet) tag ^= TAG_TESTNET;
  if (tag !== TAG_BOUNCEABLE && tag !== TAG_NON_BOUNCEABLE) return null;

  /*
   * Le workchain est un entier SIGNÉ sur un octet : la masterchain vaut -1, qui
   * s'écrit 0xFF. Le lire comme non signé donnerait 255, un workchain qui
   * n'existe pas — et une adresse masterchain refusée à tort.
   */
  const raw = bytes[1];
  const workchain = raw === 0xff ? -1 : raw;
  if (workchain !== 0 && workchain !== -1) return null;

  return {
    workchain,
    hash: bytes.slice(2, 34),
    bounceable: tag === TAG_BOUNCEABLE,
    testnet,
  };
}

/**
 * Écrit une adresse sous sa forme conviviale.
 *
 * `bounceable` et `testnet` sont EXPLICITES et non repris de l'analyse : le
 * choix du rebond dépend de l'état du compte destinataire au moment de l'envoi,
 * pas de la façon dont l'adresse a été écrite par celui qui l'a donnée.
 */
export function formatTonAddress(
  addr: Pick<TonAddress, 'workchain' | 'hash'>,
  opts: { bounceable: boolean; testnet?: boolean; urlSafe?: boolean } = { bounceable: true },
): string {
  if (addr.hash.length !== 32) throw new Error('Adresse TON invalide : 32 octets de hachage attendus');
  let tag = opts.bounceable ? TAG_BOUNCEABLE : TAG_NON_BOUNCEABLE;
  if (opts.testnet) tag |= TAG_TESTNET;
  const body = Uint8Array.from([tag, addr.workchain & 0xff, ...addr.hash]);
  const crc = crc16Xmodem(body);
  const full = Uint8Array.from([...body, (crc >> 8) & 0xff, crc & 0xff]);
  // base64url par défaut : c'est la forme que la spécification demande et celle
  // qui traverse une URL sans être réécrite.
  return opts.urlSafe === false ? base64.encode(full) : base64urlnopad.encode(full) + '==';
}

/** Forme brute `workchain:hachageHexadécimal`, celle que les API attendent. */
export function toRawTonAddress(addr: Pick<TonAddress, 'workchain' | 'hash'>): string {
  const hex = [...addr.hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${addr.workchain}:${hex}`;
}

/** Analyse la forme brute `workchain:hachage`, ou `null`. */
export function parseRawTonAddress(input: string): Pick<TonAddress, 'workchain' | 'hash'> | null {
  const m = /^(-?\d+):([0-9a-fA-F]{64})$/.exec((input ?? '').trim());
  if (!m) return null;
  const workchain = Number(m[1]);
  if (workchain !== 0 && workchain !== -1) return null;
  const hash = new Uint8Array(32);
  for (let i = 0; i < 32; i++) hash[i] = parseInt(m[2].slice(i * 2, i * 2 + 2), 16);
  return { workchain, hash };
}

/**
 * Une adresse est-elle utilisable sur le réseau visé ?
 *
 * Le drapeau testnet est refusé sur le réseau principal, comme pour Bitcoin : une
 * adresse de test y désigne un compte qui n'existe pas, et les fonds y seraient
 * perdus sans que rien ne l'annonce.
 */
export function isValidTonAddress(input: string, opts: { testnet?: boolean } = {}): boolean {
  const parsed = parseTonAddress(input) ?? (parseRawTonAddress(input) ? { testnet: false } : null);
  if (!parsed) return false;
  return !!opts.testnet === !!parsed.testnet;
}
