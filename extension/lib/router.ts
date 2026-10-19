/**
 * Messages INTERNES acceptés par le service worker (popup, onboarding,
 * réglages). Chaque message est validé — type connu, champs du bon type,
 * tailles bornées — avant d'atteindre la session. Réponse : `{ ok: true, … }`
 * ou `{ ok: false, error, waitMs? }`, jamais une exception qui traverse.
 */
import { SessionError, type Session } from './session';
import { coreSelfTest } from './coreSelfTest';

const MAX_PASSWORD = 1024;
const pw = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_PASSWORD;

export type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; waitMs?: number };

export async function handleInternal(session: Session, msg: unknown): Promise<Reply> {
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
      default:
        return { ok: false, error: 'UNKNOWN_MESSAGE' };
    }
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.message, ...(e.waitMs ? { waitMs: e.waitMs } : {}) };
    // Rien d'interne ne sort (pile, chemins) : un code générique.
    return { ok: false, error: 'INTERNAL' };
  }
}
