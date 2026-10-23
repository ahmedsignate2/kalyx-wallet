/**
 * SIGNATURES DEMANDÉES PAR UNE dAPP — lire la demande, l'expliquer, la signer.
 *
 * Trois temps, et la fenêtre d'approbation entre les deux derniers :
 *  1. `parse` : la demande de la page est validée et FIGÉE (réseau du site,
 *     compte accordé). Ce qui sera signé est exactement ce qui a été montré.
 *  2. `review` : l'explication de l'app (src/domain/wc/explain) — phrase,
 *     « tu perds / tu reçois », niveau de risque — avec la simulation, le
 *     décodage, l'analyse GoPlus de la cible et du site.
 *  3. `execute` : la clé du compte accordé, tirée du coffre, vérifiée,
 *     effacée après usage.
 *
 * Mêmes refus que le mobile : pas de déploiement de contrat, pas de
 * transaction préparée pour un autre compte, EIP-712 d'un autre réseau
 * refusé (rejouable là-bas), « message » Solana qui est en fait une
 * transaction refusé, eth_sign (hachage brut) refusé.
 */
import { Interface, Wallet, getBytes, isHexString } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { wipeSigner, withSigner } from '../../src/domain/chains/v2/signer';
import { getAdapter, listChains } from '../../src/domain/chains/registry';
import type { ChainConfig } from '../../src/domain/chains/types';
import { EvmChainAdapter, type RawTxRequest } from '../../src/domain/chains/EvmChainAdapter';
import { SolanaChainAdapter } from '../../src/domain/chains/SolanaChainAdapter';
import { decodeTx } from '../../src/domain/tx/decodeTx';
import { simulateTx, type Simulation } from '../../src/domain/tx/simulate';
import { explainRequest, type ExplainT, type SignExplanation } from '../../src/domain/wc/explain';
import { hexToText, parseSiwe, siweDomainMismatch, summarizeTypedData, type SiweMessage, type TypedDataSummary } from '../../src/domain/wc/message';
import { describeSolanaTransaction, parseSolanaMessage, type SolanaTxDescription } from '../../src/domain/wc/solanaTx';
import { summarizePsbt } from '../../src/domain/wc/psbtSummary';
import { signBip322Message } from '../../src/domain/chains/btcSign';
import type { BitcoinChainAdapter } from '../../src/domain/chains/BitcoinChainAdapter';
import { Transaction as BtcTx, p2wpkh, SigHash } from '@scure/btc-signer';
import { assessAddress, isPhishingSite } from '../../src/domain/security/goplus';
import { isValidEvmAddress } from '../../src/domain/validation/address';
import { formatTokenAmount } from '../../src/domain/validation/format';
import { parseAmount } from '../../src/domain/validation/amount';
import { looksLikeSolanaTransaction } from '../../lib/solanaMessage';
import { signMessageParam } from '../../lib/dappProvider';
import { RpcError } from './rpcError';
import { scoreRisk, type RiskScore, type RiskSignals } from './riskScore';
import { lookalikeOf } from './siteInfo';
import { signerFor } from './signer';
import { executeOnPhone } from './companionSign';
import type { Companion } from './companion';
import type { Session } from './session';
import type { Wallets } from './wallets';

const MAX_SOL_TXS = 10;
const ANALYSIS_MS = 6000;

export type SignRequest =
  | { kind: 'evmTx'; from: string; chainId: string; tx: { to: string; data: string; value: string; gas?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string; gasPrice?: string } }
  | { kind: 'personal'; from: string; hex: string; text: string | null; siwe: SiweMessage | null }
  | { kind: 'typed'; from: string; chainId: string; data: { domain: Record<string, unknown>; types: Record<string, unknown>; message: unknown; primaryType?: string }; summary: TypedDataSummary | null }
  | { kind: 'solMessage'; from: string; message: string; text: string | null }
  | { kind: 'solTx'; from: string; txs: string[]; send: boolean }
  | { kind: 'btcMessage'; from: string; text: string }
  | { kind: 'btcPsbt'; from: string; pub: string; psbt: string; indexes: number[]; send: boolean };

/** Ce que la fenêtre montre. Tout est déjà du texte : aucun bigint, aucune donnée brute non bornée. */
export interface Review {
  explanation: SignExplanation;
  method: string;
  chainName?: string;
  /** Lignes techniques repliables (adresse cible, valeur, données, domaine EIP-712…). */
  details: { label: string; value: string }[];
  /** Texte du message à signer (personal_sign, SIWE, Solana). */
  messageText?: string;
  /** Approbation illimitée réductible : jeton, décimales, et montant suggéré (simulation). */
  reduce?: { symbol: string; decimals: number; suggested?: string };
  /** Score de risque 0-100 et ses raisons (lib/riskScore), calculé ici. */
  score: RiskScore;
  /** Valeur de ce qui part, dans la devise affichée (plafond journalier) ; null si inconnue. */
  outFiat: number | null;
  /** Autorisation de token accordée par cette transaction (rappel d'expiration). */
  approval?: { chainId: string; chainName: string; token: string; symbol: string; spender: string };
}

