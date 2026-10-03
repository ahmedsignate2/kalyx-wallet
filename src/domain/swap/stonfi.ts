/**
 * Échanges sur TON via STON.fi (routeurs v2, pTON v2.1).
 *
 * LES MESSAGES SONT CONSTRUITS ICI, pas reçus d'un serveur. L'API de STON.fi
 * sert au DEVIS (montant attendu, minimum, routeur, portefeuilles de jettons du
 * routeur) ; le corps de l'échange — destinataire des jetons, adresse de
 * remboursement, commission — est écrit par l'app, avec NOTRE adresse. Format
 * repris du SDK officiel (@ston-fi/sdk 2.7, DEX v2.2 + pTON v2.1) et vérifié
 * octet par octet contre lui dans les tests : le SDK n'est pas embarqué (il
 * tirerait un client réseau complet dans l'app).
 *
 * Ce qui reste fourni par l'API, et comment on s'en protège :
 *  - le routeur : doit figurer dans la liste ci-dessous (routeurs v2 officiels,
 *    relevés le 28/09/2026 sur api.ston.fi/v1/routers) ;
 *  - le portefeuille pTON du routeur (échange DEPUIS TON — c'est là que partent
 *    les TON) : revérifié sur la chaîne via TonAPI avant de signer
 *    (`verifyTonSwap`) ;
 *  - le portefeuille du jeton demandé chez le routeur : s'il était faux,
 *    l'échange échouerait et les fonds reviendraient à NOTRE adresse de
 *    remboursement.
 * Commission Kalyx : 0,3 % (30 points de base), programme de parrainage STON.fi.
 */
import { Address, beginCell, Cell } from '@ton/core';
import { withTimeout } from '../chains/net';
import { SwapError } from './swapError';
import type { SwapQuote, SwapTokenInfo } from './lifi';

const API = 'https://api.ston.fi';
const TIMEOUT = 15_000;

/** Adresse que STON.fi utilise pour « TON natif ». */
export const STONFI_TON = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
/** Contrat pTON v2.1 (TON enveloppé) des routeurs v2. */
export const PTON_V2_1_MASTER = '0:671963027f7f85659ab55b821671688601cdcf1ee674fc7fbbb1a776a18d34a3';
/** Commission Kalyx, en points de base (30 = 0,3 %). */
export const KALYX_TON_FEE_BPS = 30;
/**
 * Destinataire des commissions : variable d'environnement, sinon l'adresse de
 * kalyxwallet.ton. STON.fi les accumule dans un coffre, retirable sur son site.
 */
export const TON_FEE_RECIPIENT =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_FEE_RECIPIENT_TON) || 'UQBapKtQghRx5Wh1WpscDbNNH9kLIpdd89rSxMU5EJCmVBrU';

