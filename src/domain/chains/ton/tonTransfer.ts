/**
 * TON — construction et signature d'un transfert (message externe, BOC).
 *
 * ## Portage vérifié, pas réécriture
 *
 * La mise en forme de chaque version est portée de `@ton/ton` 16.3.0
 * (`createWalletTransferV3/V4/V5R1`, `storeOutListExtendedV5R1`) et vérifiée
 * OCTET PAR OCTET contre lui dans les tests : même BOC, même hachage, pour des
 * transferts avec déploiement, commentaire long, plusieurs destinataires, réseau
 * de test et envoi du solde entier. ed25519 est déterministe, donc « même
 * message » veut dire mêmes octets, signature comprise.
 *
 * Les détails qui changent les octets, et donc que le réseau refuserait :
 *
 * - W5 : opcode `0x7369676e` (« sign »), puis wallet_id, valid_until, seqno, la
 *   liste d'actions en référence optionnelle, un bit « pas d'action étendue » —
 *   et la signature en FIN de corps. En message externe, `IGNORE_ERRORS` est
 *   AJOUTÉ au mode de chaque envoi, comme le fait `@ton/ton`.
 * - v4R2 : subwallet_id, valid_until, seqno, un octet d'opération (0 = envoi),
 *   puis mode + message pour chaque envoi. Signature en TÊTE.
 * - v3R2 : comme v4R2, sans l'octet d'opération.
 *
 * ## Ce que ce fichier refuse
 *
 * Tout ce qui produirait un message valide pour un autre compte que celui
 * affiché, ou pour un autre réseau : un `StateInit` dont le hachage ne redonne
 * pas l'adresse, une clé de signature qui n'est pas celle du compte, une adresse
 * marquée « réseau de test » sur le réseau principal, un `validUntil` en
 * millisecondes (qui déborderait le champ de 32 bits).
 *
 * Le secret arrive par un `Ed25519Signer`, pour cette seule opération ; c'est
 * l'appelant (`withSigner`) qui l'efface ensuite.
 */
import { Buffer } from 'buffer';
import { ed25519 } from '@noble/curves/ed25519';
import {
  Address,
  Builder,
  Cell,
  SendMode,
  beginCell,
  comment as commentCell,
  contractAddress,
  external,
  internal,
  storeMessage,
  storeMessageRelaxed,
  storeOutList,
  type MessageRelaxed,
  type OutActionSendMsg,
  type StateInit,
} from '@ton/core';
import type { Ed25519Signer } from '../v2/signer';
import { parseRawTonAddress, parseTonAddress, formatTonAddress, toRawTonAddress } from './tonAddress';
import { tonW5WalletId, tonWalletAddress, TON_DEFAULT_SUBWALLET_ID, type TonWalletVersion } from './tonWallet';
import { TON_WALLET_CODE } from './tonWalletCode';

/** Opcode d'une requête signée par message externe (W5). */
const W5_AUTH_SIGNED_EXTERNAL = 0x7369676e;

/** Mode d'envoi standard : frais payés à part, erreurs ignorées (celui de Tonkeeper). */
export const TON_SEND_MODE_DEFAULT = SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS;
/** Tout le solde restant part avec le message — le bouton « Max », sans poussière. */
export const TON_SEND_MODE_ALL = SendMode.CARRY_ALL_REMAINING_BALANCE;

export interface TonTransferMessage {
  /** Adresse conviviale (`UQ…`/`EQ…`) ou brute (`0:…`). */
  to: string;
  /** Montant en nanotons. */
  amount: bigint;
  /** Rebond si le destinataire refuse. Explicite : il dépend de l'état du compte destinataire. */
  bounce: boolean;
  /** Commentaire texte — les plateformes l'exigent pour attribuer un dépôt. */
  comment?: string;
}

export interface TonTransferParams {
  version: TonWalletVersion;
  seqno: number;
  /** Échéance en SECONDES Unix : passé cet instant, le réseau refuse le message. */
  validUntil: number;
  messages: TonTransferMessage[];
  /** Embarquer le `StateInit` : premier envoi d'un compte jamais déployé. */
  deploy: boolean;
  testnet?: boolean;
  /** Mode d'envoi appliqué à chaque message. Défaut : `TON_SEND_MODE_DEFAULT`. */
  sendMode?: number;
}

export interface TonSignedTransfer {
  /** Message externe sérialisé, prêt à diffuser. */
  boc: string;
  /** Hachage de la cellule du message externe (hex). */
  hash: string;
  /** Adresse du portefeuille émetteur, non rebondissante. */
  from: string;
}

/** Cellule `data` initiale — même disposition que `tonWallet.ts`, avec `@ton/core`. */
function initialData(version: TonWalletVersion, publicKey: Uint8Array, testnet: boolean): Cell {
  const pub = Buffer.from(publicKey);
  if (version === 'v5r1') {
    return beginCell().storeBit(1).storeUint(0, 32).storeUint(tonW5WalletId({ testnet }), 32).storeBuffer(pub).storeBit(0).endCell();
  }
  const b = beginCell().storeUint(0, 32).storeUint(TON_DEFAULT_SUBWALLET_ID, 32).storeBuffer(pub);
  if (version === 'v4r2') b.storeBit(0);
  return b.endCell();
}

