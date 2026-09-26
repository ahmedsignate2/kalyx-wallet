/** Commandes du bot. Aucune ne manipule de clé : lancer la Mini App, lire des
 *  données publiques (prix, gas, sécurité d'un token), poser des alertes. */
import { Bot, InlineKeyboard, type Context, type NextFunction } from 'grammy';
import { esc, familyOf, rateLimited, type Env } from './env';
import { LANGS, LANG_LABEL, strings, toLang, type Lang } from './i18n';
import { fmtCompact, fmtFiat, getGas, getPrice, resolveCoinId } from './market';
import { scanToken } from './scan';
import { MAX_ALERTS_PER_USER, addAlert, countAlerts, listAlerts, removeAlert, removeAllAlerts, upsertUser, userLangOrNull } from './store';

const HTML = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

type Ctx = Context & { lang: Lang };

/** Clavier de choix de langue : 15 langues, 3 par ligne. */
function languageKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  LANGS.forEach((l, i) => {
    kb.text(LANG_LABEL[l], `lang:${l}`);
    if (i % 3 === 2) kb.row();
  });
  return kb;
}

export function createBot(env: Env): Bot<Ctx> {
  const bot = new Bot<Ctx>(env.BOT_TOKEN);
  const t = (ctx: Ctx) => strings(ctx.lang);
  const lang = (ctx: Ctx) => ctx.lang;

  // Langue : préférence mémorisée (D1) > language_code Telegram > anglais.
  // Puis limitation de débit : 20 mises à jour / minute / utilisateur.
  bot.use(async (ctx: Ctx, next: NextFunction) => {
    const id = ctx.from?.id;
    const stored = id ? await userLangOrNull(env, id).catch(() => null) : null;
    ctx.lang = toLang(stored ?? ctx.from?.language_code);
    if (id && (await rateLimited(env, String(id), 20, 60))) {
      await ctx.reply(t(ctx).rateLimited);
      return;
    }
    await next();
  });

  // Choix de langue (boutons du /start ou de /lang) : enregistré, puis accueil dans cette langue.
  bot.callbackQuery(/^lang:([a-z]{2})$/, async (ctx) => {
    const chosen = toLang(ctx.match[1]);
    if (ctx.from) await upsertUser(env, ctx.from.id, chosen).catch(() => {});
    ctx.lang = chosen;
    await ctx.answerCallbackQuery({ text: t(ctx).languageSet });
    await ctx.editMessageText(t(ctx).welcome(esc(ctx.from?.first_name ?? '')), { ...HTML, reply_markup: appKeyboard(ctx) }).catch(async () => {
      await ctx.reply(t(ctx).welcome(esc(ctx.from?.first_name ?? '')), { ...HTML, reply_markup: appKeyboard(ctx) });
    });
  });

  const appKeyboard = (ctx: Ctx) => new InlineKeyboard()
    .webApp(t(ctx).openApp, env.WEB_APP_URL).row()
    .url(t(ctx).installApp, env.DOWNLOAD_URL).row()
    .text(t(ctx).changeLanguage, 'lang:menu');

  // Premier /start : on demande la langue. Utilisateur déjà connu : accueil direct.
  bot.command('start', async (ctx) => {
    const known = ctx.from ? await userLangOrNull(env, ctx.from.id).catch(() => null) : null;
    if (!known) {
      await ctx.reply(`🌐 ${strings('en').chooseLanguage} · ${strings('fr').chooseLanguage} · ${strings('es').chooseLanguage}`, { reply_markup: languageKeyboard() });
      return;
    }
    await ctx.reply(t(ctx).welcome(esc(ctx.from?.first_name ?? '')), { ...HTML, reply_markup: appKeyboard(ctx) });
  });

  bot.command(['lang', 'language'], async (ctx) => {
    await ctx.reply(`🌐 ${t(ctx).chooseLanguage}`, { reply_markup: languageKeyboard() });
  });
  bot.callbackQuery('lang:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(`🌐 ${t(ctx).chooseLanguage}`, { reply_markup: languageKeyboard() });
  });

  bot.command(['app', 'wallet'], async (ctx) => {
    await ctx.reply(t(ctx).appPrompt, { ...HTML, reply_markup: new InlineKeyboard().webApp(t(ctx).openApp, env.WEB_APP_URL) });
  });

  bot.command(['site', 'web'], async (ctx) => {
    const kb = new InlineKeyboard().url(t(ctx).site, env.SITE_URL).row().url(t(ctx).download, env.DOWNLOAD_URL).row().url(t(ctx).support, env.SUPPORT_URL);
    await ctx.reply(t(ctx).siteCard, { ...HTML, reply_markup: kb });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(t(ctx).help, { ...HTML, reply_markup: new InlineKeyboard().url(t(ctx).support, env.SUPPORT_URL) });
  });

  bot.command('price', async (ctx) => {
    const q = ctx.match.trim();
    if (!q) return ctx.reply(t(ctx).priceUsage, HTML);
    const id = resolveCoinId(q);
    const p = await getPrice(env, id).catch(() => null);
    if (!p) return ctx.reply(t(ctx).priceUnknown(esc(q)), HTML);
    await ctx.reply(t(ctx).priceLine(esc(p.symbol), fmtFiat(p.price, 'usd', lang(ctx)), p.change24h, fmtCompact(p.marketCap, lang(ctx))), HTML);
  });

  bot.command('gas', async (ctx) => {
    const g = await getGas(env);
    const L = lang(ctx);
    const lines = g.evm.map((r) => (r.gwei == null ? t(ctx).gasUnavailable(r.name) : t(ctx).gasLine(r.name, r.gwei < 1 ? r.gwei.toFixed(3) : r.gwei.toFixed(1), r.usdTransfer != null ? fmtFiat(r.usdTransfer, 'usd', L) : '')));
    if (g.solanaPriority != null) lines.push(t(ctx).gasSolana(String(g.solanaPriority)));
    await ctx.reply(`${t(ctx).gasTitle}\n\n${lines.join('\n')}`, HTML);
  });

  bot.command('scan', async (ctx) => {
    const a = ctx.match.trim();
    // Hash de transaction (EVM 32 octets hex, Solana signature base58 ~88 car.) : pas une adresse.
    if (/^0x[a-fA-F0-9]{64}$/.test(a) || /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(a)) return ctx.reply(t(ctx).scanIsTxHash, HTML);
    if (!a || !familyOf(a) || familyOf(a) === 'bitcoin') return ctx.reply(t(ctx).scanUsage, HTML);
    if (ctx.from && (await rateLimited(env, `scan:${ctx.from.id}`, 5, 60))) return ctx.reply(t(ctx).rateLimited);
    await ctx.reply(t(ctx).scanRunning);
    const r = await scanToken(a).catch(() => null);
    if (r === 'not_token') return ctx.reply(t(ctx).scanNotToken, HTML);
    if (!r) return ctx.reply(t(ctx).scanNoData, HTML);
    if ('kind' in r) return ctx.reply(t(ctx).addressReport(r.flags.map((f) => t(ctx).addrFlags[f] ?? f)), HTML);
    const flags = r.flags.map((f) => t(ctx).scanFlags[f] ?? f);
    await ctx.reply(t(ctx).scanReport({ ...r, chain: esc(r.chain), flags }), HTML);
  });

  bot.command('alert', async (ctx) => {
    if (!ctx.from) return;
    const [sym, targetStr] = ctx.match.trim().split(/\s+/);
    const target = Number((targetStr ?? '').replace(',', '.'));
    if (!sym || !Number.isFinite(target) || target <= 0) return ctx.reply(t(ctx).alertUsage, HTML);
    // Le cron relit toutes les alertes ouvertes toutes les 5 minutes : sans plafond,
    // une seule personne peut faire grossir ce travail sans limite.
    if ((await countAlerts(env, ctx.from.id)) >= MAX_ALERTS_PER_USER) {
      return ctx.reply(t(ctx).alertLimit(String(MAX_ALERTS_PER_USER)), HTML);
    }
    const id = resolveCoinId(sym);
    const p = await getPrice(env, id).catch(() => null);
    if (!p) return ctx.reply(t(ctx).priceUnknown(esc(sym)), HTML);
    const direction = target > p.price ? 'above' : 'below';
    await upsertUser(env, ctx.from.id, lang(ctx)).catch(() => {});
    await addAlert(env, ctx.from.id, p.id, p.symbol, target, direction, 'usd');
    await ctx.reply(t(ctx).alertAdded(esc(p.symbol), direction, fmtFiat(target, 'usd', lang(ctx))), HTML);
  });

  /** Libellé d'une alerte : sert au texte de la liste ET au bouton qui la supprime,
   *  pour que les deux ne puissent pas diverger. */
  const alertLabel = (ctx: Ctx, r: { symbol: string; target: number; direction: string; fiat: string }) =>
    `${r.symbol.toUpperCase()} ${r.direction === 'above' ? '>' : '<'} ${fmtFiat(r.target, r.fiat, lang(ctx))}`;

  // La liste porte un bouton par alerte. Le bouton transporte l'identifiant réel de
  // la ligne, pas son rang : si une alerte se déclenche entre l'affichage et le clic,
  // on ne supprime pas celle d'à côté.
  async function alertsCard(ctx: Ctx, telegramId: number) {
    const rows = await listAlerts(env, telegramId);
    if (!rows.length) return { text: t(ctx).alertsNone, reply_markup: undefined };
    const kb = new InlineKeyboard();
    rows.forEach((r) => kb.text(t(ctx).alertDelete(alertLabel(ctx, r)), `alert:del:${r.id}`).row());
    if (rows.length > 1) kb.text(t(ctx).alertDeleteAll, 'alert:del:all');
    return { text: t(ctx).alertsList(rows.map((r) => esc(alertLabel(ctx, r)))), reply_markup: kb };
  }

  bot.command(['alerts', 'unalert'], async (ctx) => {
    if (!ctx.from) return;
    const card = await alertsCard(ctx, ctx.from.id);
    await ctx.reply(card.text, { ...HTML, reply_markup: card.reply_markup });
  });

  // `telegram_id` figure dans le WHERE de la suppression : c'est l'autorisation.
  // Personne ne peut effacer l'alerte d'un autre en devinant un identifiant.
  bot.callbackQuery(/^alert:del:(\d+|all)$/, async (ctx) => {
    if (!ctx.from) return;
    const arg = ctx.match[1];
    if (arg === 'all') {
      const n = await removeAllAlerts(env, ctx.from.id);
      await ctx.answerCallbackQuery({ text: t(ctx).alertsRemoved(String(n)) });
    } else {
      const done = await removeAlert(env, ctx.from.id, Number(arg));
      await ctx.answerCallbackQuery({ text: done ? t(ctx).alertRemoved : t(ctx).alertGone });
    }
    // Le message est remplacé par la liste à jour, ou par « aucune alerte ».
    const card = await alertsCard(ctx, ctx.from.id);
    await ctx.editMessageText(card.text, { ...HTML, reply_markup: card.reply_markup }).catch(() => {});
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) await ctx.reply(t(ctx).unknown, HTML);
  });

  bot.catch((err) => {
    console.error('bot error', err.error instanceof Error ? err.error.message : String(err.error));
  });

  return bot;
}