/** Routeurs v2 officiels (forme brute). Un routeur absent d'ici : devis refusé. */
export const STONFI_ROUTERS: ReadonlySet<string> = new Set([
  '0:014fd182c8323ad026c2e1ceae4b7dc7143c1aa9de8c75d8b0208c3b0974e035',
  '0:029f5ea6f4ead9fa6c35f3a33836522954ff136f7aba495f5a5fc3634a055f25',
  '0:031053133270be82ee6fd94d1963c0186868403a4f537040a0d533aab805b7af',
  '0:0657dbf0d75b4a5b640e09809712621dcae7ccde9e427dc807718f4d8a204b7d',
  '0:091b9a7264f58489088c54975fedb0d18112f383a411e7ba8a791b0eacc3be9d',
  '0:1061b9dbd4418ad166fc9a4def116e2f6c74f2bfb70e71f2653d643ceffebfa9',
  '0:13bcefc15df905a1c397865bded351197ec8b2163a15fb493d08b9a9830b7356',
  '0:20111179b6facd9f400cd91aebbe4f8cbad18feb464bef46c93eeaaf093198fb',
  '0:222d5ebbec1807357114b832770b0f0ae563a22523bceb187c610ab62ed84912',
  '0:22bf722ec5803a64612e9ce819493b8c0736e98f045b5b0d3df96b04fa2a8a28',
  '0:2c6b9a7f516c540da53d9fd6e8dc202fdb144dacd16369d866ef425001eb1d56',
  '0:320fb3bc0af55d47c00425cafde9f1c8d627c5ab6d52f1032dd5cce2e487c93f',
  '0:3263694143a46c55ef3c08a4e6787dc1596b14096bbbba040d69fe64c0b0d802',
  '0:33d43d195221bff570b28eb275fb14f1f829e69d0dc9dcb30a43bb194ebf9794',
  '0:429752403644e932927d37795992d3cca69d9bb517b6bd5c07a27d256bc89b46',
  '0:42b6537b672f7aab1fb7c87d188b857448db50fbc45b85868db3ae4c0b81f07e',
  '0:5012b262d031e0298b1e207b6b424e0de4240b0abdd7630910204c341cdb38ef',
  '0:50fd4050bd1f6bc948ca0f08a3b688b2ca06b65a5fb2266e98f2097493e1c387',
  '0:52357ff99928a4055b6d5a121a21bd1ff23254edf2fa92fcb2155a6977b75644',
  '0:598fb9e15cd841e0ef6b4429f8a864bcd8365a3d43e5c8cda4e99adbbd0d63dc',
  '0:5df6f7d67e7e8c3aa0581046057b216a962398967d739c59257e9f01d36ce54b',
  '0:6280c9db638354d6ec1dbf37abb55e66bffc88ef6f3647e7df5bb5d91563c455',
  '0:632bf92363947f0e8c9345f7f5d3d57316b4a5285082fe038e58832dc84bc272',
  '0:6333b0763ca6bcd883caad415b30568a7900c51933119ebbd8d539a9b42ecac7',
  '0:6a8024ddaed4a877be94adc39e00b4a22c2a775ae348150050bf28e395032fc0',
  '0:70a4118401bf8d823531a66011020565f02e05ff91ac5f1677769b00d6acd07a',
  '0:720032f945ad9d95dacc48172d81f4a6d97d96d4feb53555b64580dbf1e24d24',
  '0:7392a00de15898752db8943d9f14f7bca1d1e7dab5247cc61b109f3c10128101',
  '0:8274d9a3e106cd8eb83f3ccf89244f81f5ffdccd72e4626aceecff54900eadb7',
  '0:834fd7424f9da975fb0b356d1eeaa3f94f7720abb338520ef6ce419880fd7bb6',
  '0:91830b856cf451ed31a87642706e3881b4db5bd217f324896257ee6463a94aaf',
  '0:92e1411ae546892f33b2c8a89ea90390d8ff4cfbb917a643b91e73f706fdb9d1',
  '0:a1a113a9b9433872937a211cea353ae43fd8956476281e0c4c0010d5536f2f95',
  '0:a2ca9a0158d2043e56ab069d3851e3f2123e731f46431f1b9136a275590c7714',
  '0:a2cfbe05095da5625bc53c46212f726a97c5b020eed0bdbbd84fe2d01f44a6b4',
  '0:a9b98b6ae799e193060398be0e5a3b2b758cbcde08f9ff8f673514390ab3cecd',
  '0:b191855071f5cac3db89f8c32dbadbd1d82bb40d509915f2cd069e8dc1780ef2',
  '0:b1d070c9fc3c4bc43490c9fb04a8723c46ceb99f282f766783f516bbad8d7939',
  '0:baee8dbed94cd1d5c245ad418be4cece0272e01bca18fed1da4e01a647adcb40',
  '0:c03f27bb1c03c0025e165e9cf98ce09d85fd87f61f50924cd143ee8ae6eb22b9',
  '0:c16148f92843d442b6e3edd6bbe36518248793f505390b674ab22d7649d437ca',
  '0:d0ea3e77ab6d47b99b70ea87259bbcf82d4d9c1ba4b638abe9492307e78f1dee',
  '0:d36f5c354c2a2116a9cd7323ebadb6c1250740c303e7f036c2a1a4947744b94f',
  '0:e079b10c03acab888ed231f7c4eb90c8540f6bcd24667c657f832df294884b89',
  '0:e1e681cfbdf4703eed9b3910460a82c43b859064a2f87e4e430f583275e346f6',
  '0:e2d5e594dc7596b2df28c18f0e32ad83cfd9c92441d444ecdaf11fbfc0419bf3',
  '0:e49dcb89dbaecfcb71262f65c037b62c48d40c52ef2ef861ec5bd8d5963707f1',
  '0:f0ca38239d35c954f8d78e2dce3ed52295c0a371e19540e2c6c2bf7fb112e322',
  '0:f1fbe8d453d3d4b4796d3d8657ef0773222d123d8dca67c9ef3acd2266f40977',
  '0:f5d6cb8792b3bfd4c6f9208758171e593f2dfc32e1e8787c7a740f9045a0fcc3',
]);

