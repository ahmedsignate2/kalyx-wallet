/* eslint-disable @typescript-eslint/no-explicit-any -- page simulée */
import { base58, base64 } from '@scure/base';
import { buildSolanaProvider, parseSolTxParams, sigToBase64, solAccountPayload, solChainId, solEmitJs, solMessageParam } from './solanaProvider';

describe('fournisseur Solana injecté', () => {
  it('réseau Wallet Standard → réseau Kalyx', () => {
    expect(solChainId(undefined)).toBe('solana');
    expect(solChainId('solana:mainnet')).toBe('solana');
    expect(solChainId('solana:devnet')).toBe('solana-devnet');
    expect(solChainId('solana:testnet')).toBeNull();
    expect(solChainId('eip155:1')).toBeNull();
  });

  it('paramètres de transaction : stricts', () => {
    const tx = base64.encode(new Uint8Array([1, 2, 3]));
    expect(parseSolTxParams([[tx], 'sign', 'solana:mainnet'])).toEqual({ txs: [tx], mode: 'sign', chainId: 'solana' });
    expect(parseSolTxParams([[tx, tx], 'signAll'])?.txs).toHaveLength(2);
    expect(parseSolTxParams([[tx, tx], 'sign'])).toBeNull(); // plusieurs transactions : uniquement « signAll »
    expect(parseSolTxParams([[tx], 'signAndSend', 'solana:testnet'])).toBeNull();
    expect(parseSolTxParams([[tx], 'steal'])).toBeNull();
    expect(parseSolTxParams([[], 'sign'])).toBeNull();
    expect(parseSolTxParams([['pas du base64 !'], 'sign'])).toBeNull();
    expect(parseSolTxParams([tx, 'sign'])).toBeNull();
  });

  it('message : base64 → base58 des mêmes octets', () => {
    const bytes = new TextEncoder().encode('Connexion à Jupiter');
    expect(base58.decode(solMessageParam([base64.encode(bytes)])!)).toEqual(bytes);
    expect(solMessageParam([''])).toBeNull();
    expect(solMessageParam([42])).toBeNull();
    expect(solMessageParam(['@@@'])).toBeNull();
  });

  it('compte et signature encodés pour la page', () => {
    const pk = new Uint8Array(32).fill(7);
    const address = base58.encode(pk);
    expect(base64.decode(solAccountPayload(address).publicKey)).toEqual(pk);
    const sig = new Uint8Array(64).fill(9);
    expect(base64.decode(sigToBase64(base58.encode(sig)))).toEqual(sig);
  });

  it('script : jeton de page, Wallet Standard et window.solana', () => {
    const js = buildSolanaProvider('tok123');
    expect(js).toContain('"tok123"');
    expect(js).toContain('wallet-standard:register-wallet');
    expect(js).toContain('wallet-standard:app-ready');
    expect(js).toContain("'solana:signAndSendTransaction'");
    expect(() => new Function(js)).not.toThrow();
    expect(solEmitJs('disconnect', null)).toBe('window.__kalyxSolEmit && window.__kalyxSolEmit("disconnect", null); true;');
  });
});


/** Page simulée : une appli Wallet Standard qui écoute, puis connexion + signature. */
it('une dApp Wallet Standard voit Kalyx, se connecte et fait signer', async () => {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const posted: any[] = [];
  const win: any = {
    addEventListener: (t: string, fn: any) => (listeners[t] = listeners[t] || []).push(fn),
    dispatchEvent: (e: any) => (listeners[e.type] || []).forEach((fn) => fn(e)),
    ReactNativeWebView: { postMessage: (m: string) => posted.push(JSON.parse(m)) },
  };
  class CE { type: string; detail: any; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } }
  const wallets: any[] = [];
  // L'appli est chargée AVANT : elle écoute l'enregistrement.
  win.addEventListener('wallet-standard:register-wallet', (e: any) => e.detail({ register: (w: any) => wallets.push(w) }));
  new Function('window', 'CustomEvent', 'btoa', 'atob', 'TextEncoder', buildSolanaProvider('T'))(win, CE, btoa, atob, TextEncoder);
  expect(wallets.map((w) => w.name)).toEqual(['Kalyx']);
  const w = wallets[0];
  const pk = Buffer.alloc(32, 7).toString('base64');
  const changes: any[] = [];
  w.features['standard:events'].on('change', (c: any) => changes.push(c));
  const conn = w.features['standard:connect'].connect();
  expect(posted[0]).toMatchObject({ method: 'sol_connect', k: 'T' });
  win.__kalyxResolve(posted[0].id, { address: 'Addr111', publicKey: pk }, null);
  const { accounts } = await conn;
  expect(accounts[0].address).toBe('Addr111');
  expect(Array.from(accounts[0].publicKey)).toEqual(Array(32).fill(7));
  expect(changes).toHaveLength(1);
  expect(win.solana.publicKey.toBase58()).toBe('Addr111');

  const sign = w.features['solana:signTransaction'].signTransaction({ account: accounts[0], transaction: new Uint8Array([1, 2]), chain: 'solana:mainnet' });
  expect(posted[1]).toMatchObject({ method: 'sol_signTransaction', params: [['AQI='], 'sign', 'solana:mainnet'] });
  win.__kalyxResolve(posted[1].id, ['AwQ='], null);
  expect(Array.from((await sign)[0].signedTransaction)).toEqual([3, 4]);

  const refused = w.features['solana:signMessage'].signMessage({ account: accounts[0], message: new Uint8Array([5]) });
  await new Promise((r) => setTimeout(r, 0)); // un appel après l'autre : posté au tour suivant
  expect(posted[2]).toMatchObject({ method: 'sol_signMessage', params: ['BQ=='] });
  win.__kalyxResolve(posted[2].id, null, { code: 4001, message: 'Refusé' });
  await expect(refused).rejects.toMatchObject({ code: 4001 });

  // Un site enregistré APRÈS : app-ready.
  const late: any[] = [];
  win.dispatchEvent({ type: 'wallet-standard:app-ready', detail: { register: (x: any) => late.push(x) } });
  expect(late).toHaveLength(1);

  win.__kalyxSolEmit('disconnect', null);
  expect(w.accounts).toEqual([]);
  expect(win.solana.isConnected).toBe(false);
});
