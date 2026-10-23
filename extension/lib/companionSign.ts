/**
 * MODE COMPAGNON — une signature demandée par un site, faite sur le TÉLÉPHONE.
 *
 * La demande a été lue, expliquée et acceptée dans l'extension exactement
 * comme pour un compte local (lib/dappSign : parse → review). Seule la
 * dernière étape change : au lieu de tirer une clé du coffre, on transmet la
 * demande à l'app Kalyx, qui la montre à son tour et la fait valider.
 *
 * Le résultat est VÉRIFIÉ avant d'être rendu au site : signature de la bonne
 * clé, transaction Solana inchangée, hachage au bon format.
 */
import { Interface } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';
import { decodeTx } from '../../src/domain/tx/decodeTx';
import { parseAmount } from '../../src/domain/validation/amount';
import { listChains } from '../../src/domain/chains/registry';
import type { ChainConfig } from '../../src/domain/chains/types';
import { checkPersonal, checkSolMessage, checkSolSignature, checkSolSigned, checkTxHash, checkTyped, evmChainFor, evmTxParam, SOLANA_CAIP } from './companionCore';
import { RpcError } from './rpcError';
import type { Companion } from './companion';
import type { SignRequest } from './dappSign';
import type { WalletMeta } from './wallets';

/** Transaction Solana sérialisée → signatures et octets du message. */
export function splitSolanaTx(bytes: Uint8Array): { sigs: Uint8Array[]; message: Uint8Array } {
  let n = 0;
  let shift = 0;
  let i = 0;
  for (;;) {
    const b = bytes[i++];
    if (b === undefined) throw new RpcError(-32602, 'Transaction Solana illisible');
    n |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  const sigs = Array.from({ length: n }, (_, k) => bytes.slice(i + k * 64, i + (k + 1) * 64));
  const message = bytes.slice(i + n * 64);
  if (!message.length || sigs.some((s) => s.length !== 64)) throw new RpcError(-32602, 'Transaction Solana illisible');
  return { sigs, message };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, k) => x === b[k]);

/** La transaction rendue est la MÊME (message inchangé) et porte une signature valide de notre clé. */
export function checkSolSignedTx(original: string, signedB64: string, pubkey: string): string {
  const before = splitSolanaTx(base64.decode(original));
  const after = splitSolanaTx(base64.decode(signedB64));
  if (!sameBytes(before.message, after.message)) throw new RpcError(-32603, 'COMPANION_TX_CHANGED');
  const pk = base58.decode(pubkey);
  if (!after.sigs.some((s) => ed25519.verify(s, after.message, pk))) throw new RpcError(-32603, 'COMPANION_WRONG_SIGNER');
  return signedB64;
}

const chainOfHex = (hex: string): ChainConfig | undefined => listChains().find((c) => c.family === 'evm' && c.evmChainId === Number.parseInt(hex, 16));

export async function executeOnPhone(
  req: SignRequest,
  meta: WalletMeta,
  companion: Companion,
  opts: { reduceTo?: string; site?: string; tokenMeta?: (chain: ChainConfig, token: string) => Promise<{ symbol: string; decimals: number } | null> } = {},
): Promise<unknown> {
  const sessionChains = meta.evmChains ?? [];
  // Le site qui demande voyage avec la demande : le téléphone l'affiche à la place de « Kalyx — extension ».
  const ask = (chainId: string, method: string, params: unknown) => companion.request(meta, chainId, method, params, opts.site);
  if (req.kind === 'personal') {
    const chain = evmChainFor(sessionChains);
    const sig = await ask(`eip155:${chain}`, 'personal_sign', [req.hex, req.from]);
    return checkPersonal(sig, req.hex, req.from);
  }
  if (req.kind === 'typed') {
    const chain = evmChainFor(sessionChains, Number.parseInt(req.chainId, 16));
    const sig = await ask(`eip155:${chain}`, 'eth_signTypedData_v4', [req.from, JSON.stringify(req.data)]);
    return checkTyped(sig, req.data, req.from);
  }
  if (req.kind === 'evmTx') {
    const chain = chainOfHex(req.chainId);
    if (!chain?.evmChainId) throw new RpcError(4901, 'Réseau inconnu');
    const id = evmChainFor(sessionChains, chain.evmChainId);
    let data = req.tx.data;
    // « Réduire l'autorisation » : la transaction envoyée au téléphone porte déjà le montant réduit.
    if (opts.reduceTo !== undefined) {
      const d = decodeTx({ to: req.tx.to, value: BigInt(req.tx.value), data });
      if (d.kind !== 'approve' || !opts.tokenMeta) throw new RpcError(-32602, 'Rien à réduire');
      const tm = await opts.tokenMeta(chain, d.token);
      if (!tm) throw new RpcError(-32603, 'Décimales du jeton illisibles');
      data = new Interface(['function approve(address,uint256)']).encodeFunctionData('approve', [d.spender, parseAmount(opts.reduceTo, tm.decimals).raw]);
    }
    const tx = evmTxParam({ from: req.from, to: req.tx.to, data, value: BigInt(req.tx.value), gas: req.tx.gas ? BigInt(req.tx.gas) : undefined });
    return checkTxHash(await ask(`eip155:${id}`, 'eth_sendTransaction', [tx]));
  }
  if (req.kind === 'solMessage') {
    const bytes = base64.decode(req.message);
    const res = await ask(SOLANA_CAIP, 'solana_signMessage', { message: base58.encode(bytes), pubkey: req.from });
    const sig = checkSolMessage(res, bytes, req.from);
    return [{ signedMessage: req.message, signature: base64.encode(sig) }];
  }
  // Transactions Solana.
  if (req.send) {
    if (req.txs.length !== 1) throw new RpcError(-32602, 'Une seule transaction à envoyer à la fois');
    const sig = checkSolSignature(await ask(SOLANA_CAIP, 'solana_signAndSendTransaction', { transaction: req.txs[0] }));
    return [{ signature: base64.encode(base58.decode(sig)) }];
  }
  const signed =
    req.txs.length === 1
      ? checkSolSigned(await ask(SOLANA_CAIP, 'solana_signTransaction', { transaction: req.txs[0] }), 1)
      : checkSolSigned(await ask(SOLANA_CAIP, 'solana_signAllTransactions', { transactions: req.txs }), req.txs.length);
  return signed.map((s, k) => ({ signedTransaction: checkSolSignedTx(req.txs[k], s, req.from) }));
}