// Opérations et gas du SDK officiel (DEX v2.2, pTON v2.1).
const OP_SWAP = 0x6664de2a;
const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_PTON_TON_TRANSFER = 0x01f3835d;
const GAS = {
  jettonToJetton: { gas: 300_000_000n, forward: 240_000_000n },
  jettonToTon: { gas: 300_000_000n, forward: 240_000_000n },
  tonToJetton: { forward: 300_000_000n },
  ptonTransfer: 10_000_000n,
};
/** Frais réseau du portefeuille lui-même (message externe), marge comprise. */
const TON_WALLET_FEE_MARGIN = 20_000_000n;

/**
 * TON à garder EN PLUS du montant pour un échange STON.fi : le gas transmis au
 * routeur (0,3 TON, l'essentiel revient en excédent) + le transfert pTON + les
 * frais du portefeuille. La réserve d'un envoi simple (0,01 TON) était utilisée
 * ici : « Max » ou un montant proche du solde laissait le portefeuille incapable
 * de payer ce gas, et l'émulation refusait l'échange sans rien expliquer.
 * Couvre aussi l'échange d'un jeton (0,3 TON de gas joints au transfert).
 */
export const STONFI_TON_RESERVE = GAS.tonToJetton.forward + GAS.ptonTransfer + TON_WALLET_FEE_MARGIN;

/** TON que le portefeuille doit détenir pour envoyer `messages` (montants + frais). */
export function tonNeededForMessages(messages: { amount: bigint }[]): bigint {
  return messages.reduce((sum, m) => sum + m.amount, 0n) + TON_WALLET_FEE_MARGIN;
}

/** Délai de validité d'un échange (celui du SDK : 15 minutes). */
const DEADLINE_SECONDS = 900;

const raw = (a: string) => Address.parse(a).toRawString();
export const isTonNative = (a: string) =>
  a === STONFI_TON || a === 'ton' || /^0x0{40}$/i.test(a) || raw(a) === raw(STONFI_TON);

/** Corps d'échange v2 (le « forward payload » envoyé au routeur). */
export function swapBody(p: {
  askJettonWallet: string;
  receiver: string;
  minAskAmount: bigint;
  deadline: number;
  referral: string;
  referralBps: number;
}): Cell {
  return beginCell()
    .storeUint(OP_SWAP, 32)
    .storeAddress(Address.parse(p.askJettonWallet))
    .storeAddress(Address.parse(p.receiver)) // remboursement
    .storeAddress(Address.parse(p.receiver)) // excédents de gas
    .storeUint(p.deadline, 64)
    .storeRef(
      beginCell()
        .storeCoins(p.minAskAmount)
        .storeAddress(Address.parse(p.receiver)) // destinataire des jetons
        .storeCoins(0n)
        .storeMaybeRef(null)
        .storeCoins(0n)
        .storeMaybeRef(null)
        .storeUint(p.referralBps, 16)
        .storeAddress(Address.parse(p.referral))
        .endCell(),
    )
    .endCell();
}

/** Message à signer : destination, TON joints, corps (BoC base64). */
export interface TonSwapMessage {
  to: string;
  amount: bigint;
  payload: string;
}

/**
 * Messages d'un échange. `offerJettonWallet` : pour un jeton offert, le
 * portefeuille de CE jeton appartenant à l'utilisateur (lu chez TonAPI, pas chez
 * STON.fi) ; pour TON offert, le portefeuille pTON du routeur (vérifié ensuite).
 */
export function buildSwapMessage(p: {
  user: string;
  router: string;
  offerIsTon: boolean;
  offerJettonWallet: string;
  askJettonWallet: string;
  askIsTon: boolean;
  offerAmount: bigint;
  minAskAmount: bigint;
  nowSeconds: number;
}): TonSwapMessage {
  const body = swapBody({
    askJettonWallet: p.askJettonWallet,
    receiver: p.user,
    minAskAmount: p.minAskAmount,
    deadline: p.nowSeconds + DEADLINE_SECONDS,
    referral: TON_FEE_RECIPIENT,
    referralBps: KALYX_TON_FEE_BPS,
  });
  if (p.offerIsTon) {
    const forward = GAS.tonToJetton.forward;
    const transfer = beginCell()
      .storeUint(OP_PTON_TON_TRANSFER, 32)
      .storeUint(0, 64)
      .storeCoins(p.offerAmount)
      .storeAddress(Address.parse(p.user))
      .storeBit(true)
      .storeRef(body)
      .endCell();
    return { to: p.offerJettonWallet, amount: p.offerAmount + forward + GAS.ptonTransfer, payload: transfer.toBoc().toString('base64') };
  }
  const g = p.askIsTon ? GAS.jettonToTon : GAS.jettonToJetton;
  const transfer = beginCell()
    .storeUint(OP_JETTON_TRANSFER, 32)
    .storeUint(0, 64)
    .storeCoins(p.offerAmount)
    .storeAddress(Address.parse(p.router))
    .storeAddress(Address.parse(p.user))
    .storeBit(false)
    .storeCoins(g.forward)
    .storeBit(true)
    .storeRef(body)
    .endCell();
  return { to: p.offerJettonWallet, amount: g.gas, payload: transfer.toBoc().toString('base64') };
}

