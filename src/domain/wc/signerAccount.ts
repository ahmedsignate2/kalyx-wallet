/**
 * QUEL COMPTE doit signer une demande WalletConnect ?
 *
 * Une session partage un ou plusieurs comptes (l'extension en mode compagnon
 * en partage plusieurs). Chaque demande nomme le compte voulu : `from` d'une
 * transaction, adresse d'un `personal_sign` ou d'un `eth_signTypedData`.
 * Signer avec le compte actif quand la demande en nomme un autre donne une
 * signature que le site rejette — ou, pire, une transaction partie du mauvais
 * compte.
 *
 * Ici on décide, sans réseau : c'est bon ; ou c'est un autre compte, et s'il
 * est dans ce portefeuille, lequel — pour proposer « Signer avec Compte 2 »
 * au lieu de renvoyer l'utilisateur chercher le bon compte à la main.
 */

export interface SignerAccount {
  index: number;
  label?: string;
  /** Portefeuille du compte (mode compagnon : tous les portefeuilles du téléphone sont partagés). */
  walletId?: string;
  walletLabel?: string;
  evmAddress?: string;
  solAddress?: string;
  btcAddress?: string;
  /** Clé publique TON (hex) : affichée côté extension (lecture), pas encore signée par WalletConnect. */
  tonPub?: string;
}

export type SignerCheck =
  | { ok: true }
  /** `switchTo` : le compte demandé est dans ce portefeuille (absent : il n'y est pas, ou n'a jamais été partagé). */
  | { ok: false; address: string; switchTo?: SignerAccount };

const isEvmAddr = (x: unknown): x is string => typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x);

/** Adresse EVM que la demande nomme comme signataire, si elle en nomme une. */
export function requestedEvmSigner(method: string, params: unknown): string | undefined {
  const p = Array.isArray(params) ? params : [];
  if (method === 'eth_sendTransaction' || method === 'eth_signTransaction') {
    const from = (p[0] as { from?: unknown } | undefined)?.from;
    return isEvmAddr(from) ? from : undefined;
  }
  if (method === 'eth_sign' || method.startsWith('eth_signTypedData')) return isEvmAddr(p[0]) ? p[0] : undefined;
  if (method === 'personal_sign') {
    // Ordre normal [message, adresse] ; certains sites l'inversent (cf. signMessageParam).
    if (isEvmAddr(p[1])) return p[1];
    return isEvmAddr(p[0]) ? p[0] : undefined;
  }
  return undefined;
}

const isSolAddr = (x: unknown): x is string => typeof x === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
const isBtcAddr = (x: unknown): x is string => typeof x === 'string' && /^(bc1[0-9a-z]{6,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/i.test(x);

/**
 * Signataire nommé par une demande, quelle que soit la famille : `from` /
 * adresse en EVM, `pubkey` en Solana, `account` en Bitcoin (sendTransfer).
 * Indispensable dès que la session partage plusieurs comptes d'une famille.
 */
export function requestedSigner(ns: string, method: string, params: unknown): string | undefined {
  if (ns === 'eip155') return requestedEvmSigner(method, params);
  const p = (Array.isArray(params) ? params[0] : params) as { pubkey?: unknown; account?: unknown; address?: unknown } | undefined;
  if (ns === 'solana') return isSolAddr(p?.pubkey) ? p!.pubkey as string : undefined;
  if (ns === 'bip122') {
    const a = p?.account ?? p?.address;
    return isBtcAddr(a) ? (/^bc1/i.test(a) ? a.toLowerCase() : a) : undefined;
  }
  return undefined;
}

const addrOf = (a: SignerAccount, ns: string) => (ns === 'eip155' ? a.evmAddress : ns === 'solana' ? a.solAddress : ns === 'bip122' ? a.btcAddress : undefined);

export function checkSigner(input: { ns: string; shared: readonly string[]; method: string; params: unknown; accounts: readonly SignerAccount[]; activeIndex: number; activeWalletId?: string }): SignerCheck {
  const { ns, shared, accounts } = input;
  if (!shared.length) return { ok: true };
  // Comptes de plusieurs portefeuilles : le compte actif est celui du portefeuille actif.
  const active = accounts.find((a) => a.index === input.activeIndex && (input.activeWalletId === undefined || a.walletId === undefined || a.walletId === input.activeWalletId));
  const mine = active && addrOf(active, ns);
  if (!mine) return { ok: true };
  const same = ns === 'eip155' || ns === 'bip122' ? (a: string, b: string) => a.toLowerCase() === b.toLowerCase() : (a: string, b: string) => a === b;
  const wanted = requestedSigner(ns, input.method, input.params);
  // Un compte jamais partagé avec ce site : refus, sans proposer de changer.
  if (wanted && !shared.some((s) => same(s, wanted))) return { ok: false, address: wanted };
  const target = wanted ?? (shared.some((s) => same(s, mine)) ? mine : shared[0]);
  if (same(target, mine)) return { ok: true };
  const switchTo = accounts.find((a) => {
    const x = addrOf(a, ns);
    return !!x && same(x, target);
  });
  return { ok: false, address: target, ...(switchTo ? { switchTo } : {}) };
}
