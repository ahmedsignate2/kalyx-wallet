import { beforeEach, describe, expect, test } from 'vitest';
import { Interface, Wallet, verifyMessage, verifyTypedData, hexlify, toUtf8Bytes } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';
import { makeDapp } from './dapp';
import { makeApprovals, type Decision } from './approvals';
import { makeSites } from './sites';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';
import { review, utf8B64 } from './dappSign';
import { bytesToHex } from '@noble/hashes/utils';
import { Transaction as BtcTx, p2wpkh, SigHash } from '@scure/btc-signer';
import { deriveBtcSigner, p2wpkhAddress } from '../../src/crypto/btc';
import { mnemonicToSeedSync } from '../../src/crypto/mnemonic';
import { signBip322Message } from '../../src/domain/chains/btcSign';
import { explainT } from '../ui/i18n';
import type { RawTxRequest } from '../../src/domain/chains/EvmChainAdapter';

const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EVM0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL0 = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const SITE = 'https://app.uniswap.org';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPENDER = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const MAX = (1n << 256n) - 1n;

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

let session: ReturnType<typeof makeSession>;
let wallets: ReturnType<typeof makeWallets>;
let dapp: ReturnType<typeof makeDapp>;
let approvals: ReturnType<typeof makeApprovals>;
let walletId: string;
let decide: (id: string) => Decision;
let lastError: { code: number; message: string } | null;
let allowed: boolean;
let sentEvm: { req: RawTxRequest; from: string; pkAddress: string }[];
let sentSol: string[];
let sentBtc: string[];
let opened: number;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code: number }).code;
  }
};