interface SimulateResponse {
  offer_units?: string;
  ask_units?: string;
  min_ask_units?: string;
  offer_jetton_wallet?: string;
  ask_jetton_wallet?: string;
  router_address?: string;
  router?: { major_version?: number; pton_master_address?: string };
  price_impact?: string;
  fee_units?: string;
}

export interface StonfiQuoteParams {
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
  /** Adresse TON de l'utilisateur. */
  fromAddress: string;
  /** Portefeuille du jeton offert chez l'utilisateur (TonAPI) ; absent si TON est offert. */
  userOfferJettonWallet?: string;
  slippage?: number;
  fromTokenInfo?: Partial<SwapTokenInfo>;
  toTokenInfo?: Partial<SwapTokenInfo>;
  nowSeconds?: number;
}

/** Devis STON.fi → SwapQuote avec les messages TON déjà construits. */
export async function getStonfiQuote(p: StonfiQuoteParams, fetchImpl: typeof fetch = fetch): Promise<SwapQuote | null> {
  const offerIsTon = isTonNative(p.fromToken);
  const askIsTon = isTonNative(p.toToken);
  if (offerIsTon && askIsTon) return null;
  if (!offerIsTon && !p.userOfferJettonWallet) throw new SwapError('INSUFFICIENT_FUNDS', 'Jeton non détenu');
  const slippage = p.slippage ?? 0.01;
  const qs = new URLSearchParams({
    offer_address: offerIsTon ? STONFI_TON : p.fromToken,
    ask_address: askIsTon ? STONFI_TON : p.toToken,
    units: p.fromAmount.toString(),
    slippage_tolerance: String(slippage),
    dex_v2: 'true',
    referral_address: TON_FEE_RECIPIENT,
    referral_fee_bps: String(KALYX_TON_FEE_BPS),
  });
  const res = await withTimeout(fetchImpl(`${API}/v1/swap/simulate?${qs}`, { method: 'POST' }), TIMEOUT, () => new SwapError('NETWORK', 'STON.fi : délai dépassé'));
  const j = (await res.json().catch(() => null)) as SimulateResponse | null;
  if (!res.ok || !j?.router_address || !j.min_ask_units || !j.ask_jetton_wallet || !j.offer_jetton_wallet) {
    throw new SwapError('NO_ROUTE', 'STON.fi : aucune route');
  }
  if (BigInt(j.offer_units ?? '0') !== p.fromAmount) throw new SwapError('PROVIDER_UNAVAILABLE', 'STON.fi : montant du devis incohérent');
  /*
   * COHÉRENCE du devis : le minimum reçu doit valoir au moins
   * `ask × (1 − glissement)` (1 point de base d'arrondi). Un minimum à 1, sans
   * rapport avec le glissement choisi, est refusé. Ce n'est PAS une garantie de
   * prix contre une API qui mentirait aussi sur `ask` : seule une référence
   * indépendante le permettrait.
   */
  const ask = BigInt(j.ask_units ?? '0');
  const minAsk = BigInt(j.min_ask_units);
  const bps = BigInt(Math.ceil(slippage * 10_000)) + 1n;
  if (ask <= 0n || minAsk <= 0n || minAsk > ask || minAsk * 10_000n < ask * (10_000n - bps)) {
    throw new SwapError('PROVIDER_UNAVAILABLE', 'STON.fi : minimum reçu incohérent avec le glissement choisi');
  }
  const router = raw(j.router_address);
  if (!STONFI_ROUTERS.has(router) || j.router?.major_version !== 2 || raw(j.router?.pton_master_address ?? STONFI_TON) !== PTON_V2_1_MASTER) {
    throw new SwapError('PROVIDER_UNAVAILABLE', 'STON.fi : routeur non reconnu');
  }
  const msg = buildSwapMessage({
    user: p.fromAddress,
    router: j.router_address,
    offerIsTon,
    // Jeton offert : NOTRE portefeuille (TonAPI). TON offert : le pTON du routeur (revérifié avant signature).
    offerJettonWallet: offerIsTon ? j.offer_jetton_wallet : p.userOfferJettonWallet!,
    askJettonWallet: j.ask_jetton_wallet,
    askIsTon,
    offerAmount: p.fromAmount,
    minAskAmount: BigInt(j.min_ask_units),
    nowSeconds: p.nowSeconds ?? Math.floor(Date.now() / 1000),
  });
  const token = (addr: string, info?: Partial<SwapTokenInfo>): SwapTokenInfo => ({ address: addr, symbol: info?.symbol ?? '', decimals: info?.decimals ?? 9, logo: info?.logo });
  return {
    fromAmount: p.fromAmount,
    toAmount: BigInt(j.ask_units ?? j.min_ask_units),
    toAmountMin: BigInt(j.min_ask_units),
    fromToken: token(p.fromToken, p.fromTokenInfo),
    toToken: token(p.toToken, p.toTokenInfo),
    approvalAddress: null,
    toolName: 'STON.fi',
    gasCostUsd: 0,
    gasCostNative: msg.amount - (offerIsTon ? p.fromAmount : 0n),
    gasToken: null,
    feeCostUsd: 0,
    durationSec: 10,
    fromAmountUsd: 0,
    toAmountUsd: 0,
    slippage,
    kalyxFeeApplied: KALYX_TON_FEE_BPS / 10_000,
    tx: { type: 'ton', messages: [msg], router, ptonWallet: offerIsTon ? raw(j.offer_jetton_wallet) : undefined },
  };
}

