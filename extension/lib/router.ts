/**
 * Messages INTERNES acceptés par le service worker (popup, onboarding,
 * réglages). Chaque message est validé — type connu, champs du bon type,
 * tailles bornées — avant d'atteindre la session. Réponse : `{ ok: true, … }`
 * ou `{ ok: false, error, waitMs? }`, jamais une exception qui traverse.
 */
import { RpcError } from './rpcError';
import type { Companion } from './companion';
import { BuyError, type Buy } from './buy';
import { siteReport } from './siteInfo';
import { SessionError, type Session } from './session';
import { coreSelfTest } from './coreSelfTest';
import { WalletError, type Wallets } from './wallets';
import { discoverAccounts, type Rpc } from './discovery';
import type { Home } from './home';
import type { Send } from './send';
import type { Whitelist } from './whitelist';
import type { Store } from './storage';
import type { Sites } from './sites';
import type { Approvals } from './approvals';
import type { Dapp } from './dapp';
import { listChains } from '../../src/domain/chains/registry';
import { WalletError as CoreError } from '../../src/domain/errors';

/** Services de l'écran principal (absents des tests qui ne les visent pas). */
export interface Services {
  home?: Home;
  send?: Send;
  whitelist?: Whitelist;
  disk?: Store;
  sites?: Sites;
  approvals?: Approvals;
  dapp?: Dapp;
  /** « Kalyx par défaut » : enregistre le script de page en conséquence. */
  setDefault?: (on: boolean) => Promise<void>;
  /** Mode compagnon : lien WalletConnect avec le téléphone. */
  companion?: Companion;
  buy?: Buy;
  /** Icône du site, lue par Chrome dans l'onglet ouvert (jamais fournie par la page). */
  siteIcon?: (origin: string) => Promise<string | undefined>;
}

const SPEEDS = new Set(['slow', 'normal', 'fast']);
const gwei = (v: unknown): v is string => typeof v === 'string' && /^\d{1,6}([.,]\d{1,9})?$/.test(v.trim());

const MAX_PASSWORD = 1024;
const pw = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_PASSWORD;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optLabel = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : undefined);

export type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; waitMs?: number; params?: Record<string, string> };

