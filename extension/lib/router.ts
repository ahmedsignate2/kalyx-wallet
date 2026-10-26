/**
 * Messages INTERNES acceptés par le service worker (popup, onboarding,
 * réglages). Chaque message est validé — type connu, champs du bon type,
 * tailles bornées — avant d'atteindre la session. Réponse : `{ ok: true, … }`
 * ou `{ ok: false, error, waitMs? }`, jamais une exception qui traverse.
 */
import { hexToBytes } from '@noble/hashes/utils';
import { RpcError } from './rpcError';
import type { Companion } from './companion';
import { BuyError, type Buy } from './buy';
import { siteReport } from './siteInfo';
import type { Allowances } from './allowances';
import type { TxWatch } from './txWatch';
import { SessionError, type Session } from './session';
import { PASSKEY_KINDS, type PasskeyKind } from './vault';
import { coreSelfTest } from './coreSelfTest';
import { passwordAccepted, RESET_CONFIRM } from './policy';
import { WalletError, type Wallets } from './wallets';
import { discoverAccounts, type Rpc } from './discovery';
import type { Home } from './home';
import type { Send } from './send';
import type { Whitelist } from './whitelist';
import type { Store } from './storage';
import type { Sites } from './sites';
import type { Approvals } from './approvals';
import type { Dapp } from './dapp';
import type { Assets } from './assets';
import type { Nfts } from './nfts';
import { ContactError, type Contacts } from './contacts';
import { SwapError, SwapFail, type Swap } from './swap';
import { listChains } from '../../src/domain/chains/registry';
import { WalletError as CoreError } from '../../src/domain/errors';
import { LANGS } from '../ui/i18n';
import type { SiteAccess } from './siteAccess';
import type { SpendCap } from './spendCap';
import { REMIND_HOURS, type Grants } from './grants';

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
  allowances?: Allowances;
  txWatch?: TxWatch;
  /** Réseaux et tokens affichés, tokens ajoutés. */
  assets?: Assets;
  nfts?: Nfts;
  /** Carnet d'adresses (scellé avec la clé du coffre). */
  contacts?: Contacts;
  /** Échange (swap et pont), moteur de l'app. */
  swap?: Swap;
  /** Présence de Kalyx sur les sites (partout, ou sites autorisés seulement). */
  siteAccess?: SiteAccess;
  /** Plafond journalier de dépense (mot de passe au-delà). */
  cap?: SpendCap;
  /** Rappels d'expiration des autorisations accordées aux sites. */
  grants?: Grants;
  /** Mot de passe oublié : efface TOUTES les données de l'extension (sauf la langue), sans la redémarrer. */
  reset?: () => Promise<void>;
}

const SPEEDS = new Set(['slow', 'normal', 'fast']);
const gwei = (v: unknown): v is string => typeof v === 'string' && /^\d{1,6}([.,]\d{1,9})?$/.test(v.trim());

const MAX_PASSWORD = 1024;
/** Sortie PRF d'une passkey : 32 octets en hexadécimal. */
const prfHex = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const pw = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_PASSWORD;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const idx = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 100;
const optLabel = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : undefined);

export type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; waitMs?: number; params?: Record<string, string> };

