/**
 * Envoi d'un NFT TON (TEP-62) — domaines .ton, cadeaux Telegram, collections.
 *
 * Le message est adressé à l'ÉLÉMENT NFT par son propriétaire, avec 0,05 TON
 * de gaz (l'excédent revient). Il passe par le même chemin que les
 * transactions de dApp (`prepareDappTransfer` → émulation → signature →
 * diffusion) : l'utilisateur voit, émulé, le NFT quitter son portefeuille
 * avant de signer.
 */
import { getAdapterV2, TonAdapterV2, withSigner } from '../../src';
import { nftTransferBody, normalizeTonDomain, NFT_TRANSFER_TON } from '../../src/domain/chains/ton/tonNfts';
import { rawJettonAddress } from '../../src/domain/chains/ton/tonJettons';
import type { DappDraft } from '../../src/domain/chains/v2/TonAdapterV2';
import { useWallet, type Unlock } from '../walletStore';
import { addressForChain } from '../accountAddress';
import { listChains } from '../../src';

export interface NftSendPlan {
  chainId: string;
  from: string;
  /** Destinataire résolu (adresse conviviale). */
  to: string;
  /** Nom saisi, s'il en était un (« kalyx.ton »). */
  name?: string;
  draft: DappDraft;
}

function adapterFor(chainId: string): TonAdapterV2 {
  const a = getAdapterV2(chainId);
  if (!(a instanceof TonAdapterV2)) throw new Error('TON indisponible');
  return a;
}

/** Lève `nftSendNoTon`, `nftSendBadRecipient`, `nftSendNameNotFound` ou `nftSendSelf` — clés traduites. */
export async function planNftSend(p: { chainId: string; nftAddress: string; recipient: string; comment?: string }): Promise<NftSendPlan> {
  const w = useWallet.getState();
  const chain = listChains({ includeTestnets: true }).find((c) => c.id === p.chainId);
  const from = chain ? addressForChain(w.accounts[w.activeAccountIndex], chain) : '';
  if (!chain || !from) throw new Error('nftSendNoTon');
  const adapter = adapterFor(p.chainId);
  const input = p.recipient.trim();
  const domain = normalizeTonDomain(input);
  const to = domain ? await adapter.resolveDomain(domain) : input;
  if (!to) throw new Error(domain ? 'nftSendNameNotFound' : 'nftSendBadRecipient');
  if (!adapter.validateAddress(to)) throw new Error('nftSendBadRecipient');
  if (rawJettonAddress(to) === rawJettonAddress(from)) throw new Error('nftSendSelf');
  const payload = nftTransferBody({ newOwner: to, responseTo: from, queryId: BigInt(Date.now()), comment: p.comment?.trim() || undefined, testnet: !!chain.testnet });
  const draft = await adapter.prepareDappTransfer(from, { messages: [{ to: p.nftAddress, amount: NFT_TRANSFER_TON, bounce: true, payload }], validUntil: null });
  return { chainId: p.chainId, from, to, name: domain ?? undefined, draft };
}

export async function sendNft(plan: NftSendPlan, unlock: Unlock): Promise<string> {
  // Un NFT est un envoi comme un autre : liste blanche appliquée (.ton, numéros Telegram…).
  await (await import('../whitelistStore')).assertRecipientAllowed(plan.to);
  const adapter = adapterFor(plan.chainId);
  const signer = await useWallet.getState().deriveSigner(adapter, unlock);
  const signed = await withSigner(signer, (s) => adapter.signDappTransfer(plan.draft, s));
  await adapter.broadcastDapp(signed);
  return signed.txid;
}
