/**
 * Lecture LOCALE des données d'un message TON Connect.
 *
 * La fenêtre de signature s'appuie sur l'émulation TonAPI pour dire ce que la
 * transaction fait. Quand l'émulation échouait (quota, proxy en panne), elle
 * laissait signer en n'affichant que les TON envoyés et la mention « data » :
 * un transfert de tous les USDT, ou d'un NFT, caché dans ces données passait
 * inaperçu. Ce décodeur dit, sans réseau, ce qu'est chaque message ; l'écran
 * refuse de signer à l'aveugle tout ce qui n'est pas un simple commentaire.
 */
import type { Cell } from '@ton/core';

export const OP_COMMENT = 0;
export const OP_JETTON_TRANSFER = 0x0f8a7ea5;
export const OP_NFT_TRANSFER = 0x5fcc3d14;

export type TonPayloadKind =
  | { kind: 'none' }
  | { kind: 'comment'; text: string }
  | { kind: 'jetton'; amount: bigint; destination: string }
  | { kind: 'nft'; newOwner: string }
  | { kind: 'call'; op: number };

export function describeTonPayload(payload: Cell | undefined): TonPayloadKind {
  if (!payload) return { kind: 'none' };
  try {
    const s = payload.beginParse();
    if (s.remainingBits === 0 && s.remainingRefs === 0) return { kind: 'none' };
    if (s.remainingBits < 32) return { kind: 'call', op: -1 };
    const op = s.loadUint(32);
    if (op === OP_COMMENT) return { kind: 'comment', text: s.loadStringTail() };
    if (op === OP_JETTON_TRANSFER) {
      s.loadUintBig(64); // query_id
      const amount = s.loadCoins();
      const destination = s.loadAddress().toString({ bounceable: false });
      return { kind: 'jetton', amount, destination };
    }
    if (op === OP_NFT_TRANSFER) {
      s.loadUintBig(64);
      return { kind: 'nft', newOwner: s.loadAddress().toString({ bounceable: false }) };
    }
    return { kind: 'call', op };
  } catch {
    return { kind: 'call', op: -1 };
  }
}

/**
 * Sans émulation, peut-on laisser signer ? Seulement si chaque message est un
 * simple envoi de TON (éventuellement avec commentaire) sans déploiement de
 * contrat : c'est alors exactement ce que l'écran affiche.
 */
export function blindSafe(messages: { payload?: Cell; init?: unknown }[]): boolean {
  return messages.every((m) => {
    if (m.init) return false;
    const k = describeTonPayload(m.payload).kind;
    return k === 'none' || k === 'comment';
  });
}
