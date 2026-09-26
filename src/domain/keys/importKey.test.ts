import { base58, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2';
import { ed25519 } from '@noble/curves/ed25519';
import { parseImportedKey } from './importKey';

/** Construit un WIF valide depuis un secret, comme le ferait un vrai portefeuille. */
function wif(secret: Uint8Array, compressed: boolean, version = 0x80): string {
  const body = Uint8Array.from([version, ...secret, ...(compressed ? [0x01] : [])]);
  const sum = sha256(sha256(body)).subarray(0, 4);
  return base58.encode(Uint8Array.from([...body, ...sum]));
}

const SECRET = hex.decode('1'.repeat(64));
const PUB = ed25519.getPublicKey(SECRET);

describe('parseImportedKey — WIF Bitcoin', () => {
  it('accepte un WIF compressé et retient le drapeau', () => {
    const r = parseImportedKey(wif(SECRET, true));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.format).toBe('wif');
    expect(r.key.families).toEqual(['bitcoin']);
    expect(r.key.compressed).toBe(true);
    expect(hex.encode(r.key.secret)).toBe('1'.repeat(64));
  });

  /*
   * Le drapeau de compression change l'ADRESSE dérivée. Le perdre ferait
   * apparaître une adresse que l'utilisateur ne reconnaît pas, et il en
   * conclurait que ses fonds ont disparu.
   */
  it('distingue un WIF non compressé', () => {
    const r = parseImportedKey(wif(SECRET, false));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.compressed).toBe(false);
  });

  it('accepte la version du réseau de test', () => {
    expect(parseImportedKey(wif(SECRET, true, 0xef)).ok).toBe(true);
  });

  /** Une somme de contrôle fausse est une faute de frappe, pas une clé. */
  it('REFUSE une somme de contrôle invalide', () => {
    const good = wif(SECRET, true);
    const broken = good.slice(0, -1) + (good.slice(-1) === '1' ? '2' : '1');
    const r = parseImportedKey(broken);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(['BAD_CHECKSUM', 'UNRECOGNISED']).toContain(r.error);
  });

  it('REFUSE une clé hors de l’intervalle secp256k1', () => {
    const zero = new Uint8Array(32);
    const r = parseImportedKey(wif(zero, true));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('OUT_OF_RANGE');
  });
});

describe('parseImportedKey — hexadécimal', () => {
  /*
   * MÊME SECRET, TROIS USAGES. 32 octets servent l'EVM et Bitcoin sur secp256k1,
   * et sont aussi une graine ed25519 valide. Trancher à la place de
   * l'utilisateur ferait dériver une adresse qu'il ne reconnaîtrait pas.
   */
  it('rend les trois familles possibles, sans choisir', () => {
    const r = parseImportedKey('0x' + '1'.repeat(64));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.format).toBe('hex32');
    expect(r.key.families).toEqual(['evm', 'bitcoin', 'solana']);
  });

  it('le préfixe 0x est optionnel et la casse indifférente', () => {
    const a = parseImportedKey('1'.repeat(64));
    const b = parseImportedKey('0X' + 'A'.repeat(64));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  /** Zéro n'est pas un scalaire secp256k1 : seule Solana reste possible. */
  it('un secret nul ne laisse que Solana', () => {
    const r = parseImportedKey('0'.repeat(64));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.families).toEqual(['solana']);
  });

  it('128 caractères hexadécimaux : les 64 octets de Solana', () => {
    const full = hex.encode(Uint8Array.from([...SECRET, ...PUB]));
    const r = parseImportedKey(full);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.format).toBe('hex64');
    expect(r.key.families).toEqual(['solana']);
    expect(hex.encode(r.key.secret)).toBe(hex.encode(SECRET));
  });
});

describe('parseImportedKey — Solana', () => {
  it('accepte l’export base58 de 64 octets et n’en garde que la graine', () => {
    const r = parseImportedKey(base58.encode(Uint8Array.from([...SECRET, ...PUB])));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.format).toBe('solana-base58-64');
    expect(hex.encode(r.key.secret)).toBe(hex.encode(SECRET));
  });

  it('accepte une graine base58 de 32 octets', () => {
    const r = parseImportedKey(base58.encode(SECRET));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.format).toBe('solana-base58-32');
    expect(r.key.families).toEqual(['solana']);
  });

  it('accepte le tableau JSON de solana-keygen', () => {
    const r = parseImportedKey(JSON.stringify([...SECRET, ...PUB]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.format).toBe('solana-json');
    expect(hex.encode(r.key.secret)).toBe(hex.encode(SECRET));
  });

  /*
   * LA VÉRIFICATION QUI SAUVE. Les 32 derniers octets sont la clé publique : on
   * la recalcule et on compare. C'est gratuit, et cela attrape un copier-coller
   * tronqué ou deux clés collées bout à bout — qui donneraient sinon un
   * portefeuille à une adresse inattendue, que l'utilisateur croirait vide.
   */
  it('REFUSE 64 octets dont la clé publique ne correspond pas', () => {
    const wrong = Uint8Array.from([...SECRET, ...new Uint8Array(32).fill(7)]);
    const r = parseImportedKey(base58.encode(wrong));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('SOLANA_MISMATCH');
  });

  it('REFUSE un tableau JSON de mauvaise taille ou hors octets', () => {
    expect(parseImportedKey(JSON.stringify(new Array(63).fill(1))).ok).toBe(false);
    expect(parseImportedKey(JSON.stringify(new Array(64).fill(300))).ok).toBe(false);
    expect(parseImportedKey('[pas du json').ok).toBe(false);
  });
});

describe('parseImportedKey — refus', () => {
  it('une entrée vide', () => {
    const r = parseImportedKey('   ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('EMPTY');
  });

  it('une phrase de récupération n’est pas une clé privée', () => {
    const r = parseImportedKey('legal winner thank year wave sausage worth useful legal winner thank yellow');
    expect(r.ok).toBe(false);
  });

  it('une longueur hexadécimale inattendue', () => {
    expect(parseImportedKey('0x' + '1'.repeat(62)).ok).toBe(false);
    expect(parseImportedKey('0x' + '1'.repeat(66)).ok).toBe(false);
  });

  /*
   * L'ORDRE DES TENTATIVES. Un WIF est de la base58 : si on essayait la base58
   * avant, un WIF compressé (34 octets décodés) échouerait, mais un cas voisin
   * pourrait passer pour une graine Solana. On vérifie donc qu'un WIF reste
   * reconnu comme tel.
   */
  it('un WIF n’est jamais pris pour une clé Solana', () => {
    const r = parseImportedKey(wif(SECRET, true));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key.families).toEqual(['bitcoin']);
  });
});
