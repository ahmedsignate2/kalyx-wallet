/**
 * Webhook Alchemy Notify (« Address Activity ») → message Telegram aux abonnés
 * de l'adresse. La requête est authentifiée par HMAC-SHA256 du corps brut avec
 * la « signing key » du webhook (en-tête X-Alchemy-Signature) ; sans clé
 * configurée, la route répond 403 — jamais de notification non authentifiée.
 */
import { Bot } from 'grammy';
import { esc, short, type Env } from './env';
import { strings } from './i18n';
import { markTxSeen, subscribersOf, userLang } from './store';

const EXPLORER: Record<string, string> = {
  ETH_MAINNET: 'https://etherscan.io/tx/', BASE_MAINNET: 'https://basescan.org/tx/', ARB_MAINNET: 'https://arbiscan.io/tx/',
  MATIC_MAINNET: 'https://polygonscan.com/tx/', OPT_MAINNET: 'https://optimistic.etherscan.io/tx/', BNB_MAINNET: 'https://bscscan.com/tx/',
  SOLANA_MAINNET: 'https://solscan.io/tx/',
};
const NETWORK_LABEL: Record<string, string> = {
  ETH_MAINNET: 'Ethereum', BASE_MAINNET: 'Base', ARB_MAINNET: 'Arbitrum', MATIC_MAINNET: 'Polygon', OPT_MAINNET: 'Optimism', BNB_MAINNET: 'BNB Chain', SOLANA_MAINNET: 'Solana',
};

async function hmacHex(key: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

interface Activity {
  fromAddress?: string; toAddress?: string; value?: number; asset?: string; hash?: string; category?: string;
  rawContract?: { decimals?: number };
}
interface AlchemyPayload { event?: { network?: string; activity?: Activity[] } }

export async function handleAlchemy(request: Request, env: Env): Promise<Response> {
  if (!env.ALCHEMY_SIGNING_KEY) return new Response('Webhook not configured', { status: 403 });
  const body = await request.text();
  const sig = request.headers.get('x-alchemy-signature') ?? '';
  const expected = await hmacHex(env.ALCHEMY_SIGNING_KEY, body);
  if (!sig || !timingSafeEqual(sig.toLowerCase(), expected)) return new Response('Bad signature', { status: 401 });

  let payload: AlchemyPayload;
  try { payload = JSON.parse(body) as AlchemyPayload; } catch { return new Response('Bad JSON', { status: 400 }); }
  const network = payload.event?.network ?? '';
  const acts = payload.event?.activity ?? [];
  const bot = new Bot(env.BOT_TOKEN);

  for (const a of acts.slice(0, 20)) {
    if (!a.hash || !a.value || a.value <= 0) continue; // poussière / spam : rien à dire
    // Une notification par (hash, destinataire) même si Alchemy rejoue.
    const from = (a.fromAddress ?? '').toLowerCase();
    const to = (a.toAddress ?? '').toLowerCase();
    const amount = `${Number(a.value).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${esc(a.asset ?? '')}`;
    const link = EXPLORER[network] ? `<a href="${EXPLORER[network]}${a.hash}">${esc(NETWORK_LABEL[network] ?? network)}</a>` : esc(NETWORK_LABEL[network] ?? network);

    for (const [addr, dir] of [[to, 'in'], [from, 'out']] as const) {
      if (!addr) continue;
      const subs = await subscribersOf(env, addr);
      for (const s of subs) {
        if (!(await markTxSeen(env, `${a.hash}:${s.telegram_id}:${dir}`))) continue;
        const t = strings(await userLang(env, s.telegram_id));
        const label = esc(s.label ?? short(s.address));
        const text = dir === 'in' ? t.txIn(label, amount, short(from), link) : t.txOut(label, amount, short(to), link);
        try {
          await bot.api.sendMessage(s.telegram_id, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        } catch {
          /* utilisateur qui a bloqué le bot : on ignore */
        }
      }
    }
  }
  return new Response('OK');
}
