/**
 * Messages INTERNES acceptés par le service worker (popup, onboarding,
 * réglages). Chaque message est validé — type connu, champs du bon type,
 * tailles bornées — avant d'atteindre la session. Réponse : `{ ok: true, … }`
 * ou `{ ok: false, error, waitMs? }`, jamais une exception qui traverse.
 */
import { SessionError, type Session } from './session';
import { coreSelfTest } from './coreSelfTest';
import { WalletError, type Wallets } from './wallets';
import { discoverAccounts, type Rpc } from './discovery';
import type { Home } from './home';

const MAX_PASSWORD = 1024;
const pw = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_PASSWORD;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optLabel = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : undefined);

export type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; waitMs?: number };

export async function handleInternal(session: Session, wallets: Wallets, msg: unknown, rpc?: Rpc, home?: Home): Promise<Reply> {
  const m = (msg ?? {}) as Record<string, unknown>;
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
    }
    return { ok: false, error: 'UNKNOWN_MESSAGE' };
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.message, ...(e.waitMs ? { waitMs: e.waitMs } : {}) };
    if (e instanceof WalletError) return { ok: false, error: e.message };
    // Rien d'interne ne sort (pile, chemins) : un code générique.
    return { ok: false, error: 'INTERNAL' };
  }
}
