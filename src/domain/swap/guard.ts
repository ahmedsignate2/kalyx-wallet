/**
 * CONTRÔLE D'UN DEVIS avant qu'il puisse être signé.
 *
 * La transaction d'un échange est construite ENTIÈREMENT par le serveur de
 * l'agrégateur (LI.FI, Jupiter) : destinataire du contrat, données, montant,
 * adresse à autoriser. L'app la signait telle quelle. Une API compromise ou
 * détournée pouvait donc faire approuver ses jetons à n'importe quel contrat,
 * ou livrer le résultat de l'échange à une autre adresse — et l'écran aurait
 * affiché le devis honnête.
 *
 * Ce qui est vérifié, sans faire confiance au serveur :
 *  - EVM : réseau = celui demandé ; contrat appelé ET adresse autorisée = le
 *    contrat LI.FI officiel de ce réseau (liste relevée le 28/09 sur
 *    li.quest/v1/chains) ; jeton et montant = ceux demandés ; l'adresse de
 *    réception figure dans les données (vérifié sur des devis réels : échange,
 *    pont EVM et pont vers Solana).
 *  - Solana : c'est bien nous qui payons les frais (la transaction nous
 *    concerne) ; montant = celui demandé. La simulation obligatoire avant envoi
 *    reste en place dans `signSolanaTransaction`.
 *
 * Un devis qui échoue est ÉCARTÉ, jamais signé. Relay (désactivé, sans clé)
 * n'a pas de contrat listé : ses devis EVM seraient écartés tant qu'on ne les
 * a pas relevés.
 */
import { base58 } from '@scure/base';
import { describeSolanaTransaction } from '../wc/solanaTx';
import type { SwapQuote } from './lifi';
import { STONFI_ROUTERS, tonSwapPaysUser } from './stonfi';

const DIAMOND = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';

/** Contrat LI.FI par Chain ID EVM (hors cas général `DIAMOND`). */
const LIFI_DIAMONDS: Record<number, string> = {
  999: '0x0a0758d937d1059c356d4714e57f5df0239bce1a',
  1088: '0x24ca98fb6972f5ee05f0db00595c7f68d9fafd68',
  130: '0x864b314d4c5a0399368609581d3e8933a63b9232',
  1868: '0x864b314d4c5a0399368609581d3e8933a63b9232',
  57073: '0x864b314d4c5a0399368609581d3e8933a63b9232',
  14: '0x198fc70dfe05e755c81e54bd67bff3f729344b9b',
  2020: '0x452cf1b8597e6319cd21abd847312bf17e26d8d1',
  60808: '0x452cf1b8597e6319cd21abd847312bf17e26d8d1',
  2741: '0x4f8c9056bb8a3616693a76922fa35d53c056e5b3',
  2818: '0xf7ab42d00d2399f8a4fba2f15466be40709fe307',
  324: '0x341e94069f53234fe6dabef707ad424830525715',
  33139: '0x2dea447e7dc6cd2f10b31bf10dcb30f87e838417',
  42793: '0x977474593c982cfa8b197cae302e6d01f789435b',
  43111: '0x026f252016a7c47cdef1f05a3fc9e20c92a49c37',
  59144: '0xde1e598b81620773454588b85d6b5d4eec32573e',
  80094: '0xf909c4ae16622898b885b89d7f839e0244851c66',
  8217: '0x1255d17c1bc2f764d087536410879f2d0d8772fd',
  98866: '0x6f5c8bb0c5fe4eceac40ee1c238eab6bbb29761c',
};
/** Réseaux où LI.FI utilise le contrat général. */
const GENERIC = new Set([1, 42161, 8453, 56, 10, 137, 43114, 100, 1135, 122, 1329, 13371, 146, 1625, 204, 25, 252, 288, 30, 34443, 42220, 480, 5000, 534352, 81457]);

export function lifiContractFor(evmChainId: number): string | null {
  return LIFI_DIAMONDS[evmChainId] ?? (GENERIC.has(evmChainId) ? DIAMOND : null);
}

const NATIVE_EVM = new Set(['0x0000000000000000000000000000000000000000', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee']);
const sameToken = (a: string, b: string) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || (NATIVE_EVM.has(x) && NATIVE_EVM.has(y));
};

export interface SwapExpectation {
  /** Chain ID EVM de départ ; absent si le départ est Solana. */
  fromEvmChainId?: number;
  fromToken: string;
  fromAmount: bigint;
  /** Adresse qui paie (et signe). */
  fromAddress: string;
  /** Adresse qui reçoit, au format de la chaîne d'arrivée. */
  toAddress: string;
}

export type SwapQuoteRefusal =
  | 'WRONG_CHAIN'
  | 'UNKNOWN_CONTRACT'
  | 'UNKNOWN_SPENDER'
  | 'WRONG_TOKEN'
  | 'WRONG_AMOUNT'
  | 'RECEIVER_MISSING'
  | 'NOT_OUR_TX';

/** Adresse de réception telle qu'elle apparaît dans des données EVM (hex, sans 0x). */
function receiverHex(addr: string): string | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return addr.slice(2).toLowerCase();
  try {
    const b = base58.decode(addr);
    if (b.length === 32) return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    /* ni EVM ni Solana */
  }
  return null;
}

export function checkSwapQuote(q: SwapQuote, e: SwapExpectation): { ok: true } | { ok: false; reason: SwapQuoteRefusal } {
  if (q.fromAmount !== e.fromAmount) return { ok: false, reason: 'WRONG_AMOUNT' };

  if (q.tx.type === 'evm') {
    if (e.fromEvmChainId === undefined || Number(q.tx.chainId) !== e.fromEvmChainId) return { ok: false, reason: 'WRONG_CHAIN' };
    const contract = lifiContractFor(e.fromEvmChainId);
    if (!contract || q.tx.to.toLowerCase() !== contract) return { ok: false, reason: 'UNKNOWN_CONTRACT' };
    if (q.approvalAddress && q.approvalAddress.toLowerCase() !== contract) return { ok: false, reason: 'UNKNOWN_SPENDER' };
    if (!sameToken(q.fromToken.address, e.fromToken)) return { ok: false, reason: 'WRONG_TOKEN' };
    const recv = receiverHex(e.toAddress);
    if (!recv || !q.tx.data.toLowerCase().includes(recv)) return { ok: false, reason: 'RECEIVER_MISSING' };
    return { ok: true };
  }

  if (q.tx.type === 'ton') {
    // STON.fi : routeur officiel, un seul message, et tout revient à nous (relu dans le message).
    if (!STONFI_ROUTERS.has(q.tx.router) || q.tx.messages.length !== 1) return { ok: false, reason: 'UNKNOWN_CONTRACT' };
    if (!tonSwapPaysUser(q.tx.messages[0], e.fromAddress, q.tx.router)) return { ok: false, reason: 'RECEIVER_MISSING' };
    return { ok: true };
  }

  if (q.tx.type === 'bitcoin') return { ok: false, reason: 'NOT_OUR_TX' };

  // Solana : la transaction doit être payée (et donc signée en premier) par nous.
  const d = describeSolanaTransaction(q.tx.data, e.fromAddress);
  if (!d || d.feePayer !== e.fromAddress) return { ok: false, reason: 'NOT_OUR_TX' };
  return { ok: true };
}