const hexQ = (v: unknown): string | undefined => (typeof v === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(v) ? v : typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? `0x${v.toString(16)}` : undefined);
const chainOfHex = (hex: string): ChainConfig | undefined => listChains().find((c) => c.family === 'evm' && c.evmChainId === Number.parseInt(hex, 16));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const clip = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}…` : s);

/* ── 1. Lire et figer la demande ── */

export function parseEvm(method: string, params: unknown[], from: string, siteChainHex: string): SignRequest {
  if (method === 'eth_sign') throw new RpcError(4200, 'eth_sign (hachage brut) refusé : il peut autoriser n’importe quoi. Utilise personal_sign.');
  if (method === 'personal_sign') {
    const hex = signMessageParam(method, params);
    if (typeof hex !== 'string' || !hex || hex.length > 200_000) throw new RpcError(-32602, 'Message invalide');
    const addr = params.find((p): p is string => typeof p === 'string' && /^0x[0-9a-fA-F]{40}$/.test(p) && p !== hex);
    if (addr && !same(addr, from)) throw new RpcError(4100, 'Ce message est demandé pour un autre compte');
    const text = isHexString(hex) ? hexToText(hex) : hex;
    return { kind: 'personal', from, hex, text, siwe: text ? parseSiwe(text) : null };
  }
  if (method === 'eth_signTypedData_v4' || method === 'eth_signTypedData_v3') {
    const [addr, raw] = params;
    if (typeof addr !== 'string' || !same(addr, from)) throw new RpcError(4100, 'Signature demandée pour un autre compte');
    let data: unknown = raw;
    if (typeof raw === 'string') {
      if (raw.length > 200_000) throw new RpcError(-32602, 'Données trop volumineuses');
      try {
        data = JSON.parse(raw);
      } catch {
        throw new RpcError(-32602, 'Données EIP-712 illisibles');
      }
    }
    const d = data as SignRequest & { domain?: unknown; types?: unknown; message?: unknown };
    if (!d || typeof d !== 'object' || typeof d.domain !== 'object' || typeof d.types !== 'object' || d.message === undefined) throw new RpcError(-32602, 'Données EIP-712 incomplètes');
    /*
     * Message pour un AUTRE réseau que celui du site : refusé (comme MetaMask et
     * l'app). Un permis signé « sur Base » alors que le site affiche Ethereum
     * servirait ailleurs que là où l'utilisateur croit l'accorder.
     */
    const dc = (d.domain as { chainId?: unknown } | null)?.chainId;
    if (dc !== undefined && dc !== null && dc !== '') {
      const n = typeof dc === 'number' ? dc : typeof dc === 'bigint' ? Number(dc) : typeof dc === 'string' ? (/^0x/i.test(dc) ? Number.parseInt(dc, 16) : Number(dc)) : NaN;
      if (!Number.isSafeInteger(n) || n !== Number.parseInt(siteChainHex, 16)) throw new RpcError(-32602, `Message EIP-712 pour le réseau ${String(dc).slice(0, 20)}, le site est sur ${Number.parseInt(siteChainHex, 16)} : refusé`);
    }
    return { kind: 'typed', from, chainId: siteChainHex, data: data as never, summary: summarizeTypedData(data) };
  }
  if (method === 'eth_sendTransaction') {
    const tx = (params[0] ?? {}) as Record<string, unknown>;
    // Pas de déploiement de contrat depuis une page : sans destinataire, rien à montrer de lisible.
    if (typeof tx.to !== 'string' || !isValidEvmAddress(tx.to)) throw new RpcError(4200, 'Déploiement de contrat non pris en charge');
    if (typeof tx.from === 'string' && !same(tx.from, from)) throw new RpcError(4100, 'Transaction préparée pour un autre compte');
    const data = typeof tx.data === 'string' ? tx.data : typeof tx.input === 'string' ? tx.input : '0x';
    if (!/^0x([0-9a-fA-F]{2})*$/.test(data) || data.length > 250_000) throw new RpcError(-32602, 'Données de transaction invalides');
    if (typeof tx.chainId !== 'undefined' && hexQ(tx.chainId) && Number.parseInt(hexQ(tx.chainId)!, 16) !== Number.parseInt(siteChainHex, 16)) {
      throw new RpcError(4901, 'Transaction pour un autre réseau que celui du site');
    }
    return {
      kind: 'evmTx',
      from,
      chainId: siteChainHex,
      tx: { to: tx.to, data, value: hexQ(tx.value) ?? '0x0', gas: hexQ(tx.gas ?? tx.gasLimit), maxFeePerGas: hexQ(tx.maxFeePerGas), maxPriorityFeePerGas: hexQ(tx.maxPriorityFeePerGas), gasPrice: hexQ(tx.gasPrice) },
    };
  }
  throw new RpcError(4200, `Méthode non prise en charge : ${method.slice(0, 60)}`);
}

export function parseSolana(method: string, params: unknown[], from: string): SignRequest {
  const inputs = params.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object');
  if (!inputs.length) throw new RpcError(-32602, 'Demande vide');
  // Réseau principal seulement (l'extension n'annonce que solana:mainnet).
  if (inputs.some((i) => i.chain !== undefined && i.chain !== 'solana:mainnet')) throw new RpcError(4200, 'Réseau Solana non pris en charge');
  if (method === 'sol_signMessage') {
    if (inputs.length !== 1 || typeof inputs[0].message !== 'string') throw new RpcError(-32602, 'Message invalide');
    let bytes: Uint8Array;
    try {
      bytes = base64.decode(inputs[0].message);
    } catch {
      throw new RpcError(-32602, 'Message illisible');
    }
    if (bytes.length > 64 * 1024) throw new RpcError(-32602, 'Message trop long');
    // Une « signature de message » qui est en fait une transaction : refusée, elle déplacerait des fonds.
    if (looksLikeSolanaTransaction(bytes)) throw new RpcError(4200, 'Ce « message » est une transaction Solana : signature refusée');
    let text: string | null = null;
    try {
      const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      text = /[\u0000-\u0008\u000e-\u001f]/.test(s) ? null : s;
    } catch {
      text = null;
    }
    return { kind: 'solMessage', from, message: inputs[0].message, text };
  }
  if (method === 'sol_signTransaction' || method === 'sol_signAndSendTransaction') {
    if (inputs.length > MAX_SOL_TXS || inputs.some((i) => typeof i.transaction !== 'string')) throw new RpcError(-32602, 'Transactions invalides');
    const send = method === 'sol_signAndSendTransaction';
    if (send && inputs.length !== 1) throw new RpcError(-32602, 'Une transaction à la fois');
    const txs = inputs.map((i) => i.transaction as string);
    for (const t of txs) if (!describeSolanaTransaction(base64.decode(t), from)) throw new RpcError(-32602, 'Transaction Solana illisible');
    return { kind: 'solTx', from, txs, send };
  }
  throw new RpcError(4200, `Méthode non prise en charge : ${method.slice(0, 60)}`);
}

/**
 * Bitcoin (Wallet Standard « bitcoin:* », réseau principal). Ce que Kalyx
 * accepte, et rien de plus :
 *  - un message en TEXTE (signé en BIP-322, la forme des adresses bc1q) ;
 *  - un PSBT dont chaque entrée à signer est BIEN À CE COMPTE (son script
 *    est celui de l'adresse bc1 accordée), signée en SIGHASH_ALL seulement.
 *    Les autres modes (NONE, SINGLE, ANYONECANPAY) laissent quelqu'un
 *    d'autre modifier la transaction après coup : c'est la base des ventes
 *    piégées d'ordinals — refusés.
 */
export function parseBitcoin(method: string, params: unknown[], from: string, pub: string): SignRequest {
  const inputs = params.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object');
  if (inputs.length !== 1) throw new RpcError(-32602, 'Une demande à la fois');
  const i = inputs[0];
  if (i.chain !== undefined && i.chain !== 'bitcoin:mainnet') throw new RpcError(4200, 'Réseau Bitcoin non pris en charge');
  if (method === 'btc_signMessage') {
    let bytes: Uint8Array;
    try {
      bytes = base64.decode(String(i.message ?? ''));
    } catch {
      throw new RpcError(-32602, 'Message illisible');
    }
    if (!bytes.length || bytes.length > 64 * 1024) throw new RpcError(-32602, 'Message invalide');
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new RpcError(4200, 'Message binaire : signature refusée (seul un texte lisible est signé)');
    }
    return { kind: 'btcMessage', from, text };
  }
  if (method === 'btc_signTransaction' || method === 'btc_signAndSendTransaction') {
    const psbt = typeof i.psbt === 'string' ? i.psbt : '';
    if (!psbt || psbt.length > 400_000) throw new RpcError(-32602, 'PSBT invalide');
    let tx: BtcTx;
    try {
      tx = BtcTx.fromPSBT(base64.decode(psbt), { allowUnknownOutputs: true });
    } catch {
      throw new RpcError(-32602, 'PSBT illisible');
    }
    const asks = Array.isArray(i.inputsToSign) ? (i.inputsToSign as Record<string, unknown>[]) : [];
    if (!asks.length) throw new RpcError(-32602, 'Aucune entrée à signer');
    const mine = p2wpkh(hexToBytesSafe(pub)).script;
    const indexes = new Set<number>();
    for (const a of asks) {
      if (typeof a?.address !== 'string' || a.address.toLowerCase() !== from.toLowerCase()) throw new RpcError(4100, 'Entrée demandée pour un autre compte');
      if (a.sigHash !== undefined && a.sigHash !== 'ALL') throw new RpcError(4200, 'Mode de signature refusé (seul SIGHASH_ALL)');
      for (const n of Array.isArray(a.signingIndexes) ? a.signingIndexes : []) {
        if (!Number.isInteger(n) || n < 0 || n >= tx.inputsLength) throw new RpcError(-32602, 'Entrée inexistante');
        const inp = tx.getInput(n as number);
        const script = inp.witnessUtxo?.script;
        if (!script || bytesToHex(script) !== bytesToHex(mine)) throw new RpcError(4100, 'Cette entrée n’appartient pas à ce compte');
        if (inp.sighashType !== undefined && inp.sighashType !== SigHash.ALL && inp.sighashType !== SigHash.DEFAULT) throw new RpcError(4200, 'Mode de signature refusé (seul SIGHASH_ALL)');
        indexes.add(n as number);
      }
    }
    if (!indexes.size) throw new RpcError(-32602, 'Aucune entrée à signer');
    return { kind: 'btcPsbt', from, pub, psbt, indexes: [...indexes].sort((a, b) => a - b), send: method === 'btc_signAndSendTransaction' };
  }
  throw new RpcError(4200, `Méthode non prise en charge : ${method.slice(0, 60)}`);
}

const hexToBytesSafe = (h: string): Uint8Array => {
  if (!/^[0-9a-f]{66}$/i.test(h)) throw new RpcError(-32603, 'Clé publique Bitcoin illisible');
  return Uint8Array.from(h.match(/../g)!.map((x) => Number.parseInt(x, 16)));
};

/* ── 2. Expliquer ── */

export interface ReviewDeps {
  t: ExplainT;
  /** Injectables (tests) : réseau. */
  simulate?: typeof simulateTx;
  assess?: typeof assessAddress;
  phishing?: typeof isPhishingSite;
  tokenMeta?: (chain: ChainConfig, token: string) => Promise<{ symbol: string; decimals: number } | null>;
  /** Ce que Kalyx sait du site : déjà connecté par le passé, signes d'une page altérée (lib/dappHost). */
  site?: (origin: string) => Promise<{ known: boolean; tampered: string[] }>;
  /** Prix d'un actif dans la devise affichée (natif si pas de contrat), null s'il est inconnu. */
  priceOf?: (chainId: string, contract?: string) => Promise<number | null>;
}

const withTimeoutOrNull = <T>(p: Promise<T>): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ANALYSIS_MS))]);

/** decimals() et symbol() lus sur le contrat (RPC public) : sans indexeur. */
export async function readTokenMeta(chain: ChainConfig, token: string): Promise<{ symbol: string; decimals: number } | null> {
  const a = getAdapter(chain.id) as EvmChainAdapter;
  try {
    const [d, s] = await Promise.all([a.callContract(token, '0x313ce567'), a.callContract(token, '0x95d89b41').catch(() => '0x')]);
    const decimals = Number(BigInt(d));
    if (!Number.isInteger(decimals) || decimals > 77) return null;
    let symbol = '?';
    try {
      symbol = new Interface(['function symbol() view returns (string)']).decodeFunctionResult('symbol', s)[0] as string;
    } catch {
      const raw = s.replace(/^0x/, '').slice(0, 64).replace(/(00)+$/, '');
      if (raw) symbol = new TextDecoder().decode(Uint8Array.from(raw.match(/../g)!.map((x) => Number.parseInt(x, 16))));
    }
    return { symbol: symbol.replace(/[^\p{L}\p{N}.$_-]/gu, '').slice(0, 12) || '?', decimals };
  } catch {
    return null;
  }
}

/**
 * Explication + score. Les signaux du score viennent des mêmes analyses que
 * l'explication (aucune requête de plus), plus ce que Kalyx sait du site.
 */
export async function review(req: SignRequest, origin: string, deps: ReviewDeps): Promise<Review> {
  const signals: RiskSignals = {};
  const [r, site] = await Promise.all([explainOnly(req, origin, deps, signals), deps.site ? withTimeoutOrNull(deps.site(origin)) : null]);
  const u = new URL(origin);
  const brand = lookalikeOf(u.hostname);
  if (brand) signals.lookalike = { brand };
  if (u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) signals.insecureSite = true;
  if (site && !site.known) signals.firstVisit = true;
  if (site?.tampered.length) signals.pageTampered = true;
  return { ...r, score: scoreRisk(signals) };
}

/**
 * Valeur sortante d'une transaction EVM, dans la devise affichée : la valeur
 * native, plus chaque sortie simulée (jetons). Sans simulation alors que la
 * transaction appelle un contrat, ou sans prix : inconnue (null).
 */
async function outFiatOf(chain: ChainConfig, value: bigint, data: string, sim: Simulation | null, priceOf?: ReviewDeps['priceOf']): Promise<number | null> {
  const price = async (contract?: string) => (priceOf ? await withTimeoutOrNull(priceOf(chain.id, contract)) : null);
  let total = 0;
  if (value > 0n) {
    const p = await price();
    if (!p) return null;
    total += (Number(value) / 10 ** chain.nativeDecimals) * p;
  }
  if (!sim) return data.length > 2 ? null : total;
  for (const c of sim.changes.filter((x) => x.direction === 'out' && x.assetType !== 'NATIVE')) {
    if (c.assetType !== 'ERC20' || !c.contract) return null;
    const p = await price(c.contract);
    if (!p) return null;
    total += (Number(BigInt(c.rawAmount)) / 10 ** c.decimals) * p;
  }
  return total;
}

async function explainOnly(req: SignRequest, origin: string, deps: ReviewDeps, sig: RiskSignals): Promise<Omit<Review, 'score'>> {
  const t = deps.t;
  const host = new URL(origin).host;
  const phishingSite = (await withTimeoutOrNull((deps.phishing ?? isPhishingSite)(origin))) === true;
  if (phishingSite) sig.phishingSite = true;
  const assess = deps.assess ?? assessAddress;
  const risk = async (chainId: number, addr?: string) => {
    const a = addr ? await withTimeoutOrNull(assess(chainId, addr)) : null;
    if (a?.level === 'danger') sig.contractDanger = true;
    return a;
  };

  if (req.kind === 'personal') {
    const siweMismatch = !!req.siwe && siweDomainMismatch(req.siwe.domain, origin);
    if (siweMismatch) sig.domainMismatch = { domain: req.siwe!.domain.slice(0, 60) };
    const explanation = explainRequest({ kind: req.siwe ? 'siwe' : 'message', domain: host, siwe: req.siwe, siweMismatch, messageText: req.text, phishingSite, t });
    return { explanation, method: 'personal_sign', messageText: clip(req.text ?? req.hex), details: [{ label: 'Compte', value: req.from }], outFiat: 0 };
  }
  if (req.kind === 'typed') {
    const chain = chainOfHex(req.chainId);
    const s = req.summary;
    const meta = s?.token && chain ? await withTimeoutOrNull((deps.tokenMeta ?? readTokenMeta)(chain, s.token)) : null;
    const addressRisk = chain?.evmChainId && s?.verifyingContract ? await risk(chain.evmChainId, s.verifyingContract) : null;
    const explanation = explainRequest({ kind: 'typedData', domain: host, typed: s, tokenSymbol: meta?.symbol ?? null, tokenDecimals: meta?.decimals ?? null, addressRisk, phishingSite, connectedChainId: chain?.evmChainId, t });
    if (explanation.canReduceApproval) sig.unlimitedApproval = true;
    if (s?.details?.some((d) => /échéance|deadline/i.test(d.label) && /sans expiration/i.test(d.value))) sig.permitNoExpiry = true;
    if (s?.order) sig.nftOrder = true;
    return {
      explanation,
      method: 'eth_signTypedData_v4',
      chainName: chain?.name,
      details: [
        ...(s?.name ? [{ label: 'Domaine', value: s.name }] : []),
        ...(s?.primaryType ? [{ label: 'Type', value: s.primaryType }] : []),
        ...(s?.chainId !== undefined ? [{ label: 'Réseau signé', value: String(s.chainId) }] : []),
        ...(s?.verifyingContract ? [{ label: 'Contrat', value: s.verifyingContract }] : []),
        ...(s?.details ?? []),
      ],
      messageText: clip(JSON.stringify(req.data.message, null, 2)),
      outFiat: 0,
    };
  }
  if (req.kind === 'evmTx') {
    const chain = chainOfHex(req.chainId);
    if (!chain) throw new RpcError(4901, 'Réseau du site indisponible');
    const value = BigInt(req.tx.value);
    const decoded = decodeTx({ to: req.tx.to, value, data: req.tx.data });
    const token = decoded.kind === 'transfer' || decoded.kind === 'approve' ? decoded.token : undefined;
    const [meta, addressRisk] = await Promise.all([token ? withTimeoutOrNull((deps.tokenMeta ?? readTokenMeta)(chain, token)) : null, risk(chain.evmChainId!, req.tx.to)]);
    const sim: Simulation | null = await withTimeoutOrNull((deps.simulate ?? simulateTx)(chain, { from: req.from, to: req.tx.to, value, data: req.tx.data }, meta ?? undefined));
    const explanation = explainRequest({ kind: 'tx', domain: host, decoded, simulation: sim, addressRisk, phishingSite, nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals, txValue: value, t });
    if (decoded.kind === 'approveAll' && decoded.approved) sig.approveAll = true;
    if (decoded.kind === 'approve' && decoded.unlimited) sig.unlimitedApproval = true;
    // Perte sans contrepartie : signe d'un drain quand un CONTRAT est appelé (un simple paiement, lui, ne « reçoit » jamais rien).
    if (req.tx.data.length > 2 && sim && sim.changes.some((c) => c.direction === 'out') && !sim.changes.some((c) => c.direction === 'in')) sig.lossOnly = true;
    if (!sim && (value > 0n || req.tx.data.length > 2)) sig.noSimulation = true;
    const suggested =
      decoded.kind === 'approve' ? sim?.changes.find((c) => c.direction === 'out' && c.contract && same(c.contract, decoded.token))?.rawAmount : undefined;
    return {
      explanation,
      method: 'eth_sendTransaction',
      chainName: chain.name,
      details: [
        { label: 'Contrat / destinataire', value: req.tx.to },
        { label: 'Valeur', value: `${formatTokenAmount(value, chain.nativeDecimals)} ${chain.nativeSymbol}` },
        { label: 'Données', value: req.tx.data.length > 10 ? `${req.tx.data.slice(0, 10)}… (${(req.tx.data.length - 2) / 2} octets)` : '—' },
      ],
      outFiat: await outFiatOf(chain, value, req.tx.data, sim, deps.priceOf),
      approval: decoded.kind === 'approve' && decoded.amount > 0n ? { chainId: chain.id, chainName: chain.name, token: decoded.token, symbol: meta?.symbol ?? '?', spender: decoded.spender } : undefined,
      reduce:
        explanation.canReduceApproval && decoded.kind === 'approve' && meta
          ? { symbol: meta.symbol, decimals: meta.decimals, suggested: suggested ? formatTokenAmount(BigInt(suggested), meta.decimals) : undefined }
          : undefined,
    };
  }
  if (req.kind === 'btcMessage') {
    const explanation = explainRequest({ kind: 'message', domain: host, messageText: req.text, phishingSite, t });
    return { explanation, method: 'bitcoin:signMessage', chainName: 'Bitcoin', messageText: clip(req.text), details: [{ label: 'Compte', value: req.from }], outFiat: 0 };
  }
  if (req.kind === 'btcPsbt') {
    const summary = summarizePsbt(req.psbt, [req.from]);
    const explanation = explainRequest({ kind: 'btcPsbt', domain: host, btc: { psbt: summary, inputs: req.indexes.length, broadcast: req.send }, phishingSite, t });
    if (!summary || summary.unknownInputs) sig.noSimulation = true;
    const price = summary && summary.sent > 0n && deps.priceOf ? await withTimeoutOrNull(deps.priceOf('bitcoin')) : null;
    const fmt = (v: bigint) => `${formatTokenAmount(v, 8)} BTC`;
    return {
      explanation,
      method: req.send ? 'bitcoin:signAndSendTransaction' : 'bitcoin:signTransaction',
      chainName: 'Bitcoin',
      details: [
        { label: 'Entrées signées', value: req.indexes.join(', ') },
        ...(summary?.outputs ?? []).slice(0, 12).map((o) => ({ label: o.mine ? 'Retour vers ce compte' : 'Sortie', value: `${o.address ?? '?'} · ${fmt(o.sats)}` })),
        ...(summary?.fee != null ? [{ label: 'Frais', value: fmt(summary.fee) }] : []),
      ],
      // Ce qui part (hors monnaie rendue) ; inconnu sans PSBT lisible ou sans prix.
      outFiat: !summary ? null : summary.sent === 0n ? 0 : price ? (Number(summary.sent) / 1e8) * price : null,
    };
  }
  if (req.kind === 'solMessage') {
    const explanation = explainRequest({ kind: 'message', domain: host, messageText: req.text ?? `0x${bytesToHex(base64.decode(req.message))}`, phishingSite, t });
    return { explanation, method: 'solana:signMessage', messageText: clip(req.text ?? `0x${bytesToHex(base64.decode(req.message))}`), details: [{ label: 'Compte', value: req.from }], outFiat: 0 };
  }
  const desc: SolanaTxDescription | null = describeSolanaTransaction(base64.decode(req.txs[0]), req.from);
  const explanation = explainRequest({ kind: 'solanaTx', domain: host, solana: desc, phishingSite, t });
  // Plusieurs transactions : seule la première est décrite — on le dit, et le risque monte d'un cran.
  if (req.txs.length > 1) {
    sig.manyTxs = { n: String(req.txs.length) };
    if (explanation.risk === 'none') explanation.risk = 'warning';
    explanation.reasons.push(t('exManyTxs' as never, { n: String(req.txs.length) }));
  }
  return {
    explanation,
    method: req.send ? 'solana:signAndSendTransaction' : 'solana:signTransaction',
    chainName: 'Solana',
    // Valeur d'une transaction Solana : non estimée ici (plafond : mot de passe redemandé).
    outFiat: null,
    details: [
      ...(req.txs.length > 1 ? [{ label: 'Transactions', value: String(req.txs.length) }] : []),
      ...(desc?.programs ?? []).slice(0, 8).map((p) => ({ label: 'Programme', value: typeof p === 'string' ? p : JSON.stringify(p) })),
    ],
  };
}

/* ── 3. Signer ── */

export interface ExecuteDeps {
  session: Session;
  wallets: Wallets;
  /** Injectables (tests) : diffusion. */
  sendEvm?: (chain: ChainConfig, req: RawTxRequest, from: string, pk: string) => Promise<string>;
  sendSolana?: (rawB64: string) => Promise<string>;
  sendBitcoin?: (hexTx: string) => Promise<string>;
  tokenMeta?: (chain: ChainConfig, token: string) => Promise<{ symbol: string; decimals: number } | null>;
  /** Mode compagnon : le lien avec le téléphone, qui signe à la place du coffre. */
  companion?: Companion;
}

/** Signe une transaction Solana sérialisée : notre signature, à NOTRE place parmi les signataires. */
export function signSolanaTx(bytes: Uint8Array, seed: Uint8Array, publicKey: Uint8Array): Uint8Array {
  // Nombre de signatures (compact-u16), puis les signatures, puis le message.
  let n = 0;
  let off = 0;
  for (let shift = 0; ; shift += 7) {
    const b = bytes[off++];
    n |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    if (shift > 14) throw new Error('compact-u16 invalide');
  }
  const sigStart = off;
  const message = bytes.subarray(off + 64 * n);
  const parsed = parseSolanaMessage(message);
  if (parsed.signerCount !== n) throw new RpcError(-32602, 'Transaction Solana incohérente');
  const me = base58.encode(publicKey);
  const idx = parsed.keys.slice(0, n).indexOf(me);
  if (idx < 0) throw new RpcError(4100, 'Ce compte ne signe pas cette transaction');
  const out = Uint8Array.from(bytes);
  out.set(ed25519.sign(message, seed), sigStart + 64 * idx);
  return out;
}

export async function execute(req: SignRequest, grant: { walletId: string; index: number }, opts: { reduceTo?: string; /** Site qui demande, montré sur le téléphone en mode compagnon. */ site?: string } = {}, deps: ExecuteDeps): Promise<unknown> {
  const family = req.kind === 'solMessage' || req.kind === 'solTx' ? 'solana' : req.kind === 'btcMessage' || req.kind === 'btcPsbt' ? 'bitcoin' : 'evm';
  // Compte du téléphone (mode compagnon) : la signature se fait là-bas, vérifiée ici.
  const meta = (await deps.wallets.list()).find((w) => w.id === grant.walletId);
  if (meta?.kind === 'companion') {
    // Sites Bitcoin depuis le téléphone : pas encore (le téléphone ne partage pas sa clé publique ici).
    if (family === 'bitcoin') throw new RpcError(4200, 'COMPANION_NO_BTC_SITES');
    if (!deps.companion) throw new RpcError(4900, 'COMPANION_UNAVAILABLE');
    const acct = meta.accounts[0];
    if ((family === 'evm' ? acct?.evm : acct?.solana)?.toLowerCase() !== req.from.toLowerCase()) throw new RpcError(4100, 'Ce compte n’est pas celui du téléphone');
    return executeOnPhone(req, meta, deps.companion, { reduceTo: opts.reduceTo, site: opts.site, tokenMeta: deps.tokenMeta ?? readTokenMeta });
  }
  const signer = await signerFor(deps.session, deps.wallets, grant.walletId, grant.index, family, req.from);

  if (req.kind === 'personal') {
    return withSigner(signer, async (s) => {
      if (s.curve !== 'secp256k1') throw new Error('courbe');
      const data = isHexString(req.hex) ? getBytes(req.hex) : req.hex;
      return new Wallet(`0x${bytesToHex(s.privateKey)}`).signMessage(data);
    });
  }
  if (req.kind === 'typed') {
    // Un EIP-712 pour un autre réseau que celui du site serait rejouable là-bas : refusé.
    const dc = req.data.domain?.chainId;
    if (dc !== undefined && dc !== null) {
      let n = Number.NaN;
      try {
        n = Number(typeof dc === 'string' && /^0x/i.test(dc) ? BigInt(dc) : (dc as number));
      } catch {
        /* reste NaN */
      }
      if (n !== Number.parseInt(req.chainId, 16)) {
        wipeSigner(signer);
        throw new RpcError(4901, `Signature pour le réseau ${String(dc)} demandée sur un autre réseau : refusée`);
      }
    }
    const { EIP712Domain: _drop, ...types } = req.data.types as Record<string, unknown>;
    return withSigner(signer, async (s) => {
      if (s.curve !== 'secp256k1') throw new Error('courbe');
      return new Wallet(`0x${bytesToHex(s.privateKey)}`).signTypedData(req.data.domain as never, types as never, req.data.message as never);
    });
  }
  if (req.kind === 'evmTx') {
    const chain = chainOfHex(req.chainId)!;
    let data = req.tx.data;
    if (opts.reduceTo !== undefined) {
      const d = decodeTx({ to: req.tx.to, value: BigInt(req.tx.value), data });
      if (d.kind !== 'approve') throw new RpcError(-32602, 'Rien à réduire');
      const meta = await (deps.tokenMeta ?? readTokenMeta)(chain, d.token);
      if (!meta) throw new RpcError(-32603, 'Décimales du jeton illisibles');
      const amount = parseAmount(opts.reduceTo, meta.decimals).raw;
      data = new Interface(['function approve(address,uint256)']).encodeFunctionData('approve', [d.spender, amount]);
    }
    const raw: RawTxRequest = {
      to: req.tx.to,
      data,
      value: BigInt(req.tx.value),
      chainId: chain.evmChainId!,
      gasLimit: req.tx.gas ? BigInt(req.tx.gas) : undefined,
      maxFeePerGas: req.tx.maxFeePerGas ? BigInt(req.tx.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: req.tx.maxPriorityFeePerGas ? BigInt(req.tx.maxPriorityFeePerGas) : undefined,
      gasPrice: !req.tx.maxFeePerGas && req.tx.gasPrice ? BigInt(req.tx.gasPrice) : undefined,
    };
    const send = deps.sendEvm ?? ((c: ChainConfig, r: RawTxRequest, from: string, pk: string) => (getAdapter(c.id) as EvmChainAdapter).sendContractTx(r, from, pk));
    return withSigner(signer, async (s) => {
      if (s.curve !== 'secp256k1') throw new Error('courbe');
      return send(chain, raw, req.from, `0x${bytesToHex(s.privateKey)}`);
    });
  }
  if (req.kind === 'btcMessage') {
    const sig = await withSigner(signer, async (s) => {
      if (s.curve !== 'secp256k1') throw new Error('courbe');
      return signBip322Message(req.text, { privateKey: s.privateKey, publicKey: s.publicKey });
    });
    return [{ signedMessage: base64.encode(utf8ToBytes(req.text)), signature: sig }];
  }
  if (req.kind === 'btcPsbt') {
    const tx = BtcTx.fromPSBT(base64.decode(req.psbt), { allowUnknownOutputs: true });
    await withSigner(signer, async (s) => {
      if (s.curve !== 'secp256k1') throw new Error('courbe');
      for (const n of req.indexes) tx.signIdx(s.privateKey, n, [SigHash.ALL, SigHash.DEFAULT]);
    });
    if (!req.send) return [{ signedPsbt: base64.encode(tx.toPSBT()) }];
    tx.finalize();
    const broadcast = deps.sendBitcoin ?? ((hexTx: string) => (getAdapter('bitcoin') as unknown as BitcoinChainAdapter).broadcastHex(hexTx));
    return [{ txId: await broadcast(tx.hex) }];
  }
  if (req.kind === 'solMessage') {
    const bytes = base64.decode(req.message);
    const sig = await withSigner(signer, async (s) => {
      if (s.curve !== 'ed25519') throw new Error('courbe');
      return ed25519.sign(bytes, s.secretKey);
    });
    return [{ signedMessage: req.message, signature: base64.encode(sig) }];
  }
  const signed = await withSigner(signer, async (s) => {
    if (s.curve !== 'ed25519') throw new Error('courbe');
    return req.txs.map((t) => signSolanaTx(base64.decode(t), s.secretKey, s.publicKey));
  });
  if (!req.send) return signed.map((b) => ({ signedTransaction: base64.encode(b) }));
  const sendSol =
    deps.sendSolana ??
    (async (b64: string) => {
      const a = getAdapter('solana') as SolanaChainAdapter;
      const sig = await a.rpc<string>('sendTransaction', [b64, { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 3 }]);
      if (!sig) throw new RpcError(-32603, 'Diffusion refusée par le réseau Solana');
      return sig;
    });
  const sig = await sendSol(base64.encode(signed[0]));
  return [{ signature: base64.encode(base58.decode(sig)) }];
}

/** Message de la demande en clair (utf-8), pour les tests et l'affichage. */
export const utf8B64 = (s: string) => base64.encode(utf8ToBytes(s));