/**
 * Dernier contrôle avant signature d'un échange TON : routeur officiel, et pour
 * un échange DEPUIS TON, portefeuille pTON du routeur relu sur la chaîne.
 */
export async function verifyTonSwap(
  tx: { messages: TonSwapMessage[]; router: string; ptonWallet?: string },
  jettonWalletOf: (owner: string, master: string) => Promise<string | null>,
): Promise<void> {
  if (!STONFI_ROUTERS.has(tx.router)) throw new SwapError('PROVIDER_UNAVAILABLE', 'STON.fi : routeur non reconnu');
  if (tx.messages.length !== 1) throw new SwapError('PROVIDER_UNAVAILABLE', 'STON.fi : devis inattendu');
  if (tx.ptonWallet) {
    const onchain = await jettonWalletOf(tx.router, PTON_V2_1_MASTER);
    if (!onchain || raw(onchain) !== tx.ptonWallet || raw(tx.messages[0].to) !== tx.ptonWallet) {
      throw new SwapError('PROVIDER_UNAVAILABLE', 'STON.fi : portefeuille pTON du routeur non vérifié');
    }
  }
}

/**
 * Relit le message d'échange et vérifie que tout revient à `user` : destinataire
 * des jetons, remboursement, excédents — et, pour un jeton offert, que le
 * transfert va bien au routeur `router`. Rend false au moindre écart.
 */
export function tonSwapPaysUser(msg: TonSwapMessage, user: string, router: string): boolean {
  try {
    const me = Address.parse(user);
    const s = Cell.fromBase64(msg.payload).beginParse();
    const op = s.loadUint(32);
    s.loadUintBig(64);
    s.loadCoins();
    let body: Cell;
    if (op === OP_PTON_TON_TRANSFER) {
      if (!s.loadAddress().equals(me)) return false; // remboursement
      if (!s.loadBit()) return false;
      body = s.loadRef();
    } else if (op === OP_JETTON_TRANSFER) {
      if (!s.loadAddress().equals(Address.parse(router))) return false; // destination = le routeur
      if (!s.loadAddress().equals(me)) return false; // excédents du transfert
      if (s.loadBit()) s.loadRef();
      s.loadCoins();
      if (!s.loadBit()) return false;
      body = s.loadRef();
    } else {
      return false;
    }
    const b = body.beginParse();
    if (b.loadUint(32) !== OP_SWAP) return false;
    b.loadAddress(); // portefeuille du jeton demandé, chez le routeur
    if (!b.loadAddress().equals(me) || !b.loadAddress().equals(me)) return false; // remboursement, excédents
    b.loadUint(64);
    const inner = b.loadRef().beginParse();
    inner.loadCoins();
    return inner.loadAddress().equals(me); // destinataire des jetons
  } catch {
    return false;
  }
}
