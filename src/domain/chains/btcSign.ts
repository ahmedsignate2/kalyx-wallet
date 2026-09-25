/**
 * Signature de MESSAGE Bitcoin — BIP-137 (« Bitcoin Signed Message ») et
 * BIP-322 (signature générique par script).
 *
 * Extrait de `lib/walletStore` pour une raison précise : là-bas, la signature
 * était enfouie derrière le déverrouillage, la phrase de récupération et le
 * stockage, donc INTESTABLE. Combiné au fait que `@scure/btc-signer` est publié
 * en ESM pur — que Jest ne chargeait pas — cela faisait que ni BIP-137 ni
 * BIP-322 n'étaient couverts par le moindre test, alors que ce sont les
 * fonctions qui prouvent la possession d'une adresse à un tiers.
 *
 * Ici, tout prend un signataire en argument et ne touche ni au stockage ni à
 * l'état : la clé privée traverse, elle n'est jamais conservée ni journalisée.
 */
import { base64, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Ce qu'il faut pour signer un message : les deux clés, rien de plus.
 *
 * Dérivé de `BtcSigner` (`src/crypto/btc`) plutôt que redéclaré, pour qu'une
 * évolution de la forme du signataire se propage ici. Mais volontairement
 * RESTREINT : signer un message ne demande pas l'adresse, et ne pas l'exiger
 * permet de tester à partir d'une simple paire de clés.
 */
import type { BtcSigner } from '../../crypto/btc';

export type BtcMessageSigner = Pick<BtcSigner, 'privateKey' | 'publicKey'>;

/** Préfixe du protocole « Bitcoin Signed Message » (BIP-137). */
const MAGIC = utf8ToBytes('\x18Bitcoin Signed Message:\n');

/**
 * Décalage d'en-tête pour une clé compressée dépensée en P2WPKH.
 *
 * Les en-têtes BIP-137 encodent à la fois l'identifiant de récupération et le
 * TYPE d'adresse : 27 pour P2PKH non compressé, 31 compressé, 35 pour
 * P2SH-P2WPKH, 39 pour P2WPKH natif. Kalyx dérive du P2WPKH natif, d'où 39.
 */
const P2WPKH_HEADER_BASE = 39;

/** Longueur imposée d'une signature BIP-137 : en-tête + r + s. */
export const BIP137_SIGNATURE_BYTES = 65;

/**
 * Encodage `VarInt` de la longueur du message, tel que BIP-137 l'exige.
 *
 * Exporté parce que c'est la partie où une implémentation se trompe en silence :
 * un message de 253 octets ou plus bascule sur une forme multi-octets, et un
 * encodage faux produit une signature valide au sens cryptographique mais
 * portant sur un AUTRE message — donc rejetée par tout vérificateur.
 */
export function encodeVarInt(n: number): Uint8Array {
  if (n < 0 || !Number.isInteger(n)) throw new Error('Longueur invalide');
  if (n < 253) return new Uint8Array([n]);
  if (n <= 0xffff) {
    const b = new Uint8Array(3);
    b[0] = 253;
    new DataView(b.buffer).setUint16(1, n, true);
    return b;
  }
  if (n <= 0xffffffff) {
    const b = new Uint8Array(5);
    b[0] = 254;
    new DataView(b.buffer).setUint32(1, n, true);
    return b;
  }
  throw new Error('Message too long');
}

/** Condensat double-SHA256 signé par BIP-137, pour un message texte. */
export function bip137Digest(message: string): Uint8Array {
  const msgBytes = utf8ToBytes(message);
  const payload = concatBytes(MAGIC, encodeVarInt(msgBytes.length), msgBytes);
  return sha256(sha256(payload));
}

/**
 * Signature BIP-137 d'un message texte, en base64 (65 octets).
 *
 * Le message est du TEXTE UTF-8, sans aucune heuristique de décodage : « test »
 * ou « deadbeef » sont des messages, pas des encodages. Deviner ici ferait
 * signer autre chose que ce que l'utilisateur a lu.
 */
export function signBip137Message(message: string, privateKey: Uint8Array): string {
  const sig = secp256k1.sign(bip137Digest(message), privateKey);
  const out = new Uint8Array(BIP137_SIGNATURE_BYTES);
  out[0] = P2WPKH_HEADER_BASE + sig.recovery;
  out.set(sig.toCompactRawBytes(), 1);
  return base64.encode(out);
}

/**
 * Récupère la clé publique compressée depuis une signature BIP-137.
 *
 * Sert à VÉRIFIER une signature produite ici sans dépendre du même code que
 * celui qui l'a produite : un test qui réutiliserait la fonction de signature
 * pour se vérifier lui-même ne prouverait rien.
 */
export function recoverBip137PublicKey(message: string, signatureB64: string): Uint8Array {
  const sig = base64.decode(signatureB64);
  if (sig.length !== BIP137_SIGNATURE_BYTES) {
    throw new Error(`Signature de ${sig.length} octets, ${BIP137_SIGNATURE_BYTES} attendus`);
  }
  const recovery = sig[0] - P2WPKH_HEADER_BASE;
  if (recovery < 0 || recovery > 3) throw new Error(`En-tête BIP-137 hors plage : ${sig[0]}`);
  const point = secp256k1.Signature.fromCompact(sig.slice(1))
    .addRecoveryBit(recovery)
    .recoverPublicKey(bip137Digest(message));
  return point.toRawBytes(true);
}

/**
 * Signature BIP-322 « simple » d'un message, en base64 (pile de témoins).
 *
 * BIP-322 construit DEUX transactions : `to_spend`, qui n'existe que pour
 * ancrer le message dans une sortie, et `to_sign`, qui la dépense. C'est la
 * seconde qu'on signe, et on ne renvoie que sa pile de témoins.
 *
 * `@scure/btc-signer` est importé dynamiquement : il est publié en ESM pur, et
 * un import statique casserait le chargement du module côté CommonJS.
 */
export async function signBip322Message(message: string, signer: BtcMessageSigner): Promise<string> {
  const btc = await import('@scure/btc-signer');

  // Condensat étiqueté (BIP-340) : sha256(tag) est préfixé DEUX fois.
  const tagHash = sha256(utf8ToBytes('BIP0322-signed-message'));
  const messageHash = sha256(concatBytes(tagHash, tagHash, utf8ToBytes(message)));

  const script = btc.p2wpkh(signer.publicKey).script;

  // `to_spend` : entrée nulle, scriptSig = OP_0 <hash du message>.
  const toSpend = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
  toSpend.addOutput({ script, amount: 0n });
  toSpend.addInput({ txid: new Uint8Array(32), index: 0xffffffff, sequence: 0 });
  toSpend.updateInput(0, { finalScriptSig: btc.Script.encode([btc.OP.OP_0, messageHash]) });

  // `to_sign` : dépense `to_spend`, sortie OP_RETURN de valeur nulle.
  const toSign = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
  toSign.addOutput({ script: btc.Script.encode([btc.OP.RETURN]), amount: 0n });
  toSign.addInput({
    txid: hex.decode(toSpend.id),
    index: 0,
    sequence: 0,
    witnessUtxo: { script, amount: 0n },
  });

  toSign.signIdx(signer.privateKey, 0);
  toSign.finalize();

  const input = toSign.getInput(0);
  if (!input.finalScriptWitness) throw new Error('Signature failure');
  return base64.encode(btc.RawWitness.encode(input.finalScriptWitness));
}
