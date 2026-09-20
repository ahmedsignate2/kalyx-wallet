/** Commandes du bot. Aucune ne manipule de clé : lancer la Mini App, lire des
 *  données publiques (prix, gas, sécurité d'un token), poser des alertes. */
import { Bot, InlineKeyboard, type Context, type NextFunction } from 'grammy';
import { esc, familyOf, rateLimited, type Env } from './env';
import { LANGS, LANG_LABEL, strings, toLang, type Lang } from './i18n';
import { fmtCompact, fmtFiat, getGas, getPrice, resolveCoinId } from './market';
import { scanToken } from './scan';
import { addAlert, addWatched, listAlerts, listWatched, removeWatched, upsertUser, userLangOrNull } from './store';

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
    if (!a || !familyOf(a) || familyOf(a) === 'bitcoin') return ctx.reply(t(ctx).scanUsage, HTML);
    if (ctx.from && (await rateLimited(env, `scan:${ctx.from.id}`, 5, 60))) return ctx.reply(t(ctx).rateLimited);
    await ctx.reply(t(ctx).scanRunning);
    const r = await scanToken(a).catch(() => null);
    if (!r) return ctx.reply(t(ctx).scanNoData, HTML);
    const flags = r.flags.map((f) => t(ctx).scanFlags[f] ?? f);
    await ctx.reply(t(ctx).scanReport({ ...r, chain: esc(r.chain), flags }), HTML);
  });

  bot.command('watch', async (ctx) => {
    if (!ctx.from) return;
    const [addr, ...rest] = ctx.match.trim().split(/\s+/);
    if (!addr) {
      const rows = await listWatched(env, ctx.from.id);
      return ctx.reply(rows.length ? t(ctx).watchList(rows.map((r) => ({ address: esc(r.address), label: r.label ? esc(r.label) : null }))) : t(ctx).watchNone, HTML);
    }
    const fam = familyOf(addr);
    if (!fam) return ctx.reply(t(ctx).watchInvalid, HTML);
    const normalized = fam === 'evm' ? addr.toLowerCase() : addr;
    const label = rest.join(' ').slice(0, 24) || null;
    await upsertUser(env, ctx.from.id, lang(ctx)).catch(() => {});
    const res = await addWatched(env, ctx.from.id, fam, normalized, label);
    if (res === 'limit') return ctx.reply(t(ctx).watchLimit, HTML);
    if (res === 'exists') return ctx.reply(t(ctx).watchExists, HTML);
    await ctx.reply(t(ctx).watchAdded(esc(normalized), label ? esc(label) : ''), HTML);
  });

  bot.command('unwatch', async (ctx) => {
    if (!ctx.from) return;
    const addr = ctx.match.trim();
    if (!addr) return ctx.reply(t(ctx).unwatchUsage, HTML);
    const fam = familyOf(addr);
    const ok = await removeWatched(env, ctx.from.id, fam === 'evm' ? addr.toLowerCase() : addr);
    await ctx.reply(ok ? t(ctx).unwatched : t(ctx).watchInvalid, HTML);
  });

  bot.command('alert', async (ctx) => {
    if (!ctx.from) return;
    const [sym, targetStr] = ctx.match.trim().split(/\s+/);
    const target = Number((targetStr ?? '').replace(',', '.'));
    if (!sym || !Number.isFinite(target) || target <= 0) return ctx.reply(t(ctx).alertUsage, HTML);
    const id = resolveCoinId(sym);
    const p = await getPrice(env, id).catch(() => null);
    if (!p) return ctx.reply(t(ctx).priceUnknown(esc(sym)), HTML);
    const direction = target > p.price ? 'above' : 'below';
    await upsertUser(env, ctx.from.id, lang(ctx)).catch(() => {});
    await addAlert(env, ctx.from.id, p.id, p.symbol, target, direction, 'usd');
    await ctx.reply(t(ctx).alertAdded(esc(p.symbol), direction, fmtFiat(target, 'usd', lang(ctx))), HTML);
  });

  bot.command('alerts', async (ctx) => {
    if (!ctx.from) return;
    const rows = await listAlerts(env, ctx.from.id);
    await ctx.reply(rows.length ? t(ctx).alertsList(rows) : t(ctx).alertsNone, HTML);
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) await ctx.reply(t(ctx).unknown, HTML);
  });

  bot.catch((err) => {
    console.error('bot error', err.error instanceof Error ? err.error.message : String(err.error));
  });

  return bot;
}