beforeEach(async () => {
  const disk = makeStore(area());
  session = makeSession({ disk, session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
  wallets = makeWallets(disk, session);
  lastError = null;
  allowed = true;
  sentEvm = [];
  sentSol = [];
  sentBtc = [];
  opened = 0;
  decide = () => ({ approve: true, walletId, index: 0 });
  approvals = makeApprovals({
    open: async (id) => {
      opened++;
      queueMicrotask(async () => {
        const r = await approvals.respond(id, decide(id));
        if (!r.ok) {
          lastError = r.error;
          await approvals.respond(id, { approve: false });
        }
      });
      return opened;
    },
    close: async () => {},
  });
  dapp = makeDapp({
    session,
    wallets,
    sites: makeSites(disk),
    approvals,
    emit: () => {},
    t: explainT,
    dappAllowed: async () => allowed,
    executeDeps: {
      sendEvm: async (_c, req, from, pk) => (sentEvm.push({ req, from, pkAddress: new Wallet(pk).address }), `0x${'cd'.repeat(32)}`),
      sendSolana: async (b64) => (sentSol.push(b64), base58.encode(new Uint8Array(64).fill(7))),
      tokenMeta: async () => ({ symbol: 'USDC', decimals: 6 }),
      sendBitcoin: async (hexTx) => (sentBtc.push(hexTx), 'f'.repeat(64)),
    },
  });
  await session.create('Plage-Orange-47!');
  walletId = (await wallets.importPhrase(ABOUT)).id;
  await dapp.handle(SITE, 'evm', 'eth_requestAccounts', []);
  await dapp.handle(SITE, 'solana', 'sol_connect', [{}]);
});

const approveData = (amount: bigint) => new Interface(['function approve(address,uint256)']).encodeFunctionData('approve', [SPENDER, amount]);

describe('EVM : messages', () => {
  test('personal_sign : signature valide du compte accordé', async () => {
    const msg = 'Bienvenue sur Uniswap';
    const sig = (await dapp.handle(SITE, 'evm', 'personal_sign', [hexlify(toUtf8Bytes(msg)), EVM0])) as string;
    expect(verifyMessage(msg, sig)).toBe(EVM0);
  });

  test('eth_sign (hachage brut) refusé ; site non connecté refusé ; autre compte refusé', async () => {
    expect(await code(dapp.handle(SITE, 'evm', 'eth_sign', [EVM0, `0x${'11'.repeat(32)}`]))).toBe(4200);
    expect(await code(dapp.handle('https://autre.example', 'evm', 'personal_sign', ['0x6869', EVM0]))).toBe(4100);
    expect(await code(dapp.handle(SITE, 'evm', 'personal_sign', ['0x6869', '0x1111111111111111111111111111111111111111']))).toBe(4100);
  });

  test('EIP-712 : signature valide ; domaine d’un autre réseau refusé (rejouable là-bas)', async () => {
    const domain = { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: USDC };
    const types = { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] };
    const message = { owner: EVM0, spender: SPENDER, value: '1000000', nonce: 0, deadline: 1_900_000_000 };
    const typed = JSON.stringify({ domain, types: { EIP712Domain: [{ name: 'name', type: 'string' }], ...types }, primaryType: 'Permit', message });
    const sig = (await dapp.handle(SITE, 'evm', 'eth_signTypedData_v4', [EVM0, typed])) as string;
    expect(verifyTypedData(domain, types, message, sig)).toBe(EVM0);
    const other = JSON.stringify({ domain: { ...domain, chainId: 137 }, types, primaryType: 'Permit', message });
    // Refusé dès l'arrivée, avant toute fenêtre (comme MetaMask) : rien à approuver.
    expect(await code(dapp.handle(SITE, 'evm', 'eth_signTypedData_v4', [EVM0, other]))).toBe(-32602);
    const hexOther = JSON.stringify({ domain: { ...domain, chainId: '0x89' }, types, primaryType: 'Permit', message });
    expect(await code(dapp.handle(SITE, 'evm', 'eth_signTypedData_v4', [EVM0, hexOther]))).toBe(-32602);
  });
});

describe('EVM : transactions', () => {
  test('signée par le compte accordé, sur le réseau DU SITE', async () => {
    await dapp.handle(SITE, 'evm', 'wallet_switchEthereumChain', [{ chainId: '0x2105' }]);
    const hash = await dapp.handle(SITE, 'evm', 'eth_sendTransaction', [{ from: EVM0, to: SPENDER, value: '0x10', data: '0x' }]);
    expect(hash).toBe(`0x${'cd'.repeat(32)}`);
    expect(sentEvm[0].pkAddress).toBe(EVM0);
    expect(sentEvm[0].req.chainId).toBe(8453);
    expect(sentEvm[0].req.value).toBe(16n);
  });

  test('refus : déploiement, autre compte, autre réseau', async () => {
    expect(await code(dapp.handle(SITE, 'evm', 'eth_sendTransaction', [{ from: EVM0, data: '0x6080' }]))).toBe(4200);
    expect(await code(dapp.handle(SITE, 'evm', 'eth_sendTransaction', [{ from: '0x1111111111111111111111111111111111111111', to: SPENDER }]))).toBe(4100);
    expect(await code(dapp.handle(SITE, 'evm', 'eth_sendTransaction', [{ from: EVM0, to: SPENDER, chainId: '0x89' }]))).toBe(4901);
    expect(sentEvm).toHaveLength(0);
  });

  test('approbation illimitée RÉDUITE au montant choisi', async () => {
    decide = () => ({ approve: true, walletId, index: 0, reduceTo: '5' });
    await dapp.handle(SITE, 'evm', 'eth_sendTransaction', [{ from: EVM0, to: USDC, data: approveData(MAX) }]);
    const [, amount] = new Interface(['function approve(address,uint256)']).decodeFunctionData('approve', sentEvm[0].req.data!);
    expect(amount).toBe(5_000_000n);
  });

  test('liste blanche en vigueur : aucune signature de dApp', async () => {
    allowed = false;
    expect(await code(dapp.handle(SITE, 'evm', 'personal_sign', ['0x6869', EVM0]))).toBe(4100);
    expect(opened).toBe(2); // seulement les deux connexions du début
  });

  test('refus dans la fenêtre : 4001, rien de signé', async () => {
    decide = (id) => (approvals.get(id)?.kind === 'sign' ? { approve: false } : { approve: true, walletId, index: 0 });
    expect(await code(dapp.handle(SITE, 'evm', 'eth_sendTransaction', [{ from: EVM0, to: SPENDER }]))).toBe(4001);
    expect(sentEvm).toHaveLength(0);
  });
});

/** Transaction Solana « legacy » minimale : virement système de `from` vers `to`. */
function solTransfer(from: string, to: string, signers = [from]): Uint8Array {
  const SYS = '11111111111111111111111111111111';
  const keys = [...signers, ...[from, to].filter((k) => !signers.includes(k)), SYS];
  const header = [signers.length, 0, 1];
  const ix = [keys.length - 1, 2, keys.indexOf(from), keys.indexOf(to), 12, 2, 0, 0, 0, 0x40, 0x42, 0x0f, 0, 0, 0, 0, 0];
  const msg = Uint8Array.from([...header, keys.length, ...keys.flatMap((k) => [...base58.decode(k)]), ...new Uint8Array(32).fill(9), 1, ...ix]);
  return Uint8Array.from([signers.length, ...new Uint8Array(64 * signers.length), ...msg]);
}

describe('Solana', () => {
  const pub = base58.decode(SOL0);
  const RECIPIENT = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

  test('signMessage : signature ed25519 valide du compte accordé', async () => {
    const msg = utf8B64('Connexion à Jupiter');
    const [r] = (await dapp.handle(SITE, 'solana', 'sol_signMessage', [{ message: msg }])) as { signature: string }[];
    expect(ed25519.verify(base64.decode(r.signature), base64.decode(msg), pub)).toBe(true);
  });

  test('un « message » qui est une transaction : refusé', async () => {
    const tx = solTransfer(SOL0, RECIPIENT);
    expect(await code(dapp.handle(SITE, 'solana', 'sol_signMessage', [{ message: base64.encode(tx.subarray(65)) }]))).toBe(4200);
  });

  test('signTransaction : notre signature, à notre place, sur le message exact', async () => {
    const tx = solTransfer(SOL0, RECIPIENT);
    const [r] = (await dapp.handle(SITE, 'solana', 'sol_signTransaction', [{ transaction: base64.encode(tx), chain: 'solana:mainnet' }])) as { signedTransaction: string }[];
    const signed = base64.decode(r.signedTransaction);
    expect(ed25519.verify(signed.subarray(1, 65), tx.subarray(65), pub)).toBe(true);
    expect(signed.subarray(65)).toEqual(tx.subarray(65));
  });

  test('transaction que notre compte ne signe pas : refusée ; autre réseau : refusé', async () => {
    const tx = solTransfer(RECIPIENT, SOL0);
    expect(await code(dapp.handle(SITE, 'solana', 'sol_signTransaction', [{ transaction: base64.encode(tx) }]))).toBe(4001);
    expect(lastError?.code).toBe(4100);
    expect(await code(dapp.handle(SITE, 'solana', 'sol_signTransaction', [{ transaction: base64.encode(solTransfer(SOL0, RECIPIENT)), chain: 'solana:devnet' }]))).toBe(4200);
  });

  test('signAndSend : diffusée, signature rendue', async () => {
    const [r] = (await dapp.handle(SITE, 'solana', 'sol_signAndSendTransaction', [{ transaction: base64.encode(solTransfer(SOL0, RECIPIENT)) }])) as { signature: string }[];
    expect(sentSol).toHaveLength(1);
    expect(base64.decode(r.signature)).toEqual(new Uint8Array(64).fill(7));
  });
});

const STRANGER_CONTRACT = '0x1111111111111111111111111111111111111111';

describe('explication (fenêtre)', () => {
  test('plusieurs transactions Solana : le risque monte, et la fenêtre le dit', async () => {
    const one = base64.encode(solTransfer('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'));
    const r = await review({ kind: 'solTx', from: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk', txs: [one, one, one], send: false }, SITE, { t: explainT, phishing: async () => false });
    expect(r.explanation.risk).not.toBe('none');
    expect(r.explanation.reasons.join(' ')).toMatch(/3 transactions/);
  });

  const quiet = { t: explainT, phishing: async () => false, assess: async () => null as never, simulate: async () => ({ source: 'static', changes: [], approvals: [] }) as never, tokenMeta: async () => ({ symbol: 'USDC', decimals: 6 }) };

  test('approbation illimitée : risque signalé, réduction proposée', async () => {
    const r = await review({ kind: 'evmTx', from: EVM0, chainId: '0x1', tx: { to: USDC, data: approveData(MAX), value: '0x0' } }, SITE, quiet);
    expect(r.explanation.risk).not.toBe('none');
    expect(r.explanation.canReduceApproval).toBe(true);
    expect(r.reduce).toMatchObject({ symbol: 'USDC', decimals: 6 });
  });

  test('SIWE pour un autre domaine que le site : danger', async () => {
    const text = `evil.example wants you to sign in with your Ethereum account:\n${EVM0}\n\nSign in\n\nURI: https://evil.example\nVersion: 1\nChain ID: 1\nNonce: abcdefgh\nIssued At: 2026-01-01T00:00:00Z`;
    const r = await review({ kind: 'personal', from: EVM0, hex: hexlify(toUtf8Bytes(text)), text, siwe: (await import('../../src/domain/wc/message')).parseSiwe(text) }, SITE, quiet);
    expect(r.explanation.risk).toBe('danger');
  });

  test('site signalé comme hameçonnage : danger', async () => {
    const r = await review({ kind: 'personal', from: EVM0, hex: '0x6869', text: 'hi', siwe: null }, SITE, { ...quiet, phishing: async () => true });
    expect(r.explanation.risk).toBe('danger');
    expect(r.explanation.holdToSign).toBe(true);
  });

  test('score : approbation illimitée sur un site nouveau, page altérée → élevé, raisons expliquées', async () => {
    const r = await review({ kind: 'evmTx', from: EVM0, chainId: '0x1', tx: { to: USDC, data: approveData(MAX), value: '0x0' } }, SITE, { ...quiet, site: async () => ({ known: false, tampered: ['rdnsSpoof'] }) });
    expect(r.score.factors.map((f) => f.code)).toEqual(['pageTampered', 'unlimitedApproval', 'firstVisit']);
    expect(r.score).toMatchObject({ score: 80, level: 'high' });
  });

  test('score : sosie d’une marque et http public', async () => {
    const r = await review({ kind: 'personal', from: EVM0, hex: '0x6869', text: 'hi', siwe: null }, 'http://uniswap-app.com', { ...quiet, site: async () => ({ known: true, tampered: [] }) });
    expect(r.score.factors.map((f) => f.code)).toContain('insecureSite');
    // Message simple, site connu, rien de signalé : faible.
    const clean = await review({ kind: 'personal', from: EVM0, hex: '0x6869', text: 'hi', siwe: null }, SITE, { ...quiet, site: async () => ({ known: true, tampered: [] }) });
    expect(clean.score).toMatchObject({ score: 0, level: 'low' });
  });

  test('aperçu : simulation en échec → statut « failed », aucune erreur brute dans le texte affiché', async () => {
    const tx = { kind: 'evmTx', from: EVM0, chainId: '0x1', tx: { to: STRANGER_CONTRACT, data: '0xa9059cbb' + '0'.repeat(128), value: '0x0' } } as const;
    const r = await review(tx, SITE, { ...quiet, simulate: async () => ({ source: 'node', changes: [], approvals: [], error: 'execution reverted: ERC20: transfer amount exceeds balance' }) as never });
    expect(r.preview).toEqual({ status: 'failed', error: 'execution reverted: ERC20: transfer amount exceeds balance' });
    const shown = [r.explanation.headline, r.explanation.detail ?? '', ...r.explanation.reasons].join(' ');
    expect(shown).not.toMatch(/execution reverted/);
  });

  test('aperçu : pas de simulateur (lecture statique) sur un appel de contrat → « unavailable » ; simple envoi → rien', async () => {
    const call = await review({ kind: 'evmTx', from: EVM0, chainId: '0x1', tx: { to: STRANGER_CONTRACT, data: '0x12345678', value: '0x0' } }, SITE, quiet);
    expect(call.preview).toEqual({ status: 'unavailable' });
    expect(call.explanation.detail ?? '').not.toMatch(/simulation/i);
    const plain = await review({ kind: 'evmTx', from: EVM0, chainId: '0x1', tx: { to: STRANGER_CONTRACT, data: '0x', value: '0x2386f26fc10000' } }, SITE, quiet);
    expect(plain.preview).toBeUndefined();
    // Simulateur muet (null) sur un appel avec valeur : la phrase technique « non simulé » laisse place à l'aperçu.
    const mute = await review({ kind: 'evmTx', from: EVM0, chainId: '0x1', tx: { to: STRANGER_CONTRACT, data: '0x12345678', value: '0x2386f26fc10000' } }, SITE, { ...quiet, simulate: async () => null as never });
    expect(mute.preview).toEqual({ status: 'unavailable' });
    expect(mute.explanation.lose.length).toBe(1);
    expect(mute.explanation.reasons.join(' ')).not.toMatch(/simul/i);
  });

});

describe('Bitcoin (Wallet Standard)', () => {
  const BTC0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
  const DEST = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
  const keys = () => deriveBtcSigner(mnemonicToSeedSync(ABOUT), 0);
  /** PSBT : une entrée à nous (200 000 sats), une sortie vers DEST, la monnaie vers nous. Option : une entrée étrangère, un sighash. */
  const psbt = (opts: { foreign?: boolean; sighash?: number } = {}) => {
    const me = p2wpkh(keys().publicKey);
    const other = p2wpkh(deriveBtcSigner(mnemonicToSeedSync(ABOUT), 5).publicKey);
    const tx = new BtcTx();
    tx.addInput({ txid: 'a'.repeat(64), index: 0, witnessUtxo: { script: me.script, amount: 200_000n }, ...(opts.sighash !== undefined ? { sighashType: opts.sighash } : {}) });
    if (opts.foreign) tx.addInput({ txid: 'b'.repeat(64), index: 1, witnessUtxo: { script: other.script, amount: 50_000n } });
    tx.addOutputAddress(DEST, 120_000n);
    tx.addOutputAddress(BTC0, 79_000n);
    return base64.encode(tx.toPSBT());
  };
  const ask = (indexes: number[], extra: Record<string, unknown> = {}) => [{ psbt: psbt(extra as never), inputsToSign: [{ address: BTC0, signingIndexes: indexes }], chain: 'bitcoin:mainnet' }];

  beforeEach(async () => {
    const r = (await dapp.handle(SITE, 'bitcoin', 'btc_connect', [{ purposes: ['payment'] }])) as { address: string; publicKey: string };
    expect(r.address).toBe(BTC0);
    expect(r.publicKey).toBe(bytesToHex(keys().publicKey));
  });

  test('connexion : adresse de paiement et clé publique ; « ordinals » seul refusé', async () => {
    expect(await code(dapp.handle('https://autre.example', 'bitcoin', 'btc_connect', [{ purposes: ['ordinals'] }]))).toBe(4200);
    expect(await dapp.handle(SITE, 'bitcoin', 'btc_connect', [{ silent: true }])).toMatchObject({ address: BTC0 });
  });

  test('PSBT : signé par la clé du compte, entrée demandée seulement', async () => {
    const [r] = (await dapp.handle(SITE, 'bitcoin', 'btc_signTransaction', ask([0]))) as { signedPsbt: string }[];
    const signed = BtcTx.fromPSBT(base64.decode(r.signedPsbt));
    const sig = signed.getInput(0).partialSig!;
    expect(sig).toHaveLength(1);
    expect(bytesToHex(sig[0][0])).toBe(bytesToHex(keys().publicKey));
    expect(sentBtc).toHaveLength(0);
  });

  test('signer et diffuser : transaction finalisée, txId rendu', async () => {
    const [r] = (await dapp.handle(SITE, 'bitcoin', 'btc_signAndSendTransaction', ask([0]))) as { txId: string }[];
    expect(r.txId).toBe('f'.repeat(64));
    expect(sentBtc).toHaveLength(1);
    const tx = BtcTx.fromRaw(Uint8Array.from(sentBtc[0].match(/../g)!.map((x) => Number.parseInt(x, 16))));
    expect(p2wpkhAddress(tx.getInput(0).finalScriptWitness![1])).toBe(BTC0);
  });

  test('refus : entrée d’un autre compte, mode SIGHASH non-ALL, autre réseau', async () => {
    expect(await code(dapp.handle(SITE, 'bitcoin', 'btc_signTransaction', ask([0, 1], { foreign: true })))).toBe(4100);
    expect(await code(dapp.handle(SITE, 'bitcoin', 'btc_signTransaction', ask([0], { sighash: SigHash.SINGLE_ANYONECANPAY })))).toBe(4200);
    const testnet = ask([0]);
    testnet[0].chain = 'bitcoin:testnet';
    expect(await code(dapp.handle(SITE, 'bitcoin', 'btc_signTransaction', testnet))).toBe(4200);
    expect(sentBtc).toHaveLength(0);
  });

  test('explication : ce qui part vers DEST, la monnaie reconnue, les frais', async () => {
    const r = await review({ kind: 'btcPsbt', from: BTC0, pub: bytesToHex(keys().publicKey), psbt: psbt(), indexes: [0], send: true }, SITE, { t: explainT, phishing: async () => false });
    expect(r.explanation.lose).toEqual(['0.0012 BTC']);
    expect(r.details.some((d) => d.value.startsWith(DEST))).toBe(true);
    expect(r.details.find((d) => d.label === 'Frais')?.value).toBe('0.00001 BTC');
  });

  test('message : BIP-322 du compte (identique à celui de l’app), binaire refusé', async () => {
    const [r] = (await dapp.handle(SITE, 'bitcoin', 'btc_signMessage', [{ message: utf8B64('Connexion à Magic Eden') }])) as { signature: string }[];
    expect(r.signature).toBe(await signBip322Message('Connexion à Magic Eden', keys()));
    expect(await code(dapp.handle(SITE, 'bitcoin', 'btc_signMessage', [{ message: base64.encode(new Uint8Array([0xff, 0xfe, 0x00])) }]))).toBe(4200);
  });
});