/** Destinataire : adresse lue, et refus d'une adresse de test sur le réseau principal. */
function destination(to: string, testnet: boolean): Address {
  const friendly = parseTonAddress(to);
  if (friendly) {
    if (friendly.testnet && !testnet) throw new Error('Adresse TON du réseau de test : refusée sur le réseau principal');
    return new Address(friendly.workchain, Buffer.from(friendly.hash));
  }
  const raw = parseRawTonAddress(to);
  if (raw) return new Address(raw.workchain, Buffer.from(raw.hash));
  throw new Error('Adresse TON invalide');
}

function assertUint32(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`${what} hors limites`);
}

/**
 * Construit et signe un transfert TON.
 *
 * Le compte émetteur est celui de la clé du signataire, pour la version donnée :
 * l'appelant compare `from` à l'adresse qu'il affiche.
 */
export function buildTonTransfer(params: TonTransferParams, signer: Ed25519Signer): TonSignedTransfer {
  const { version, seqno, validUntil, messages, deploy } = params;
  const testnet = !!params.testnet;
  const sendMode = params.sendMode ?? TON_SEND_MODE_DEFAULT;

  if (signer.curve !== 'ed25519') throw new Error('Signataire ed25519 attendu');
  const seed = signer.secretKey.subarray(0, 32);
  const publicKey = ed25519.getPublicKey(seed);
  if (Buffer.compare(Buffer.from(publicKey), Buffer.from(signer.publicKey)) !== 0) {
    throw new Error('La clé de signature ne correspond pas au compte');
  }

  assertUint32(seqno, 'seqno');
  // Une échéance en millisecondes déborderait le champ de 32 bits — et l'interface
  // v2 porte `validUntil` en millisecondes. La confusion est facile, on l'arrête ici.
  if (validUntil > 1e11) throw new Error('validUntil doit être en SECONDES, pas en millisecondes');
  assertUint32(validUntil, 'validUntil');
  assertUint32(sendMode, 'mode d’envoi');
  if (deploy && seqno !== 0) throw new Error('Un déploiement se fait avec seqno 0');
  const max = version === 'v5r1' ? 255 : 4;
  if (messages.length === 0 || messages.length > max) throw new Error(`Entre 1 et ${max} messages par transfert`);

  // L'état initial doit redonner EXACTEMENT l'adresse affichée : sinon le
  // déploiement créerait un autre compte, et le message serait refusé.
  const init: StateInit = { code: Cell.fromBase64(TON_WALLET_CODE[version]), data: initialData(version, publicKey, testnet) };
  const self = contractAddress(0, init);
  const expected = tonWalletAddress(publicKey, version, { testnet });
  if (self.toRawString() !== toRawTonAddress(expected)) throw new Error('État initial incohérent avec l’adresse du portefeuille');

  const outgoing: MessageRelaxed[] = messages.map((m) => {
    if (typeof m.amount !== 'bigint' || m.amount < 0n) throw new Error('Montant invalide');
    return internal({ to: destination(m.to, testnet), value: m.amount, bounce: m.bounce, body: m.comment ? commentCell(m.comment) : undefined });
  });

  const signing = new Builder();
  if (version === 'v5r1') {
    // En message externe, IGNORE_ERRORS est ajouté à chaque envoi (`toSafeV5R1SendMode`).
    const actions: OutActionSendMsg[] = outgoing.map((outMsg) => ({ type: 'sendMsg', mode: sendMode | SendMode.IGNORE_ERRORS, outMsg }));
    signing
      .storeUint(W5_AUTH_SIGNED_EXTERNAL, 32)
      .storeUint(tonW5WalletId({ testnet }), 32)
      .storeUint(validUntil, 32)
      .storeUint(seqno, 32)
      .storeMaybeRef(beginCell().store(storeOutList(actions)).endCell())
      .storeBit(0); // aucune action étendue
  } else {
    signing.storeUint(TON_DEFAULT_SUBWALLET_ID, 32).storeUint(validUntil, 32).storeUint(seqno, 32);
    if (version === 'v4r2') signing.storeUint(0, 8); // opération 0 : envoi simple
    for (const m of outgoing) signing.storeUint(sendMode, 8).storeRef(beginCell().store(storeMessageRelaxed(m)));
  }

  const signature = Buffer.from(ed25519.sign(signing.endCell().hash(), seed));
  const body = version === 'v5r1'
    ? beginCell().storeBuilder(signing).storeBuffer(signature).endCell()
    : beginCell().storeBuffer(signature).storeBuilder(signing).endCell();

  const message = beginCell().store(storeMessage(external({ to: self, init: deploy ? init : undefined, body }))).endCell();
  return {
    boc: message.toBoc().toString('base64'),
    hash: message.hash().toString('hex'),
    from: formatTonAddress(expected, { bounceable: false, testnet }),
  };
}
