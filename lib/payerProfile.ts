/**
 * Informations du payeur MÉMORISÉES sur cet appareil, avec l'accord de
 * l'utilisateur : l'e-mail du compte MoonPay (prérempli dans le widget) et
 * l'identité demandée par WalletConnect Pay (préremplie dans le formulaire).
 *
 * Chiffrées dans le Keychain / Keystore, lisibles sur CET appareil seulement,
 * jamais sauvegardées ailleurs, jamais envoyées à Kalyx. Effacées avec le
 * portefeuille (réinitialisation complète).
 */
import { KV_DEVICE_ONLY, kvDel, kvGet, kvSet } from './kv';
import { isValidEmail } from '../src/domain/pay/payPrefill';

export const K_BUY_EMAIL = 'nova.buyEmail';
export const K_PAY_INFO = 'nova.payInfo';

export async function getBuyEmail(): Promise<string | null> {
  const v = await kvGet(K_BUY_EMAIL, KV_DEVICE_ONLY).catch(() => null);
  return v && isValidEmail(v) ? v : null;
}

export async function setBuyEmail(email: string | null): Promise<void> {
  if (email && isValidEmail(email)) await kvSet(K_BUY_EMAIL, email.trim(), KV_DEVICE_ONLY);
  else await kvDel(K_BUY_EMAIL, KV_DEVICE_ONLY).catch(() => {});
}

export async function getPayInfo(): Promise<Record<string, string> | null> {
  const raw = await kvGet(K_PAY_INFO, KV_DEVICE_ONLY).catch(() => null);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return null;
  }
}

/** Fusionne avec ce qui est déjà enregistré (un autre marchand peut demander d'autres champs). */
export async function savePayInfo(values: Record<string, string>): Promise<void> {
  const cur = (await getPayInfo()) ?? {};
  const next = { ...cur };
  for (const [k, v] of Object.entries(values)) {
    const s = v.trim();
    if (s) next[k] = s.slice(0, 200);
  }
  await kvSet(K_PAY_INFO, JSON.stringify(next), KV_DEVICE_ONLY);
}

export async function forgetPayInfo(): Promise<void> {
  await kvDel(K_PAY_INFO, KV_DEVICE_ONLY).catch(() => {});
}

/** Tout effacer (réinitialisation complète du portefeuille). */
export async function wipePayerProfile(): Promise<void> {
  await Promise.all([kvDel(K_BUY_EMAIL, KV_DEVICE_ONLY).catch(() => {}), forgetPayInfo()]);
}