export async function handleInternal(session: Session, wallets: Wallets, msg: unknown, rpc?: Rpc, svc: Services = {}): Promise<Reply> {
  const m = (msg ?? {}) as Record<string, unknown>;
  const { home, send, whitelist, disk, sites, approvals, dapp, setDefault, companion, buy, siteIcon } = svc;
  const unlocked = async () => {
    if (!(await session.status()).unlocked) throw new SessionError('LOCKED');
  };
  try {
    switch (m.type) {
      case 'kalyx:core-self-test':
        return { ...(await coreSelfTest()), ok: true };
      case 'vault:status':
        return { ok: true, ...(await session.status()) };
      case 'vault:create':
        if (!pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await session.create(m.password);
        return { ok: true };
      case 'vault:unlock':
        if (!pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await session.unlock(m.password);
        return { ok: true };
      case 'vault:lock':
        await session.lock();
        return { ok: true };
      case 'vault:change-password':
        if (!pw(m.oldPassword) || !pw(m.newPassword)) return { ok: false, error: 'BAD_REQUEST' };
        await session.changePassword(m.oldPassword, m.newPassword);
        return { ok: true };
      case 'vault:set-auto-lock':
        await session.setAutoLock(m.minutes);
        return { ok: true };
      case 'vault:touch':
        await session.touch();
        return { ok: true };
      case 'wallet:list':
        return { ok: true, wallets: await wallets.list() };
      case 'wallet:create':
        return { ok: true, ...(await wallets.create(optLabel(m.label))) };
      case 'wallet:mark-backed-up':
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        await wallets.markBackedUp(m.id);
        return { ok: true };
      case 'wallet:import-phrase':
        if (!str(m.phrase, 1000)) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, wallet: await wallets.importPhrase(m.phrase, optLabel(m.label)) };
      case 'wallet:import-key':
        if (!str(m.key, 400) || (m.family !== 'evm' && m.family !== 'solana')) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, wallet: await wallets.importKey(m.key, m.family, optLabel(m.label)) };
      case 'wallet:import-backup':
        if (!str(m.file, 2_000_000) || !pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, ...(await wallets.importBackup(m.file, m.password)) };
      case 'wallet:discover': {
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        const table = await wallets.addressTable(m.id);
        const r = await discoverAccounts(async (i) => table.find((a) => a.index === i) ?? {}, rpc);
        const wallet = r.found.length ? await wallets.addAccounts(m.id, r.found) : (await wallets.list()).find((w) => w.id === m.id);
        return { ok: true, found: r.found, uncertain: r.uncertain, wallet };
      }
      case 'home:get':
        if (!home) break;
        return { ok: true, ...(await home.get()) };
      case 'home:select':
        if (!home) break;
        if (!str(m.walletId, 64) || !Number.isInteger(m.index) || (m.index as number) < 0 || (m.index as number) >= 100) return { ok: false, error: 'BAD_REQUEST' };
        await home.select(m.walletId, m.index as number);
        return { ok: true };
      case 'home:set-fiat':
        if (!home) break;
        await home.setFiat(m.fiat);
        return { ok: true };
      case 'portfolio:refresh':
        if (!home) break;
        return { ok: true, portfolio: await home.refresh() };
      case 'activity:get':
        if (!home) break;
        return { ok: true, activity: await home.activity(m.fresh === true) };
      case 'wallet:reveal-phrase':
        // Mot de passe REDEMANDÉ, même déverrouillé : afficher la phrase donne tout.
        if (!str(m.id, 64) || !pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await session.checkPassword(m.password);
        return { ok: true, phrase: await wallets.revealPhrase(m.id) };
      case 'receive:info': {
        if (!home || !disk) break;
        await unlocked();
        const cur = await home.current();
        if (!cur) return { ok: false, error: 'UNKNOWN_ACCOUNT' };
        const warned = (await disk.get<string[]>('receiveWarned')) ?? [];
        return { ok: true, walletId: cur.wallet.id, label: cur.wallet.label, index: cur.index, evm: cur.acct.evm, solana: cur.acct.solana, backedUp: cur.wallet.backedUp, warned: warned.includes(cur.wallet.id) };
      }
      case 'receive:ack-warning': {
        if (!disk || !str(m.walletId, 64)) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        const warned = (await disk.get<string[]>('receiveWarned')) ?? [];
        if (!warned.includes(m.walletId)) await disk.set('receiveWarned', [...warned, m.walletId].slice(-100));
        return { ok: true };
      }
      case 'send:assets':
        if (!send) break;
        await unlocked();
        return { ok: true, assets: await send.assets() };
      case 'send:quote':
        if (!send) break;
        await unlocked();
        if (!str(m.assetKey, 200) || (m.to !== undefined && typeof m.to !== 'string')) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, quote: await send.quote(m.assetKey, typeof m.to === 'string' ? m.to.slice(0, 200) : undefined) };
      case 'send:prepare': {
        if (!send) break;
        await unlocked();
        const manual = m.manual as Record<string, unknown> | undefined;
        if (!str(m.assetKey, 200) || !str(m.to, 200) || typeof m.amount !== 'string' || m.amount.length > 80) return { ok: false, error: 'BAD_REQUEST' };
        if (m.speed !== undefined && !SPEEDS.has(m.speed as string)) return { ok: false, error: 'BAD_REQUEST' };
        if (manual !== undefined && (!gwei(manual?.maxFeeGwei) || !gwei(manual?.priorityGwei))) return { ok: false, error: 'MANUAL_FEE_INVALID' };
        return {
          ok: true,
          draft: await send.prepare({
            assetKey: m.assetKey,
            to: m.to,
            amount: m.amount,
            max: m.max === true,
            speed: m.speed as 'slow' | 'normal' | 'fast' | undefined,
            manual: manual ? { maxFeeGwei: String(manual.maxFeeGwei).replace(',', '.'), priorityGwei: String(manual.priorityGwei).replace(',', '.') } : undefined,
          }),
        };
      }
      case 'send:confirm':
        if (!send) break;
        await unlocked();
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, ...(await send.confirm(m.id, m.acceptRisk === true)) };
      case 'send:status':
        if (!send) break;
        if (!str(m.txid, 200)) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, state: await send.status(m.txid) };
      case 'whitelist:get':
        if (!whitelist) break;
        await unlocked();
        return { ok: true, whitelist: await whitelist.get() };
      case 'whitelist:enable':
        if (!whitelist) break;
        await unlocked();
        return { ok: true, whitelist: await whitelist.enable() };
      case 'whitelist:request-disable':
        if (!whitelist) break;
        await unlocked();
        return { ok: true, whitelist: await whitelist.requestDisable() };
      case 'whitelist:add':
        if (!whitelist) break;
        await unlocked();
        if (!str(m.address, 200) || (m.label !== undefined && typeof m.label !== 'string')) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, whitelist: await whitelist.add(m.address, typeof m.label === 'string' ? m.label.slice(0, 40) : '') };
      case 'whitelist:remove':
        if (!whitelist) break;
        await unlocked();
        if (!str(m.address, 200)) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, whitelist: await whitelist.remove(m.address) };
      case 'approval:get': {
        if (!approvals) break;
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        const req = approvals.get(m.id);
        if (!req) return { ok: false, error: 'REQUEST_EXPIRED' };
        const st = await session.status();
        const cur = st.unlocked && home ? await home.current() : null;
        const icon = siteIcon ? await siteIcon(req.origin).catch(() => undefined) : undefined;
        return { ok: true, request: req, icon, unlocked: st.unlocked, wallets: st.unlocked ? await wallets.list() : [], selected: cur ? { walletId: cur.wallet.id, index: cur.index } : null };
      }
      case 'approval:site': {
        // Ce qu'on sait du site AVANT de s'y connecter : hameçonnage signalé, sosie d'un domaine connu, déjà connecté.
        if (!approvals) break;
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        const req = approvals.get(m.id);
        if (!req) return { ok: false, error: 'REQUEST_EXPIRED' };
        const s = sites ? await sites.get(req.origin) : null;
        return { ok: true, ...(await siteReport(req.origin, !!(s?.evm || s?.solana))) };
      }
      case 'approval:respond': {
        if (!approvals) break;
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        if (m.approve !== true) return (await approvals.respond(m.id, { approve: false })).ok ? { ok: true } : { ok: false, error: 'REQUEST_EXPIRED' };
        await unlocked();
        const req = approvals.get(m.id);
        if (!req) return { ok: false, error: 'REQUEST_EXPIRED' };
        let walletId = '';
        let index = 0;
        if (req.kind === 'connect') {
          // Le compte choisi doit exister ET avoir une adresse pour la famille demandée.
          const w = (await wallets.list()).find((x) => x.id === m.walletId);
          const a = w?.accounts.find((x) => x.index === m.index);
          if (!w || !a || !(req.family === 'evm' ? a.evm : a.solana)) return { ok: false, error: 'UNKNOWN_ACCOUNT' };
          walletId = w.id;
          index = a.index;
        } else {
          // Signature : le compte est celui ACCORDÉ au site, jamais choisi ici.
          if (disk && (await disk.get<boolean>('askPasswordToSign')) === true) {
            if (!pw(m.password)) return { ok: false, error: 'PASSWORD_REQUIRED' };
            await session.checkPassword(m.password);
          }
          if (m.reduceTo !== undefined && (typeof m.reduceTo !== 'string' || !/^\d{1,40}([.,]\d{1,40})?$/.test(m.reduceTo.trim()))) return { ok: false, error: 'INVALID_AMOUNT' };
        }
        const r = await approvals.respond(m.id, { approve: true, walletId, index, reduceTo: typeof m.reduceTo === 'string' ? m.reduceTo.trim().replace(',', '.') : undefined });
        if (r.ok) return { ok: true };
        if (r.error.message === 'REQUEST_EXPIRED') return { ok: false, error: 'REQUEST_EXPIRED' };
        // L'action a échoué : la fenêtre reste ouverte et montre pourquoi.
        return { ok: false, error: 'ACTION_FAILED', params: { code: String(r.error.code), message: r.error.message.slice(0, 300), ...('reason' in r && r.reason ? { reason: r.reason } : {}) } };
      }
      case 'approval:review': {
        if (!dapp || !str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        const p = dapp.reviewOf(m.id, typeof m.lang === 'string' ? m.lang.slice(0, 20) : undefined);
        if (!p) return { ok: false, error: 'REQUEST_EXPIRED' };
        // Compte accordé au site sur le téléphone (mode compagnon) : la fenêtre le dit, la validation se fera là-bas.
        const ar = approvals?.get(m.id);
        const g = ar && sites ? (await sites.get(ar.origin))[ar.family] : undefined;
        const onPhone = !!g && (await wallets.list()).some((w) => w.id === g.walletId && w.kind === 'companion');
        return { ok: true, review: await p, askPassword: disk ? (await disk.get<boolean>('askPasswordToSign')) === true : false, onPhone };
      }
      /* ── Acheter (page Stripe) ── */
      case 'buy:options':
        if (!buy) break;
        await unlocked();
        return { ok: true, options: await buy.options() };
      case 'buy:stripe': {
        if (!buy) break;
        await unlocked();
        try {
          return { ok: true, ...(await buy.stripeUrl(m.option)) };
        } catch (e) {
          if (!(e instanceof BuyError)) throw e;
          return e.message === 'BAD_REQUEST' || e.message === 'NO_ACCOUNT' ? { ok: false, error: e.message } : { ok: false, error: 'BUY_UNAVAILABLE', params: { reason: e.message } };
        }
      }
      /* ── Mode compagnon ── */
      case 'companion:available':
        return { ok: true, available: !!companion?.available() };
      case 'companion:start':
        if (!companion) break;
        await unlocked();
        return { ok: true, ...(await companion.start(optLabel(m.label) ?? 'Téléphone')) };
      case 'companion:wait': {
        if (!companion) break;
        await unlocked();
        const w = await companion.wait();
        if (home) await home.select(w.id, 0).catch(() => {});
        return { ok: true, wallet: w };
      }
      case 'settings:get-ask-password':
        if (!disk) break;
        return { ok: true, on: (await disk.get<boolean>('askPasswordToSign')) === true };
      case 'settings:set-ask-password':
        if (!disk || typeof m.on !== 'boolean') return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        await disk.set('askPasswordToSign', m.on);
        return { ok: true };
      case 'sites:list': {
        if (!sites) break;
        await unlocked();
        const ws = await wallets.list();
        const label = (g?: { walletId: string; index: number; address: string }) => {
          if (!g) return null;
          const w = ws.find((x) => x.id === g.walletId);
          return { address: g.address, wallet: w?.label ?? '?', index: g.index };
        };
        const chains = listChains();
        return {
          ok: true,
          sites: (await sites.list()).map((s) => ({
            origin: s.origin,
            evm: label(s.evm),
            solana: label(s.solana),
            chain: chains.find((c) => c.family === 'evm' && c.evmChainId === Number.parseInt(s.chainId, 16))?.name ?? s.chainId,
          })),
        };
      }
      case 'sites:disconnect':
        if (!dapp) break;
        await unlocked();
        if (!str(m.origin, 300)) return { ok: false, error: 'BAD_REQUEST' };
        await dapp.disconnect(m.origin);
        return { ok: true };
      case 'settings:get-default':
        if (!disk) break;
        return { ok: true, on: (await disk.get<boolean>('defaultProvider')) === true };
      case 'settings:set-default':
        if (!setDefault || typeof m.on !== 'boolean') return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        await setDefault(m.on);
        return { ok: true };
    }
    return { ok: false, error: 'UNKNOWN_MESSAGE' };
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.message, ...(e.waitMs ? { waitMs: e.waitMs } : {}) };
    if (e instanceof WalletError) return { ok: false, error: e.message };
    // Mode compagnon : son code précis (refusé sur le téléphone, délai, lien coupé…).
    if (e instanceof RpcError && /^COMPANION_[A-Z_]+$/.test(e.message)) return { ok: false, error: e.message };
    if (e instanceof CoreError && e.message === 'COMPANION_UNAVAILABLE') return { ok: false, error: e.message };
    /*
     * Erreurs du cœur : leur code, ou le code précis porté par le message
     * (« ENS_NOT_FOUND », « WRONG_FAMILY:evm ») ; leurs valeurs d'affichage.
     * Jamais le message libre : il peut contenir une réponse de RPC.
     */
    if (e instanceof CoreError) {
      const precise = /^[A-Z][A-Z_]+(:[a-z]+)?$/.test(e.message) ? e.message : e.code;
      return { ok: false, error: precise, ...(e.meta ? { params: e.meta } : {}) } as Reply;
    }
    // Rien d'interne ne sort (pile, chemins) : un code générique.
    return { ok: false, error: 'INTERNAL' };
  }
}
