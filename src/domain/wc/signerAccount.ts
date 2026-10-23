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
  evmAddress?: string;
  solAddress?: string;
  btcAddress?: string;
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

const addrOf = (a: SignerAccount, ns: string) => (ns === 'eip155' ? a.evmAddress : ns === 'solana' ? a.solAddress : ns === 'bip122' ? a.btcAddress : undefined);

export function checkSigner(input: { ns: string; shared: readonly string[]; method: string; params: unknown; accounts: readonly SignerAccount[]; activeIndex: number }): SignerCheck {
  const { ns, shared, accounts } = input;
  if (!shared.length) return { ok: true };
  const active = accounts.find((a) => a.index === input.activeIndex);
  const mine = active && addrOf(active, ns);
  if (!mine) return { ok: true };
  const same = ns === 'eip155' ? (a: string, b: string) => a.toLowerCase() === b.toLowerCase() : (a: string, b: string) => a === b;
  const wanted = ns === 'eip155' ? requestedEvmSigner(input.method, input.params) : undefined;
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
