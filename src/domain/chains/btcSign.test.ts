import { base64, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import {
  signBip137Message,
  signBip322Message,
  recoverBip137PublicKey,
  bip137Digest,
  encodeVarInt,
  BIP137_SIGNATURE_BYTES,
} from './btcSign';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { deriveBtcSigner } from '../../crypto/btc';

/*
 * Ce fichier existe parce que TOUT le chemin de signature Bitcoin était
 * dépourvu de test : `@scure/btc-signer` est publié en ESM pur, que Jest ne
 * chargeait pas, et la logique vivait dans le store, derrière le
 * déverrouillage. Les deux obstacles sont levés (cf. jest.config et btcSign).
 *
 * Les vérifications sont faites À PARTIR DE LA SPEC, pas en réutilisant les
 * fonctions testées : une signature qui se vérifie avec son propre code ne
 * prouve rien.
 */
const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const signer = deriveBtcSigner(mnemonicToSeedSync(PHRASE), 0);

describe('encodeVarInt', () => {
  it('un octet sous 253', () => {
    expect(Array.from(encodeVarInt(0))).toEqual([0]);
    expect(Array.from(encodeVarInt(4))).toEqual([4]);
    expect(Array.from(encodeVarInt(252))).toEqual([252]);
  });

  it('trois octets de 253 à 65535, marqueur 0xFD, little-endian', () => {
    // C'est la frontière où une implémentation se trompe en silence : la
    // signature reste valide cryptographiquement mais porte sur un AUTRE
    // message, donc tout vérificateur la rejette.
    expect(Array.from(encodeVarInt(253))).toEqual([253, 253, 0]);
    expect(Array.from(encodeVarInt(65535))).toEqual([253, 255, 255]);
  });

  it('cinq octets au-delà, marqueur 0xFE', () => {
    expect(Array.from(encodeVarInt(65536))).toEqual([254, 0, 0, 1, 0]);
  });

  it('refuse ce qui n\'est pas une longueur', () => {
    expect(() => encodeVarInt(-1)).toThrow();
    expect(() => encodeVarInt(1.5)).toThrow();
    expect(() => encodeVarInt(0x1_0000_0000)).toThrow();
  });
});

describe('bip137Digest', () => {
  it('reconstruit le préfixe « Bitcoin Signed Message » à la lettre', () => {
    // Recalcul indépendant, depuis la spec.
    const msg = 'Hello Kalyx';
    const bytes = utf8ToBytes(msg);
    const expected = sha256(
      sha256(concatBytes(utf8ToBytes('\x18Bitcoin Signed Message:\n'), new Uint8Array([bytes.length]), bytes)),
    );
    expect(hex.encode(bip137Digest(msg))).toBe(hex.encode(expected));
  });

  it('un message différent donne un condensat différent', () => {
    expect(hex.encode(bip137Digest('a'))).not.toBe(hex.encode(bip137Digest('b')));
  });

  it('gère l\'UTF-8 multi-octets par sa longueur en OCTETS, pas en caractères', () => {
    // « é » fait 2 octets : compter les caractères produirait un préfixe faux.
    const msg = 'éé';
    const bytes = utf8ToBytes(msg);
    expect(bytes.length).toBe(4);
    const expected = sha256(
      sha256(concatBytes(utf8ToBytes('\x18Bitcoin Signed Message:\n'), new Uint8Array([4]), bytes)),
    );
    expect(hex.encode(bip137Digest(msg))).toBe(hex.encode(expected));
  });
});

describe('signBip137Message', () => {
  it('produit exactement 65 octets', () => {
    /*
     * Le ticket « Invalid signature length » venait de là : certains
     * vérificateurs n'acceptent QUE 65 octets. Un octet de plus ou de moins et
     * la signature est refusée sans autre explication.
     */
    const sig = base64.decode(signBip137Message('test', signer.privateKey));
    expect(sig.length).toBe(BIP137_SIGNATURE_BYTES);
  });

  it('en-tête entre 39 et 42 : clé compressée, dépense P2WPKH', () => {
    // 27 P2PKH non compressé, 31 compressé, 35 P2SH-P2WPKH, 39 P2WPKH natif.
    // Kalyx dérive du P2WPKH natif : tout autre en-tête ferait chercher au
    // vérificateur une adresse qui n'est pas la nôtre.
    for (const msg of ['a', 'test', 'Hello Kalyx', 'x'.repeat(300)]) {
      const header = base64.decode(signBip137Message(msg, signer.privateKey))[0];
      expect(header).toBeGreaterThanOrEqual(39);
      expect(header).toBeLessThanOrEqual(42);
    }
  });

  it('la clé publique récupérée est bien celle du signataire', () => {
    // Vérification par RÉCUPÉRATION : c'est ce que fait un vérificateur tiers.
    const sig = signBip137Message('Hello Kalyx', signer.privateKey);
    expect(hex.encode(recoverBip137PublicKey('Hello Kalyx', sig))).toBe(hex.encode(signer.publicKey));
  });

  it('la signature vérifie contre le condensat, par secp256k1 directement', () => {
    const sig = base64.decode(signBip137Message('preuve', signer.privateKey));
    // `verify` prend la signature compacte (r‖s), sans l'octet d'en-tête.
    expect(secp256k1.verify(sig.slice(1), bip137Digest('preuve'), signer.publicKey)).toBe(true);
  });

  it('une signature ne vaut PAS pour un autre message', () => {
    const sig = signBip137Message('message A', signer.privateKey);
    const recovered = recoverBip137PublicKey('message B', sig);
    expect(hex.encode(recovered)).not.toBe(hex.encode(signer.publicKey));
  });

  it('un message long (au-delà de 253 octets) reste vérifiable', () => {
    // Le cas où l'encodage VarInt bascule sur trois octets.
    const long = 'k'.repeat(1000);
    const sig = signBip137Message(long, signer.privateKey);
    expect(hex.encode(recoverBip137PublicKey(long, sig))).toBe(hex.encode(signer.publicKey));
  });

  it('un message vide est signable et vérifiable', () => {
    const sig = signBip137Message('', signer.privateKey);
    expect(hex.encode(recoverBip137PublicKey('', sig))).toBe(hex.encode(signer.publicKey));
  });

  it('traite le message comme du TEXTE, jamais comme un encodage', () => {
    // « deadbeef » est un message de 8 caractères, pas 4 octets hex. Deviner
    // ici ferait signer autre chose que ce que l'utilisateur a lu.
    const asText = utf8ToBytes('deadbeef');
    const expected = sha256(
      sha256(concatBytes(utf8ToBytes('\x18Bitcoin Signed Message:\n'), new Uint8Array([8]), asText)),
    );
    expect(hex.encode(bip137Digest('deadbeef'))).toBe(hex.encode(expected));
  });
});

describe('recoverBip137PublicKey', () => {
  it('rejette une signature de mauvaise longueur', () => {
    expect(() => recoverBip137PublicKey('x', base64.encode(new Uint8Array(64)))).toThrow(/65 attendus/);
  });

  it('rejette un en-tête hors plage', () => {
    const sig = base64.decode(signBip137Message('x', signer.privateKey));
    sig[0] = 27; // en-tête P2PKH non compressé
    expect(() => recoverBip137PublicKey('x', base64.encode(sig))).toThrow(/hors plage/);
  });
});

describe('signBip322Message', () => {
  it('produit une pile de témoins à DEUX éléments : signature puis clé publique', async () => {
    const witness = base64.decode(await signBip322Message('Hello Kalyx', signer));
    // Format RawWitness : [nombre d'éléments][len][données]…
    expect(witness[0]).toBe(2);
    const sigLen = witness[1];
    const pubOffset = 2 + sigLen;
    expect(witness[pubOffset]).toBe(33); // clé publique compressée
    expect(hex.encode(witness.slice(pubOffset + 1, pubOffset + 34))).toBe(hex.encode(signer.publicKey));
  });

  it('la signature DER porte le drapeau SIGHASH_ALL', async () => {
    const witness = base64.decode(await signBip322Message('Hello Kalyx', signer));
    const sigLen = witness[1];
    const der = witness.slice(2, 2 + sigLen);
    expect(der[0]).toBe(0x30); // séquence DER
    expect(der[der.length - 1]).toBe(0x01); // SIGHASH_ALL
  });

  it('la taille totale reste dans la fourchette attendue', async () => {
    // Les vérificateurs BIP-322 attendent une pile de cette forme ; une taille
    // très différente signalerait une construction fautive.
    const witness = base64.decode(await signBip322Message('test', signer));
    expect(witness.length).toBeGreaterThanOrEqual(104);
    expect(witness.length).toBeLessThanOrEqual(110);
  });

  it('deux messages différents donnent deux signatures différentes', async () => {
    const a = await signBip322Message('message A', signer);
    const b = await signBip322Message('message B', signer);
    expect(a).not.toBe(b);
  });

  it('le même message redonne la même signature (nonce déterministe RFC 6979)', async () => {
    // Un nonce aléatoire ferait fuir la clé privée si l'aléa était répété.
    const a = await signBip322Message('stable', signer);
    const b = await signBip322Message('stable', signer);
    expect(a).toBe(b);
  });

  it('BIP-137 et BIP-322 ne produisent PAS la même chose', async () => {
    // Deux protocoles distincts : les confondre côté app ferait envoyer une
    // preuve que le site d'en face ne sait pas lire.
    const ecdsa = signBip137Message('test', signer.privateKey);
    const bip322 = await signBip322Message('test', signer);
    expect(ecdsa).not.toBe(bip322);
    expect(base64.decode(ecdsa).length).toBe(65);
    expect(base64.decode(bip322).length).toBeGreaterThan(65);
  });
});