export async function handleInternal(session: Session, wallets: Wallets, msg: unknown, rpc?: Rpc, svc: Services = {}): Promise<Reply> {
  const m = (msg ?? {}) as Record<string, unknown>;
  const { home, send, whitelist, disk, sites, approvals, dapp, setDefault, companion, buy, siteIcon, allowances, txWatch, assets, nfts, contacts, swap, reset, siteAccess, cap, grants } = svc;
  const unlocked = async () => {
    if (!(await session.status()).unlocked) throw new SessionError('LOCKED');
  };
  /** « Téléphone seul » : aucune clé dans l'extension ; seuls les comptes du téléphone (mode compagnon). */
  const phoneOnly = async () => !!disk && (await disk.get<boolean>('phoneOnly')) === true;
  const noLocalKeys = { ok: false as const, error: 'PHONE_ONLY' };
  /**
   * Mot de passe exigé pour faire partir `value` ? (réglage « redemander pour
   * signer », ou plafond journalier dépassé / valeur inconnue). Rend une
   * réponse d'erreur, ou null si l'on peut continuer.
   */
  // « Redemander le mot de passe pour signer » : ACTIF par défaut, seul un refus explicite le coupe.
  // Avec une passkey sur le coffre, elle confirme aussi bien que le mot de passe (`prf`, sortie de l'authentificateur).
  const passwordGate = async (value: number | null | undefined, password: unknown, prf?: unknown): Promise<Reply | null> => {
    const ask = !!disk && (await disk.get<boolean>('askPasswordToSign')) !== false;
    const capped = !!cap && value !== undefined && (await cap.needsPassword(value));
    if (!ask && !capped) return null;
    if (prfHex(prf)) return void (await session.checkPasskey(hexToBytes(prf))), null;
    if (!pw(password)) return { ok: false, error: capped ? 'CAP_PASSWORD' : 'PASSWORD_REQUIRED', ...(capped && cap ? { params: { remaining: String(Math.floor((await cap.status()).remaining ?? 0)) } } : {}) };
    await session.checkPassword(password);
    return null;
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
        if (!pw(m.password) || (m.prf !== undefined && !prfHex(m.prf))) return { ok: false, error: 'BAD_REQUEST' };
        await session.unlock(m.password, m.prf ? hexToBytes(m.prf) : undefined);
        return { ok: true };
      case 'vault:check-password':
        if (!pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        await session.checkPassword(m.password);
        return { ok: true };
      case 'vault:set-duress':
        if (!pw(m.password) || !pw(m.code)) return { ok: false, error: 'BAD_REQUEST' };
        await session.setDuress(m.password, m.code);
        return { ok: true };
      case 'vault:remove-duress':
        if (!pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await session.removeDuress(m.password);
        return { ok: true };
      case 'vault:passkey-add':
        if (!pw(m.password) || !prfHex(m.prf) || typeof m.cred !== 'string' || typeof m.salt !== 'string' || (m.proof !== undefined && !prfHex(m.proof)) || !PASSKEY_KINDS.includes(m.kind as PasskeyKind)) return { ok: false, error: 'BAD_REQUEST' };
        await session.addPasskey(m.password, m.proof ? hexToBytes(m.proof) : undefined, { cred: m.cred, salt: m.salt, prf: hexToBytes(m.prf), kind: m.kind as PasskeyKind });
        return { ok: true };
      case 'vault:passkey-remove':
        if (!pw(m.password) || !prfHex(m.prf) || typeof m.cred !== 'string') return { ok: false, error: 'BAD_REQUEST' };
        await session.removePasskey(m.password, hexToBytes(m.prf), m.cred);
        return { ok: true };
      case 'vault:lock':
        await session.lock();
        return { ok: true };
      case 'vault:change-password':
        if (!pw(m.oldPassword) || !pw(m.newPassword)) return { ok: false, error: 'BAD_REQUEST' };
        await session.changePassword(m.oldPassword, m.newPassword);
        return { ok: true };
      case 'vault:reset':
        // Sans mot de passe (c'est le cas d'usage) : la page doit recopier la phrase de confirmation exacte.
        if (!reset || m.confirm !== RESET_CONFIRM) return { ok: false, error: 'BAD_REQUEST' };
        await reset();
        return { ok: true };
      case 'vault:set-paranoid':
        await unlocked();
        await session.setParanoid(m.on);
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
        if (await phoneOnly()) return noLocalKeys;
        return { ok: true, ...(await wallets.create(optLabel(m.label))) };
      case 'wallet:mark-backed-up':
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        await wallets.markBackedUp(m.id);
        return { ok: true };
      case 'wallet:import-phrase':
        if (await phoneOnly()) return noLocalKeys;
        if (!str(m.phrase, 1000)) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, wallet: await wallets.importPhrase(m.phrase, optLabel(m.label)) };
      case 'wallet:import-key':
        if (await phoneOnly()) return noLocalKeys;
        if (!str(m.key, 400) || (m.family !== 'evm' && m.family !== 'solana' && m.family !== 'bitcoin')) return { ok: false, error: 'BAD_REQUEST' };
        return { ok: true, wallet: await wallets.importKey(m.key, m.family, optLabel(m.label)) };
      case 'wallet:import-backup':
        if (await phoneOnly()) return noLocalKeys;
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
      /* ── Réseaux et tokens affichés ── */
      case 'assets:networks':
        if (!assets) break;
        await unlocked();
        return { ok: true, networks: await assets.networks() };
      case 'assets:set-network':
        if (!assets) break;
        await unlocked();
        await assets.setChainHidden(m.id, m.hidden);
        return { ok: true };
      case 'assets:set-token':
        if (!assets) break;
        await unlocked();
        await assets.setTokenHidden(m.id, m.hidden);
        return { ok: true };
      case 'tokens:check': {
        if (!assets || !home) break;
        await unlocked();
        const cur = await home.current();
        return { ok: true, token: await assets.check(m.chainId, m.contract, cur?.acct.evm) };
      }
      case 'tokens:add': {
        if (!assets) break;
        await unlocked();
        return { ok: true, token: await assets.add(m.chainId, m.contract) };
      }
      case 'tokens:remove':
        if (!assets) break;
        await unlocked();
        await assets.remove(m.chainId, m.contract);
        return { ok: true };
      case 'nfts:get': {
        if (!nfts || !home) break;
        await unlocked();
        const cur = await home.current();
        if (!cur) return { ok: false, error: 'UNKNOWN_ACCOUNT' };
        return { ok: true, nfts: m.fresh === true ? await nfts.refresh(cur.acct) : await nfts.cached(cur.acct) };
      }
      /* ── Échange ── */
      case 'swap:sources':
        if (!swap) break;
        await unlocked();
        return { ok: true, sources: await swap.sources() };
      case 'swap:targets':
        if (!swap) break;
        await unlocked();
        return { ok: true, tokens: await swap.targets(m.chainId) };
      case 'swap:quote':
        if (!swap) break;
        await unlocked();
        return { ok: true, quote: await swap.quote({ from: m.from, toChainId: m.toChainId, toToken: m.toToken, amount: m.amount, slippage: m.slippage }) };
      case 'swap:confirm': {
        if (!swap) break;
        await unlocked();
        // Devis inconnu ou expiré : dit tel quel, avant de demander un mot de passe pour rien.
        if (swap.known && !swap.known(m.id)) return { ok: false, error: 'SWAP_QUOTE_GONE' };
        // « Redemander le mot de passe pour signer » et plafond journalier valent aussi pour un échange.
        const value = swap.valueOf(m.id);
        const gate = await passwordGate(value, m.password, m.prf);
        if (gate) return gate;
        const done = await swap.confirm(m.id, m.ack === true);
        await cap?.record(value ?? null);
        return { ok: true, ...done };
      }
      case 'swap:stage':
        if (!swap) break;
        return { ok: true, stage: swap.stage(m.id) };
      /* ── Carnet d'adresses ── */
      case 'contacts:list':
        if (!contacts) break;
        return { ok: true, contacts: await contacts.list() };
      case 'contacts:add':
        if (!contacts) break;
        return { ok: true, contact: await contacts.add(m.name, m.address, m.confirmLookalike === true) };
      case 'contacts:update':
        if (!contacts) break;
        return { ok: true, contact: await contacts.update(m.id, m.name, m.address, { confirmChange: m.confirmChange === true, confirmLookalike: m.confirmLookalike === true }) };
      case 'contacts:remove':
        if (!contacts) break;
        await contacts.remove(m.id);
        return { ok: true };
      case 'wallet:reveal-phrase':
        // Mot de passe REDEMANDÉ, même déverrouillé : afficher la phrase donne tout.
        if (!str(m.id, 64) || !pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await session.checkPassword(m.password);
        // Liste blanche en vigueur : la phrase ne sort pas (sinon il suffirait de l'importer ailleurs) — comme dans l'app.
        if (whitelist && !(await whitelist.dappAllowed())) return { ok: false, error: 'WHITELIST_LOCKED' };
        return { ok: true, phrase: await wallets.revealPhrase(m.id) };
      /* ── Gérer les portefeuilles ── */
      case 'wallet:rename':
        if (!str(m.id, 64) || typeof m.label !== 'string' || m.label.length > 200) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        return { ok: true, wallet: await wallets.renameWallet(m.id, m.label) };
      case 'account:rename':
        if (!str(m.id, 64) || !idx(m.index) || typeof m.label !== 'string' || m.label.length > 200) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        return { ok: true, wallet: await wallets.renameAccount(m.id, m.index, m.label) };
      case 'wallet:add-account': {
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        const r = await wallets.addNextAccount(m.id);
        // Le nouveau compte devient le compte affiché, comme dans l'app.
        if (home) await home.select(m.id, r.index);
        return { ok: true, ...r };
      }
      case 'wallet:remove':
        // Irréversible ici : mot de passe redemandé.
        if (!str(m.id, 64) || !pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await session.checkPassword(m.password);
        await wallets.removeWallet(m.id);
        if (sites) await sites.forgetWallet(m.id);
        return { ok: true };
      case 'wallet:reveal-key':
        if (!str(m.id, 64) || !idx(m.index) || (m.family !== 'evm' && m.family !== 'solana') || !pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
        await session.checkPassword(m.password);
        // Même règle que la phrase : sous liste blanche, aucune clé ne sort.
        if (whitelist && !(await whitelist.dappAllowed())) return { ok: false, error: 'WHITELIST_LOCKED' };
        return { ok: true, key: await wallets.revealKey(m.id, m.index, m.family) };
      case 'wallet:export-backup':
        if (!pw(m.password) || !pw(m.backupPassword)) return { ok: false, error: 'BAD_REQUEST' };
        await session.checkPassword(m.password);
        if (whitelist && !(await whitelist.dappAllowed())) return { ok: false, error: 'WHITELIST_LOCKED' };
        // La sauvegarde quitte l'appareil : son mot de passe doit tenir seul face à une attaque hors ligne.
        if (m.backupPassword === m.password || !passwordAccepted(m.backupPassword)) return { ok: false, error: 'WEAK_BACKUP_PASSWORD' };
        return { ok: true, ...(await wallets.exportBackup(m.backupPassword)) };
      case 'receive:info': {
        if (!home || !disk) break;
        await unlocked();
        const cur = await home.current();
        if (!cur) return { ok: false, error: 'UNKNOWN_ACCOUNT' };
        const warned = (await disk.get<string[]>('receiveWarned')) ?? [];
        return { ok: true, walletId: cur.wallet.id, label: cur.wallet.label, index: cur.index, evm: cur.acct.evm, solana: cur.acct.solana, bitcoin: cur.acct.bitcoin, ton: cur.acct.ton, backedUp: cur.wallet.backedUp, warned: warned.includes(cur.wallet.id) };
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
        if (m.memo !== undefined && (typeof m.memo !== 'string' || m.memo.length > 120)) return { ok: false, error: 'BAD_REQUEST' };
        if (manual !== undefined && (!gwei(manual?.maxFeeGwei) || !gwei(manual?.priorityGwei))) return { ok: false, error: 'MANUAL_FEE_INVALID' };
        return {
          ok: true,
          draft: await send.prepare({
            assetKey: m.assetKey,
            to: m.to,
            amount: m.amount,
            max: m.max === true,
            ...(typeof m.memo === 'string' && m.memo.trim() ? { memo: m.memo } : {}),
            speed: m.speed as 'slow' | 'normal' | 'fast' | undefined,
            manual: manual ? { maxFeeGwei: String(manual.maxFeeGwei).replace(',', '.'), priorityGwei: String(manual.priorityGwei).replace(',', '.') } : undefined,
          }),
        };
      }
      case 'send:confirm':
        if (!send) break;
        await unlocked();
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        {
          const value = send.valueOf(m.id);
          const gate = await passwordGate(value, m.password, m.prf);
          if (gate) return gate;
          const done = await send.confirm(m.id, m.acceptRisk === true);
          await cap?.record(value ?? null);
          return { ok: true, ...done };
        }
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
        return { ok: true, ...(await siteReport(req.origin, !!(s?.evm || s?.solana || s?.bitcoin))) };
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
        let review: Awaited<ReturnType<NonNullable<Dapp['reviewOf']>>> | undefined;
        if (req.kind === 'connect') {
          // Le compte choisi doit exister ET avoir une adresse pour la famille demandée.
          const w = (await wallets.list()).find((x) => x.id === m.walletId);
          const a = w?.accounts.find((x) => x.index === m.index);
          if (!w || !a || !(req.family === 'evm' ? a.evm : req.family === 'solana' ? a.solana : a.bitcoin)) return { ok: false, error: 'UNKNOWN_ACCOUNT' };
          walletId = w.id;
          index = a.index;
        } else {
          // Signature : le compte est celui ACCORDÉ au site, jamais choisi ici.
          review = dapp ? await dapp.reviewOf(m.id)?.catch(() => undefined) : undefined;
          const gate = await passwordGate(review ? review.outFiat : null, m.password, m.prf);
          if (gate) return gate;
          if (m.remindHours !== undefined && !(REMIND_HOURS as readonly unknown[]).includes(m.remindHours)) return { ok: false, error: 'BAD_REQUEST' };
          if (m.reduceTo !== undefined && (typeof m.reduceTo !== 'string' || !/^\d{1,40}([.,]\d{1,40})?$/.test(m.reduceTo.trim()))) return { ok: false, error: 'INVALID_AMOUNT' };
        }
        const r = await approvals.respond(m.id, { approve: true, walletId, index, reduceTo: typeof m.reduceTo === 'string' ? m.reduceTo.trim().replace(',', '.') : undefined });
        if (r.ok) {
          if (review) {
            await cap?.record(review.outFiat);
            // Autorisation accordée : rappel à l'échéance choisie (24 h par défaut ; 0 = jamais).
            const hours = typeof m.remindHours === 'number' ? m.remindHours : 24;
            if (review.approval && grants && hours > 0) await grants.add({ ...review.approval, origin: req.origin, at: Date.now(), expiresAt: Date.now() + hours * 3_600_000 });
          }
          return { ok: true };
        }
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
        const rv = await p;
        const capPassword = !!cap && (await cap.needsPassword(rv.outFiat));
        return { ok: true, review: rv, askPassword: (disk ? (await disk.get<boolean>('askPasswordToSign')) !== false : false) || capPassword, capPassword, capRemaining: cap ? (await cap.status()).remaining : null, onPhone };
      }
      /* ── Autorisations de tokens ── */
      case 'allowances:list':
        if (!allowances) break;
        await unlocked();
        return { ok: true, ...(await allowances.list(m.chain)) };
      case 'allowances:revoke': {
        if (!allowances) break;
        await unlocked();
        const txid = await allowances.revoke(m.chain, m.token, m.spender);
        if (grants && typeof m.chain === 'string' && typeof m.token === 'string' && typeof m.spender === 'string') await grants.remove(m.chain, m.token, m.spender);
        const chain = listChains().find((c) => c.id === m.chain);
        if (txWatch && chain) await txWatch.add({ txid, chainId: chain.id, chainName: chain.name, what: typeof m.label === 'string' ? m.label.slice(0, 60) : 'approve(0)', explorer: chain.explorerUrl ? `${chain.explorerUrl}/tx/${txid}` : undefined });
        return { ok: true, txid, explorer: chain?.explorerUrl ? `${chain.explorerUrl}/tx/${txid}` : undefined };
      }
      /* ── Rappels d'autorisations ── */
      case 'grants:list':
        if (!grants) break;
        await unlocked();
        return { ok: true, grants: (await grants.list()).map((g) => ({ ...g, expired: g.expiresAt <= Date.now() })) };
      case 'grants:dismiss':
        if (!grants) break;
        await unlocked();
        await grants.dismiss(m.id);
        return { ok: true };
      case 'grants:revoke-expired': {
        // En un clic, mais chaque révocation reste une transaction signée (ou validée sur le téléphone).
        if (!grants || !allowances) break;
        await unlocked();
        const done: string[] = [];
        const failed: { symbol: string; error: string }[] = [];
        for (const g of await grants.expired()) {
          try {
            const txid = await allowances.revoke(g.chainId, g.token, g.spender);
            await grants.remove(g.chainId, g.token, g.spender);
            const chain = listChains().find((c) => c.id === g.chainId);
            if (txWatch && chain) await txWatch.add({ txid, chainId: chain.id, chainName: chain.name, what: `approve(0) ${g.symbol}`, explorer: chain.explorerUrl ? `${chain.explorerUrl}/tx/${txid}` : undefined });
            done.push(txid);
          } catch (e) {
            failed.push({ symbol: g.symbol, error: (e as Error).message.slice(0, 80) });
          }
        }
        return { ok: true, done: done.length, failed };
      }
      /* ── Plafond journalier ── */
      case 'cap:get':
        if (!cap) break;
        return { ok: true, ...(await cap.status()) };
      case 'cap:set': {
        if (!cap) break;
        await unlocked();
        const next = m.limit === null ? null : m.limit;
        // Relever ou retirer le plafond : mot de passe redemandé. Le baisser : non.
        if (await cap.loosens(next as number | null)) {
          if (!pw(m.password)) return { ok: false, error: 'PASSWORD_REQUIRED' };
          await session.checkPassword(m.password);
        }
        try {
          await cap.setLimit(next);
        } catch {
          return { ok: false, error: 'BAD_REQUEST' };
        }
        return { ok: true };
      }
      /* ── Mode compagnon : délier un téléphone ── */
      case 'companion:unlink': {
        if (!str(m.id, 64)) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        const w = (await wallets.list()).find((x) => x.id === m.id && x.kind === 'companion');
        if (!w) return { ok: false, error: 'BAD_REQUEST' };
        await companion?.unlink(w).catch(() => {});
        const gone = await wallets.removeCompanion(w.id);
        // Les sites qui voyaient ces comptes les perdent aussi (tous les portefeuilles de ce téléphone).
        if (sites) for (const id of gone) await sites.forgetWallet(id);
        if (home) {
          const rest = await wallets.list();
          if (rest[0]) await home.select(rest[0].id, rest[0].accounts[0]?.index ?? 0).catch(() => {});
        }
        return { ok: true };
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
        // Rien n'est enregistré ici : l'appareil et les adresses s'affichent, l'utilisateur confirme.
        return { ok: true, candidate: await companion.wait() };
      }
      case 'companion:resume': {
        // Accord du téléphone reçu pendant que la page dormait (ou dans un autre onglet) : à confirmer ici.
        if (!companion) break;
        await unlocked();
        return { ok: true, candidate: await companion.resume(optLabel(m.label) ?? 'Téléphone', m.restart !== false) };
      }
      case 'companion:confirm': {
        if (!companion || !str(m.topic, 128) || typeof m.accept !== 'boolean') return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        const list = await companion.confirm(m.topic, m.accept);
        const w = list?.[0] ?? null;
        if (w && home) await home.select(w.id, w.accounts[0]?.index ?? 0).catch(() => {});
        return { ok: true, wallet: w, wallets: list ?? [] };
      }
      case 'settings:get-ask-password':
        if (!disk) break;
        return { ok: true, on: (await disk.get<boolean>('askPasswordToSign')) !== false };
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
            bitcoin: label(s.bitcoin),
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
      case 'settings:get-phone-only':
        if (!disk) break;
        return { ok: true, on: await phoneOnly() };
      case 'settings:set-phone-only':
        if (!disk || typeof m.on !== 'boolean') return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        if (m.on) {
          // Seulement s'il ne reste ici aucune clé : on ne cache pas des clés, on n'en a plus.
          if ((await wallets.list()).some((w) => w.kind !== 'companion')) return { ok: false, error: 'HAS_LOCAL_KEYS' };
        } else {
          // Le couper rouvre la porte aux clés locales : mot de passe redemandé.
          if (!pw(m.password)) return { ok: false, error: 'BAD_REQUEST' };
          await session.checkPassword(m.password);
        }
        await disk.set('phoneOnly', m.on);
        return { ok: true };
      case 'settings:get-lang':
        if (!disk) break;
        return { ok: true, lang: (await disk.get<string>('lang')) ?? null };
      case 'settings:set-lang':
        // Avant le déverrouillage aussi (écran de verrouillage, onboarding) : ce n'est pas un réglage sensible.
        if (!disk || (m.lang !== null && !(LANGS as readonly unknown[]).includes(m.lang))) return { ok: false, error: 'BAD_REQUEST' };
        if (m.lang === null) await disk.remove('lang');
        else await disk.set('lang', m.lang);
        return { ok: true };
      case 'sites:access': {
        if (!siteAccess) break;
        const origin = typeof m.origin === 'string' ? m.origin : '';
        return { ok: true, mode: await siteAccess.mode(), allowed: await siteAccess.allowed(), active: origin ? await siteAccess.active(origin) : null };
      }
      case 'sites:set-mode':
        if (!siteAccess || (m.mode !== 'all' && m.mode !== 'allowed')) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        await siteAccess.setMode(m.mode);
        return { ok: true };
      case 'sites:allow':
        if (!siteAccess || !str(m.origin, 300)) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        try {
          return { ok: true, origin: await siteAccess.allow(m.origin) };
        } catch (e) {
          const code = (e as Error).message;
          if (code === 'BAD_ORIGIN' || code === 'TOO_MANY_SITES') return { ok: false, error: code };
          throw e;
        }
      case 'sites:forbid':
        if (!siteAccess || !str(m.origin, 300)) return { ok: false, error: 'BAD_REQUEST' };
        await unlocked();
        await siteAccess.forbid(m.origin);
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
    if (e instanceof SwapFail) return { ok: false, error: e.message, ...(e.params ? { params: e.params } : {}) };
    // Moteur d'échange : son code et ses valeurs d'affichage (bornées), jamais son message libre.
    if (e instanceof SwapError) return { ok: false, error: `SWAP_${e.code}`, ...(e.meta ? { params: Object.fromEntries(Object.entries(e.meta).map(([k, v]) => [k, String(v).slice(0, 60)])) } : {}) };
    if (e instanceof ContactError) return { ok: false, error: e.message, ...(e.params ? { params: e.params } : {}) };
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
