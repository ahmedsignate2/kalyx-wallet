/**
 * Textes du bot (HTML Telegram) dans les 15 langues de l'app. La langue est
 * choisie au /start (boutons), mémorisée en D1, modifiable avec /lang ; à
 * défaut, `language_code` de Telegram, sinon anglais.
 */
export const LANGS = ['fr', 'en', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = {
  fr: '🇫🇷 Français', en: '🇬🇧 English', es: '🇪🇸 Español', pt: '🇵🇹 Português', de: '🇩🇪 Deutsch', it: '🇮🇹 Italiano',
  nl: '🇳🇱 Nederlands', pl: '🇵🇱 Polski', tr: '🇹🇷 Türkçe', ru: '🇷🇺 Русский', ar: '🇸🇦 العربية', hi: '🇮🇳 हिन्दी',
  zh: '🇨🇳 中文', ja: '🇯🇵 日本語', ko: '🇰🇷 한국어',
};

export function toLang(code?: string | null): Lang {
  const c = (code ?? '').toLowerCase().slice(0, 2);
  return (LANGS as readonly string[]).includes(c) ? (c as Lang) : 'en';
}

export interface Strings {
  chooseLanguage: string;
  languageSet: string;
  welcome: (name: string) => string;
  commands: string;
  openApp: string; installApp: string; site: string; download: string; support: string; changeLanguage: string;
  appPrompt: string; siteCard: string; help: string;
  priceUsage: string; priceUnknown: (q: string) => string; priceLine: (sym: string, price: string, ch: number, cap: string) => string;
  gasTitle: string; gasLine: (name: string, gwei: string, usd: string) => string; gasSolana: (lamports: string) => string; gasUnavailable: (name: string) => string;
  scanUsage: string; scanRunning: string; scanNoData: string; scanNotToken: string;
  scanReport: (r: { honeypot: boolean; buyTax: string; sellTax: string; flags: string[]; openSource: boolean; chain: string }) => string;
  scanFlags: Record<string, string>;
  alertUsage: string; alertAdded: (sym: string, dir: string, target: string) => string; alertsNone: string;
  alertsList: (rows: { symbol: string; target: number; direction: string; fiat: string }[]) => string;
  alertFired: (sym: string, price: string, dir: string, target: string) => string;
  rateLimited: string; error: string; unknown: string;
}

/** Fabrique une langue à partir de ses libellés atomiques (une seule structure de
 *  message, 15 jeux de mots) — évite 15 copies divergentes des gabarits. */
interface Words {
  chooseLanguage: string; languageSet: string; welcomeTitle: string; welcomeBody: string; commandsTitle: string;
  cmdApp: string; cmdPrice: string; cmdGas: string; cmdScan: string; cmdAlert: string; cmdHelp: string; cmdLang: string;
  openApp: string; installApp: string; site: string; download: string; support: string; changeLanguage: string;
  appPrompt: string; siteTitle: string; siteL1: string; siteL2: string; siteL3: string;
  helpTitle: string; helpBody: string; helpNever: string; helpCommands: string;
  priceUsage: string; priceUnknown: string; h24: string; cap: string;
  gasTitle: string; forTransfer: string; solanaPriority: string; unavailable: string;
  scanUsage: string; scanRunning: string; scanNoData: string; scanNotToken: string; report: string; honeypot: string; sellable: string; buyTax: string; sellTax: string;
  source: string; verified: string; notVerified: string; noFlags: string; disclaimer: string;
  flags: Record<string, string>;
  alertUsage: string; alertAdded: string; above: string; below: string; alertsNone: string; alertsTitle: string; alertFired: string;
  rateLimited: string; error: string; unknown: string;
}

function build(w: Words): Strings {
  const fill = (s: string, v: Record<string, string>) => Object.entries(v).reduce((acc, [k, val]) => acc.split(`{${k}}`).join(val), s);
  return {
    chooseLanguage: w.chooseLanguage,
    languageSet: w.languageSet,
    welcome: (name) => `<b>${w.welcomeTitle}${name ? `, ${name}` : ''}.</b>\n\n${w.welcomeBody}\n\n${w.commandsTitle}\n• /app — ${w.cmdApp}\n• /price eth — ${w.cmdPrice}\n• /gas — ${w.cmdGas}\n• /scan &lt;token&gt; — ${w.cmdScan}\n• /alert eth 3000 — ${w.cmdAlert}\n• /lang — ${w.cmdLang}\n• /help — ${w.cmdHelp}`,
    commands: w.commandsTitle,
    openApp: w.openApp, installApp: w.installApp, site: w.site, download: w.download, support: w.support, changeLanguage: w.changeLanguage,
    appPrompt: w.appPrompt,
    siteCard: `<b>${w.siteTitle}</b>\n\n• ${w.siteL1}\n• ${w.siteL2}\n• ${w.siteL3}`,
    help: `<b>${w.helpTitle}</b>\n\n${w.helpBody}\n\n<b>${w.helpNever}</b>\n\n${w.helpCommands}: /app /site /price /gas /scan /alert /alerts /lang`,
    priceUsage: w.priceUsage,
    priceUnknown: (q) => fill(w.priceUnknown, { q }),
    priceLine: (sym, price, ch, cap) => `<b>${sym}</b>  ${price}\n${w.h24}: ${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)} %${cap ? `   ·   ${w.cap}: ${cap}` : ''}`,
    gasTitle: `<b>${w.gasTitle}</b>`,
    gasLine: (name, gwei, usd) => `• ${name}: ${gwei} gwei${usd ? ` (~${usd} ${w.forTransfer})` : ''}`,
    gasSolana: (lamports) => `• Solana: ${fill(w.solanaPriority, { n: lamports })}`,
    gasUnavailable: (name) => `• ${name}: ${w.unavailable}`,
    scanUsage: w.scanUsage, scanRunning: w.scanRunning, scanNoData: w.scanNoData, scanNotToken: w.scanNotToken,
    scanReport: (r) => `<b>${w.report}</b> (${r.chain})\n\n${r.honeypot ? `🚨 <b>${w.honeypot}</b>` : `✅ ${w.sellable}`}\n${w.buyTax} ${r.buyTax} % · ${w.sellTax} ${r.sellTax} %\n${w.source}: ${r.openSource ? w.verified : `⚠️ ${w.notVerified}`}\n${r.flags.length ? '\n⚠️ ' + r.flags.join('\n⚠️ ') : `\n${w.noFlags}`}\n\n<i>${w.disclaimer}</i>`,
    scanFlags: w.flags,
    alertUsage: w.alertUsage,
    alertAdded: (sym, dir, target) => `🔔 ${fill(w.alertAdded, { sym, dir: dir === 'above' ? w.above : w.below, target })}`,
    alertsNone: w.alertsNone,
    alertsList: (rows) => `<b>${w.alertsTitle}</b>\n` + rows.map((r) => `• ${r.symbol} ${r.direction === 'above' ? '>' : '<'} ${r.target} ${r.fiat.toUpperCase()}`).join('\n'),
    alertFired: (sym, price, dir, target) => `🔔 ${fill(w.alertFired, { sym: `<b>${sym}</b>`, price, dir: dir === 'above' ? w.above : w.below, target })}`,
    rateLimited: w.rateLimited, error: w.error, unknown: w.unknown,
  };
}

const FLAG_KEYS = ['mintable', 'blacklist', 'pausable', 'proxy', 'hiddenOwner', 'selfDestruct', 'tradingCooldown', 'cannotSellAll', 'slippageModifiable', 'externalCall'] as const;
const flags = (v: string[]): Record<string, string> => Object.fromEntries(FLAG_KEYS.map((k, i) => [k, v[i]]));

const W: Record<Lang, Words> = {
  en: {
    chooseLanguage: 'Choose your language', languageSet: 'Language saved.',
    welcomeTitle: 'Welcome to Kalyx', welcomeBody: 'Kalyx is a non-custodial wallet: your keys live on your phone, never here. This bot opens your dashboard and keeps an eye on the chain for you.', commandsTitle: 'Commands',
    cmdApp: 'open the wallet inside Telegram', cmdPrice: 'live price', cmdGas: 'network fees right now', cmdScan: 'honeypot / scam check', cmdAlert: 'price alert', cmdHelp: 'how it works', cmdLang: 'change language',
    openApp: '⚡ Open Kalyx', installApp: '📲 Install the app', site: '🌍 kalyxwallet.com', download: '📲 Download (Android)', support: '💬 Support', changeLanguage: '🌐 Language',
    appPrompt: 'Your dashboard, inside Telegram. Every signature is still approved on your phone.', siteTitle: 'Kalyx', siteL1: 'Official site and documentation', siteL2: 'Android app (signed APK)', siteL3: 'Non-custodial: keys never leave your phone',
    helpTitle: 'How Kalyx works', helpBody: 'Your phone is the vault: keys are created there, encrypted with your PIN, and never leave it. The web dashboard and this bot only read public data and forward signing requests to the phone, where you approve them.', helpNever: 'This bot never asks for a recovery phrase, a PIN, a private key or an API key. If someone claiming to be Kalyx does, it is a scam.', helpCommands: 'Commands',
    priceUsage: 'Usage: /price eth  (btc, sol, bnb, pol, arb… or a CoinGecko id)', priceUnknown: 'No market data for “{q}”.', h24: '24h', cap: 'Cap',
    gasTitle: 'Network fees right now', forTransfer: 'for a transfer', solanaPriority: '~{n} lamports priority (base fee 5000)', unavailable: 'unavailable',
    scanUsage: 'Usage: /scan 0x… (EVM token or contract). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 Checking with GoPlus Security…', scanNoData: 'No security data for this address (unknown or too new). Treat as risky.', scanNotToken: 'This is a wallet (or NFT) address, not a token. /scan checks a token’s contract or mint address.', report: 'Security report', honeypot: 'HONEYPOT — you may not be able to sell', sellable: 'Sellable', buyTax: 'Buy tax', sellTax: 'Sell tax', source: 'Source', verified: 'verified', notVerified: 'not verified', noFlags: 'No owner red flags found.', disclaimer: 'Automated check — not financial advice.',
    flags: flags(['Owner can mint new tokens', 'Owner can blacklist wallets', 'Transfers can be paused', 'Upgradeable proxy (code can change)', 'Hidden owner', 'Can self-destruct', 'Trading cooldown', 'Cannot sell all tokens', 'Taxes can be changed', 'External calls in transfer']),
    alertUsage: 'Usage: /alert eth 3000  (alerts when the price crosses that level)', alertAdded: 'Alert set: {sym} {dir} {target}.', above: 'above', below: 'below', alertsNone: 'No active alert. /alert eth 3000', alertsTitle: 'Active alerts', alertFired: '{sym} is now {price} — {dir} your {target} alert.',
    rateLimited: 'Slow down a little — try again in a minute.', error: 'Something went wrong. Try again in a moment.', unknown: 'Unknown command. /help',
  },
  fr: {
    chooseLanguage: 'Choisis ta langue', languageSet: 'Langue enregistrée.',
    welcomeTitle: 'Bienvenue sur Kalyx', welcomeBody: 'Kalyx est un portefeuille non-custodial : tes clés vivent sur ton téléphone, jamais ici. Ce bot ouvre ton tableau de bord et surveille la chaîne pour toi.', commandsTitle: 'Commandes',
    cmdApp: 'ouvrir le wallet dans Telegram', cmdPrice: 'cours en direct', cmdGas: 'frais réseau maintenant', cmdScan: 'détection honeypot / arnaque', cmdAlert: 'alerte de prix', cmdHelp: 'comment ça marche', cmdLang: 'changer de langue',
    openApp: '⚡ Ouvrir Kalyx', installApp: '📲 Installer l’app', site: '🌍 kalyxwallet.com', download: '📲 Télécharger (Android)', support: '💬 Support', changeLanguage: '🌐 Langue',
    appPrompt: 'Ton tableau de bord, dans Telegram. Chaque signature reste validée sur ton téléphone.', siteTitle: 'Kalyx', siteL1: 'Site officiel et documentation', siteL2: 'Application Android (APK signé)', siteL3: 'Non-custodial : les clés ne quittent jamais ton téléphone',
    helpTitle: 'Comment fonctionne Kalyx', helpBody: 'Ton téléphone est le coffre-fort : les clés y sont créées, chiffrées par ton PIN, et n’en sortent jamais. Le tableau de bord web et ce bot ne lisent que des données publiques et transmettent les demandes de signature au téléphone, où tu les valides.', helpNever: 'Ce bot ne demande jamais de phrase de récupération, de PIN, de clé privée ni de clé API. Si quelqu’un se présentant comme Kalyx le fait, c’est une arnaque.', helpCommands: 'Commandes',
    priceUsage: 'Usage : /price eth  (btc, sol, bnb, pol, arb… ou un id CoinGecko)', priceUnknown: 'Aucune donnée de marché pour « {q} ».', h24: '24 h', cap: 'Cap.',
    gasTitle: 'Frais réseau en ce moment', forTransfer: 'pour un transfert', solanaPriority: '~{n} lamports de priorité (frais de base 5000)', unavailable: 'indisponible',
    scanUsage: 'Usage : /scan 0x… (token ou contrat EVM). Solana : /scan &lt;mint&gt;', scanRunning: '🔍 Vérification avec GoPlus Security…', scanNoData: 'Aucune donnée de sécurité pour cette adresse (inconnue ou trop récente). À considérer comme risquée.', scanNotToken: 'C’est une adresse de wallet (ou de NFT), pas un token. /scan vérifie l’adresse de contrat ou le mint d’un token.', report: 'Rapport de sécurité', honeypot: 'HONEYPOT — tu pourrais ne pas pouvoir revendre', sellable: 'Revendable', buyTax: 'Taxe achat', sellTax: 'Taxe vente', source: 'Code', verified: 'vérifié', notVerified: 'non vérifié', noFlags: 'Aucun droit dangereux du owner détecté.', disclaimer: 'Vérification automatique — pas un conseil financier.',
    flags: flags(['Le owner peut créer de nouveaux tokens', 'Le owner peut blacklister des wallets', 'Les transferts peuvent être suspendus', 'Proxy évolutif (le code peut changer)', 'Owner caché', 'Peut s’autodétruire', 'Délai imposé entre deux échanges', 'Impossible de tout revendre', 'Les taxes peuvent être modifiées', 'Appels externes dans les transferts']),
    alertUsage: 'Usage : /alert eth 3000  (alerte quand le prix franchit ce niveau)', alertAdded: 'Alerte posée : {sym} {dir} {target}.', above: 'au-dessus de', below: 'en dessous de', alertsNone: 'Aucune alerte active. /alert eth 3000', alertsTitle: 'Alertes actives', alertFired: '{sym} est à {price} — {dir} ton alerte à {target}.',
    rateLimited: 'Doucement — réessaie dans une minute.', error: 'Quelque chose a échoué. Réessaie dans un instant.', unknown: 'Commande inconnue. /help',
  },
  es: {
    chooseLanguage: 'Elige tu idioma', languageSet: 'Idioma guardado.',
    welcomeTitle: 'Bienvenido a Kalyx', welcomeBody: 'Kalyx es una cartera no custodial: tus claves viven en tu teléfono, nunca aquí. Este bot abre tu panel y vigila la cadena por ti.', commandsTitle: 'Comandos',
    cmdApp: 'abrir la cartera dentro de Telegram', cmdPrice: 'precio en vivo', cmdGas: 'comisiones de red ahora', cmdScan: 'detección de honeypot / estafa', cmdAlert: 'alerta de precio', cmdHelp: 'cómo funciona', cmdLang: 'cambiar idioma',
    openApp: '⚡ Abrir Kalyx', installApp: '📲 Instalar la app', site: '🌍 kalyxwallet.com', download: '📲 Descargar (Android)', support: '💬 Soporte', changeLanguage: '🌐 Idioma',
    appPrompt: 'Tu panel, dentro de Telegram. Cada firma se sigue aprobando en tu teléfono.', siteTitle: 'Kalyx', siteL1: 'Sitio oficial y documentación', siteL2: 'App Android (APK firmado)', siteL3: 'No custodial: las claves nunca salen de tu teléfono',
    helpTitle: 'Cómo funciona Kalyx', helpBody: 'Tu teléfono es la caja fuerte: las claves se crean ahí, cifradas con tu PIN, y nunca salen. El panel web y este bot solo leen datos públicos y reenvían las solicitudes de firma al teléfono, donde las apruebas.', helpNever: 'Este bot nunca pide frase de recuperación, PIN, clave privada ni clave API. Si alguien que dice ser Kalyx lo hace, es una estafa.', helpCommands: 'Comandos',
    priceUsage: 'Uso: /price eth  (btc, sol, bnb, pol, arb… o un id de CoinGecko)', priceUnknown: 'Sin datos de mercado para «{q}».', h24: '24 h', cap: 'Cap.',
    gasTitle: 'Comisiones de red ahora', forTransfer: 'por una transferencia', solanaPriority: '~{n} lamports de prioridad (tarifa base 5000)', unavailable: 'no disponible',
    scanUsage: 'Uso: /scan 0x… (token o contrato EVM). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 Comprobando con GoPlus Security…', scanNoData: 'Sin datos de seguridad para esta dirección (desconocida o muy nueva). Trátala como riesgosa.', scanNotToken: 'Es una dirección de cartera (o NFT), no un token. /scan verifica el contrato o mint de un token.', report: 'Informe de seguridad', honeypot: 'HONEYPOT — quizá no puedas vender', sellable: 'Vendible', buyTax: 'Tasa compra', sellTax: 'Tasa venta', source: 'Código', verified: 'verificado', notVerified: 'no verificado', noFlags: 'Sin permisos peligrosos del owner.', disclaimer: 'Comprobación automática — no es asesoría financiera.',
    flags: flags(['El owner puede acuñar nuevos tokens', 'El owner puede bloquear carteras', 'Las transferencias pueden pausarse', 'Proxy actualizable (el código puede cambiar)', 'Owner oculto', 'Puede autodestruirse', 'Tiempo de espera entre operaciones', 'No se puede vender todo', 'Las tasas pueden cambiar', 'Llamadas externas en las transferencias']),
    alertUsage: 'Uso: /alert eth 3000  (avisa cuando el precio cruce ese nivel)', alertAdded: 'Alerta creada: {sym} {dir} {target}.', above: 'por encima de', below: 'por debajo de', alertsNone: 'Sin alertas activas. /alert eth 3000', alertsTitle: 'Alertas activas', alertFired: '{sym} está en {price} — {dir} tu alerta de {target}.',
    rateLimited: 'Despacio — inténtalo de nuevo en un minuto.', error: 'Algo falló. Inténtalo en un momento.', unknown: 'Comando desconocido. /help',
  },
  pt: {
    chooseLanguage: 'Escolhe o teu idioma', languageSet: 'Idioma guardado.',
    welcomeTitle: 'Bem-vindo ao Kalyx', welcomeBody: 'O Kalyx é uma carteira non-custodial: as tuas chaves vivem no telemóvel, nunca aqui. Este bot abre o teu painel e vigia a cadeia por ti.', commandsTitle: 'Comandos',
    cmdApp: 'abrir a carteira dentro do Telegram', cmdPrice: 'preço em direto', cmdGas: 'taxas de rede agora', cmdScan: 'deteção de honeypot / fraude', cmdAlert: 'alerta de preço', cmdHelp: 'como funciona', cmdLang: 'mudar idioma',
    openApp: '⚡ Abrir Kalyx', installApp: '📲 Instalar a app', site: '🌍 kalyxwallet.com', download: '📲 Transferir (Android)', support: '💬 Suporte', changeLanguage: '🌐 Idioma',
    appPrompt: 'O teu painel, dentro do Telegram. Cada assinatura continua a ser aprovada no telemóvel.', siteTitle: 'Kalyx', siteL1: 'Site oficial e documentação', siteL2: 'App Android (APK assinado)', siteL3: 'Non-custodial: as chaves nunca saem do telemóvel',
    helpTitle: 'Como funciona o Kalyx', helpBody: 'O telemóvel é o cofre: as chaves são criadas lá, cifradas com o PIN, e nunca saem. O painel web e este bot só leem dados públicos e reenviam os pedidos de assinatura ao telemóvel, onde os aprovas.', helpNever: 'Este bot nunca pede frase de recuperação, PIN, chave privada nem chave API. Se alguém dizendo ser Kalyx o fizer, é fraude.', helpCommands: 'Comandos',
    priceUsage: 'Uso: /price eth  (btc, sol, bnb, pol, arb… ou um id CoinGecko)', priceUnknown: 'Sem dados de mercado para «{q}».', h24: '24 h', cap: 'Cap.',
    gasTitle: 'Taxas de rede agora', forTransfer: 'por transferência', solanaPriority: '~{n} lamports de prioridade (taxa base 5000)', unavailable: 'indisponível',
    scanUsage: 'Uso: /scan 0x… (token ou contrato EVM). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 A verificar com GoPlus Security…', scanNoData: 'Sem dados de segurança para este endereço (desconhecido ou muito recente). Considera-o arriscado.', scanNotToken: 'É um endereço de carteira (ou NFT), não um token. /scan verifica o contrato ou mint de um token.', report: 'Relatório de segurança', honeypot: 'HONEYPOT — podes não conseguir vender', sellable: 'Vendável', buyTax: 'Taxa compra', sellTax: 'Taxa venda', source: 'Código', verified: 'verificado', notVerified: 'não verificado', noFlags: 'Sem permissões perigosas do owner.', disclaimer: 'Verificação automática — não é aconselhamento financeiro.',
    flags: flags(['O owner pode criar novos tokens', 'O owner pode bloquear carteiras', 'As transferências podem ser pausadas', 'Proxy atualizável (o código pode mudar)', 'Owner oculto', 'Pode autodestruir-se', 'Tempo de espera entre trocas', 'Não é possível vender tudo', 'As taxas podem mudar', 'Chamadas externas nas transferências']),
    alertUsage: 'Uso: /alert eth 3000  (avisa quando o preço cruzar esse nível)', alertAdded: 'Alerta criado: {sym} {dir} {target}.', above: 'acima de', below: 'abaixo de', alertsNone: 'Sem alertas ativos. /alert eth 3000', alertsTitle: 'Alertas ativos', alertFired: '{sym} está a {price} — {dir} o teu alerta de {target}.',
    rateLimited: 'Calma — tenta de novo dentro de um minuto.', error: 'Algo falhou. Tenta daqui a pouco.', unknown: 'Comando desconhecido. /help',
  },
  de: {
    chooseLanguage: 'Wähle deine Sprache', languageSet: 'Sprache gespeichert.',
    welcomeTitle: 'Willkommen bei Kalyx', welcomeBody: 'Kalyx ist eine Non-Custodial-Wallet: Deine Schlüssel leben auf deinem Telefon, nie hier. Dieser Bot öffnet dein Dashboard und behält die Chain für dich im Blick.', commandsTitle: 'Befehle',
    cmdApp: 'Wallet in Telegram öffnen', cmdPrice: 'Live-Kurs', cmdGas: 'aktuelle Netzwerkgebühren', cmdScan: 'Honeypot-/Betrugsprüfung', cmdAlert: 'Preisalarm', cmdHelp: 'so funktioniert es', cmdLang: 'Sprache ändern',
    openApp: '⚡ Kalyx öffnen', installApp: '📲 App installieren', site: '🌍 kalyxwallet.com', download: '📲 Download (Android)', support: '💬 Support', changeLanguage: '🌐 Sprache',
    appPrompt: 'Dein Dashboard, direkt in Telegram. Jede Signatur wird weiterhin auf deinem Telefon bestätigt.', siteTitle: 'Kalyx', siteL1: 'Offizielle Website und Dokumentation', siteL2: 'Android-App (signierte APK)', siteL3: 'Non-custodial: Schlüssel verlassen dein Telefon nie',
    helpTitle: 'So funktioniert Kalyx', helpBody: 'Dein Telefon ist der Tresor: Schlüssel entstehen dort, mit deiner PIN verschlüsselt, und verlassen es nie. Das Web-Dashboard und dieser Bot lesen nur öffentliche Daten und leiten Signaturanfragen ans Telefon weiter, wo du sie bestätigst.', helpNever: 'Dieser Bot fragt nie nach Wiederherstellungsphrase, PIN, privatem Schlüssel oder API-Schlüssel. Wer sich als Kalyx ausgibt und das tut, betrügt.', helpCommands: 'Befehle',
    priceUsage: 'Verwendung: /price eth  (btc, sol, bnb, pol, arb… oder eine CoinGecko-ID)', priceUnknown: 'Keine Marktdaten für „{q}“.', h24: '24 h', cap: 'Kap.',
    gasTitle: 'Netzwerkgebühren jetzt', forTransfer: 'für eine Überweisung', solanaPriority: '~{n} Lamports Priorität (Grundgebühr 5000)', unavailable: 'nicht verfügbar',
    scanUsage: 'Verwendung: /scan 0x… (EVM-Token oder -Vertrag). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 Prüfung mit GoPlus Security…', scanNoData: 'Keine Sicherheitsdaten für diese Adresse (unbekannt oder zu neu). Als riskant behandeln.', scanNotToken: 'Das ist eine Wallet- (oder NFT-)Adresse, kein Token. /scan prüft die Vertrags- oder Mint-Adresse eines Tokens.', report: 'Sicherheitsbericht', honeypot: 'HONEYPOT — du kannst möglicherweise nicht verkaufen', sellable: 'Verkaufbar', buyTax: 'Kaufsteuer', sellTax: 'Verkaufssteuer', source: 'Code', verified: 'verifiziert', notVerified: 'nicht verifiziert', noFlags: 'Keine gefährlichen Owner-Rechte gefunden.', disclaimer: 'Automatische Prüfung — keine Finanzberatung.',
    flags: flags(['Owner kann neue Token prägen', 'Owner kann Wallets sperren', 'Transfers können pausiert werden', 'Upgradebarer Proxy (Code kann sich ändern)', 'Versteckter Owner', 'Kann sich selbst zerstören', 'Handels-Cooldown', 'Nicht alles verkaufbar', 'Steuern änderbar', 'Externe Aufrufe im Transfer']),
    alertUsage: 'Verwendung: /alert eth 3000  (Alarm, wenn der Preis dieses Niveau kreuzt)', alertAdded: 'Alarm gesetzt: {sym} {dir} {target}.', above: 'über', below: 'unter', alertsNone: 'Kein aktiver Alarm. /alert eth 3000', alertsTitle: 'Aktive Alarme', alertFired: '{sym} steht bei {price} — {dir} deinem Alarm bei {target}.',
    rateLimited: 'Langsam — versuch es in einer Minute erneut.', error: 'Etwas ist schiefgelaufen. Versuch es gleich noch einmal.', unknown: 'Unbekannter Befehl. /help',
  },
  it: {
    chooseLanguage: 'Scegli la tua lingua', languageSet: 'Lingua salvata.',
    welcomeTitle: 'Benvenuto su Kalyx', welcomeBody: 'Kalyx è un wallet non-custodial: le tue chiavi vivono sul telefono, mai qui. Questo bot apre la tua dashboard e tiene d’occhio la chain per te.', commandsTitle: 'Comandi',
    cmdApp: 'apri il wallet dentro Telegram', cmdPrice: 'prezzo in tempo reale', cmdGas: 'commissioni di rete adesso', cmdScan: 'controllo honeypot / truffa', cmdAlert: 'avviso di prezzo', cmdHelp: 'come funziona', cmdLang: 'cambia lingua',
    openApp: '⚡ Apri Kalyx', installApp: '📲 Installa l’app', site: '🌍 kalyxwallet.com', download: '📲 Scarica (Android)', support: '💬 Supporto', changeLanguage: '🌐 Lingua',
    appPrompt: 'La tua dashboard, dentro Telegram. Ogni firma viene sempre approvata sul telefono.', siteTitle: 'Kalyx', siteL1: 'Sito ufficiale e documentazione', siteL2: 'App Android (APK firmato)', siteL3: 'Non-custodial: le chiavi non lasciano mai il telefono',
    helpTitle: 'Come funziona Kalyx', helpBody: 'Il telefono è la cassaforte: le chiavi nascono lì, cifrate con il PIN, e non escono mai. La dashboard web e questo bot leggono solo dati pubblici e inoltrano le richieste di firma al telefono, dove le approvi.', helpNever: 'Questo bot non chiede mai frase di recupero, PIN, chiave privata o chiave API. Se qualcuno che dice di essere Kalyx lo fa, è una truffa.', helpCommands: 'Comandi',
    priceUsage: 'Uso: /price eth  (btc, sol, bnb, pol, arb… o un id CoinGecko)', priceUnknown: 'Nessun dato di mercato per «{q}».', h24: '24 h', cap: 'Cap.',
    gasTitle: 'Commissioni di rete adesso', forTransfer: 'per un trasferimento', solanaPriority: '~{n} lamport di priorità (fee base 5000)', unavailable: 'non disponibile',
    scanUsage: 'Uso: /scan 0x… (token o contratto EVM). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 Controllo con GoPlus Security…', scanNoData: 'Nessun dato di sicurezza per questo indirizzo (sconosciuto o troppo recente). Trattalo come rischioso.', scanNotToken: 'È un indirizzo di wallet (o NFT), non un token. /scan verifica il contratto o il mint di un token.', report: 'Rapporto di sicurezza', honeypot: 'HONEYPOT — potresti non riuscire a vendere', sellable: 'Vendibile', buyTax: 'Tassa acquisto', sellTax: 'Tassa vendita', source: 'Codice', verified: 'verificato', notVerified: 'non verificato', noFlags: 'Nessun permesso pericoloso del owner.', disclaimer: 'Controllo automatico — non è consulenza finanziaria.',
    flags: flags(['Il owner può creare nuovi token', 'Il owner può bloccare wallet', 'I trasferimenti possono essere sospesi', 'Proxy aggiornabile (il codice può cambiare)', 'Owner nascosto', 'Può autodistruggersi', 'Attesa tra gli scambi', 'Impossibile vendere tutto', 'Le tasse possono cambiare', 'Chiamate esterne nei trasferimenti']),
    alertUsage: 'Uso: /alert eth 3000  (avvisa quando il prezzo supera quel livello)', alertAdded: 'Avviso impostato: {sym} {dir} {target}.', above: 'sopra', below: 'sotto', alertsNone: 'Nessun avviso attivo. /alert eth 3000', alertsTitle: 'Avvisi attivi', alertFired: '{sym} è a {price} — {dir} il tuo avviso a {target}.',
    rateLimited: 'Piano — riprova tra un minuto.', error: 'Qualcosa è andato storto. Riprova tra poco.', unknown: 'Comando sconosciuto. /help',
  },
  nl: {
    chooseLanguage: 'Kies je taal', languageSet: 'Taal opgeslagen.',
    welcomeTitle: 'Welkom bij Kalyx', welcomeBody: 'Kalyx is een non-custodial wallet: je sleutels staan op je telefoon, nooit hier. Deze bot opent je dashboard en houdt de chain voor je in het oog.', commandsTitle: 'Opdrachten',
    cmdApp: 'open de wallet in Telegram', cmdPrice: 'live koers', cmdGas: 'netwerkkosten nu', cmdScan: 'honeypot-/scamcontrole', cmdAlert: 'prijsalarm', cmdHelp: 'hoe het werkt', cmdLang: 'taal wijzigen',
    openApp: '⚡ Kalyx openen', installApp: '📲 App installeren', site: '🌍 kalyxwallet.com', download: '📲 Downloaden (Android)', support: '💬 Support', changeLanguage: '🌐 Taal',
    appPrompt: 'Je dashboard, in Telegram. Elke handtekening wordt nog steeds op je telefoon goedgekeurd.', siteTitle: 'Kalyx', siteL1: 'Officiële site en documentatie', siteL2: 'Android-app (ondertekende APK)', siteL3: 'Non-custodial: sleutels verlaten je telefoon nooit',
    helpTitle: 'Hoe Kalyx werkt', helpBody: 'Je telefoon is de kluis: sleutels worden daar gemaakt, versleuteld met je pincode, en verlaten hem nooit. Het webdashboard en deze bot lezen alleen openbare gegevens en sturen ondertekeningsverzoeken door naar de telefoon, waar jij ze goedkeurt.', helpNever: 'Deze bot vraagt nooit om een herstelzin, pincode, privésleutel of API-sleutel. Doet iemand die zich Kalyx noemt dat wel, dan is het oplichting.', helpCommands: 'Opdrachten',
    priceUsage: 'Gebruik: /price eth  (btc, sol, bnb, pol, arb… of een CoinGecko-id)', priceUnknown: 'Geen marktgegevens voor “{q}”.', h24: '24 u', cap: 'Kap.',
    gasTitle: 'Netwerkkosten nu', forTransfer: 'voor een overboeking', solanaPriority: '~{n} lamports prioriteit (basisvergoeding 5000)', unavailable: 'niet beschikbaar',
    scanUsage: 'Gebruik: /scan 0x… (EVM-token of -contract). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 Controle met GoPlus Security…', scanNoData: 'Geen beveiligingsgegevens voor dit adres (onbekend of te nieuw). Behandel als risicovol.', scanNotToken: 'Dit is een wallet- (of NFT-)adres, geen token. /scan controleert het contract- of mint-adres van een token.', report: 'Beveiligingsrapport', honeypot: 'HONEYPOT — verkopen lukt misschien niet', sellable: 'Verkoopbaar', buyTax: 'Koopbelasting', sellTax: 'Verkoopbelasting', source: 'Code', verified: 'geverifieerd', notVerified: 'niet geverifieerd', noFlags: 'Geen gevaarlijke ownerrechten gevonden.', disclaimer: 'Automatische controle — geen financieel advies.',
    flags: flags(['Owner kan nieuwe tokens aanmaken', 'Owner kan wallets blokkeren', 'Overdrachten kunnen worden gepauzeerd', 'Upgradebare proxy (code kan veranderen)', 'Verborgen owner', 'Kan zichzelf vernietigen', 'Wachttijd tussen trades', 'Niet alles kan worden verkocht', 'Belastingen kunnen veranderen', 'Externe aanroepen bij overdracht']),
    alertUsage: 'Gebruik: /alert eth 3000  (waarschuwt als de prijs dat niveau kruist)', alertAdded: 'Alarm ingesteld: {sym} {dir} {target}.', above: 'boven', below: 'onder', alertsNone: 'Geen actief alarm. /alert eth 3000', alertsTitle: 'Actieve alarmen', alertFired: '{sym} staat op {price} — {dir} je alarm van {target}.',
    rateLimited: 'Rustig aan — probeer het over een minuut opnieuw.', error: 'Er ging iets mis. Probeer het zo opnieuw.', unknown: 'Onbekende opdracht. /help',
  },
  pl: {
    chooseLanguage: 'Wybierz język', languageSet: 'Język zapisany.',
    welcomeTitle: 'Witaj w Kalyx', welcomeBody: 'Kalyx to portfel non-custodial: twoje klucze są na telefonie, nigdy tutaj. Ten bot otwiera twój panel i pilnuje łańcucha za ciebie.', commandsTitle: 'Komendy',
    cmdApp: 'otwórz portfel w Telegramie', cmdPrice: 'kurs na żywo', cmdGas: 'opłaty sieciowe teraz', cmdScan: 'wykrywanie honeypot / oszustw', cmdAlert: 'alert cenowy', cmdHelp: 'jak to działa', cmdLang: 'zmień język',
    openApp: '⚡ Otwórz Kalyx', installApp: '📲 Zainstaluj aplikację', site: '🌍 kalyxwallet.com', download: '📲 Pobierz (Android)', support: '💬 Wsparcie', changeLanguage: '🌐 Język',
    appPrompt: 'Twój panel, w Telegramie. Każdy podpis nadal zatwierdzasz na telefonie.', siteTitle: 'Kalyx', siteL1: 'Oficjalna strona i dokumentacja', siteL2: 'Aplikacja Android (podpisany APK)', siteL3: 'Non-custodial: klucze nigdy nie opuszczają telefonu',
    helpTitle: 'Jak działa Kalyx', helpBody: 'Telefon to sejf: klucze powstają tam, zaszyfrowane PIN-em, i nigdy go nie opuszczają. Panel web i ten bot czytają tylko dane publiczne i przekazują prośby o podpis do telefonu, gdzie je zatwierdzasz.', helpNever: 'Ten bot nigdy nie prosi o frazę odzyskiwania, PIN, klucz prywatny ani klucz API. Jeśli ktoś podający się za Kalyx to robi, to oszustwo.', helpCommands: 'Komendy',
    priceUsage: 'Użycie: /price eth  (btc, sol, bnb, pol, arb… lub id CoinGecko)', priceUnknown: 'Brak danych rynkowych dla „{q}”.', h24: '24 h', cap: 'Kap.',
    gasTitle: 'Opłaty sieciowe teraz', forTransfer: 'za przelew', solanaPriority: '~{n} lamportów priorytetu (opłata bazowa 5000)', unavailable: 'niedostępne',
    scanUsage: 'Użycie: /scan 0x… (token lub kontrakt EVM). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 Sprawdzanie w GoPlus Security…', scanNoData: 'Brak danych bezpieczeństwa dla tego adresu (nieznany lub zbyt nowy). Traktuj jako ryzykowny.', scanNotToken: 'To adres portfela (lub NFT), nie token. /scan sprawdza adres kontraktu lub mint tokena.', report: 'Raport bezpieczeństwa', honeypot: 'HONEYPOT — możesz nie być w stanie sprzedać', sellable: 'Sprzedawalny', buyTax: 'Podatek kupna', sellTax: 'Podatek sprzedaży', source: 'Kod', verified: 'zweryfikowany', notVerified: 'niezweryfikowany', noFlags: 'Brak niebezpiecznych uprawnień właściciela.', disclaimer: 'Kontrola automatyczna — to nie porada finansowa.',
    flags: flags(['Właściciel może tworzyć nowe tokeny', 'Właściciel może blokować portfele', 'Transfery można wstrzymać', 'Aktualizowalne proxy (kod może się zmienić)', 'Ukryty właściciel', 'Może się samozniszczyć', 'Odstęp między transakcjami', 'Nie można sprzedać wszystkiego', 'Podatki można zmienić', 'Zewnętrzne wywołania w transferze']),
    alertUsage: 'Użycie: /alert eth 3000  (alert, gdy cena przekroczy ten poziom)', alertAdded: 'Alert ustawiony: {sym} {dir} {target}.', above: 'powyżej', below: 'poniżej', alertsNone: 'Brak aktywnych alertów. /alert eth 3000', alertsTitle: 'Aktywne alerty', alertFired: '{sym} jest teraz {price} — {dir} twojego alertu {target}.',
    rateLimited: 'Spokojnie — spróbuj ponownie za minutę.', error: 'Coś poszło nie tak. Spróbuj za chwilę.', unknown: 'Nieznana komenda. /help',
  },
  tr: {
    chooseLanguage: 'Dilini seç', languageSet: 'Dil kaydedildi.',
    welcomeTitle: 'Kalyx’e hoş geldin', welcomeBody: 'Kalyx non-custodial bir cüzdan: anahtarların telefonunda yaşar, burada değil. Bu bot panelini açar ve zinciri senin için izler.', commandsTitle: 'Komutlar',
    cmdApp: 'cüzdanı Telegram içinde aç', cmdPrice: 'canlı fiyat', cmdGas: 'anlık ağ ücretleri', cmdScan: 'honeypot / dolandırıcılık kontrolü', cmdAlert: 'fiyat alarmı', cmdHelp: 'nasıl çalışır', cmdLang: 'dili değiştir',
    openApp: '⚡ Kalyx’i aç', installApp: '📲 Uygulamayı kur', site: '🌍 kalyxwallet.com', download: '📲 İndir (Android)', support: '💬 Destek', changeLanguage: '🌐 Dil',
    appPrompt: 'Panelin, Telegram içinde. Her imza yine telefonunda onaylanır.', siteTitle: 'Kalyx', siteL1: 'Resmî site ve belgeler', siteL2: 'Android uygulaması (imzalı APK)', siteL3: 'Non-custodial: anahtarlar telefonundan asla çıkmaz',
    helpTitle: 'Kalyx nasıl çalışır', helpBody: 'Telefonun kasadır: anahtarlar orada oluşturulur, PIN ile şifrelenir ve asla çıkmaz. Web paneli ve bu bot yalnızca herkese açık verileri okur ve imza isteklerini onayladığın telefona iletir.', helpNever: 'Bu bot asla kurtarma ifadesi, PIN, özel anahtar veya API anahtarı istemez. Kalyx adına bunu isteyen biri dolandırıcıdır.', helpCommands: 'Komutlar',
    priceUsage: 'Kullanım: /price eth  (btc, sol, bnb, pol, arb… veya bir CoinGecko id)', priceUnknown: '“{q}” için piyasa verisi yok.', h24: '24 sa', cap: 'Piy. değ.',
    gasTitle: 'Anlık ağ ücretleri', forTransfer: 'bir transfer için', solanaPriority: '~{n} lamport öncelik (temel ücret 5000)', unavailable: 'kullanılamıyor',
    scanUsage: 'Kullanım: /scan 0x… (EVM token veya kontrat). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 GoPlus Security ile kontrol ediliyor…', scanNoData: 'Bu adres için güvenlik verisi yok (bilinmiyor veya çok yeni). Riskli say.', scanNotToken: 'Bu bir cüzdan (veya NFT) adresi, token değil. /scan bir tokenın kontrat veya mint adresini kontrol eder.', report: 'Güvenlik raporu', honeypot: 'HONEYPOT — satamayabilirsin', sellable: 'Satılabilir', buyTax: 'Alış vergisi', sellTax: 'Satış vergisi', source: 'Kod', verified: 'doğrulanmış', notVerified: 'doğrulanmamış', noFlags: 'Tehlikeli owner yetkisi bulunmadı.', disclaimer: 'Otomatik kontrol — finansal tavsiye değildir.',
    flags: flags(['Owner yeni token basabilir', 'Owner cüzdanları kara listeye alabilir', 'Transferler durdurulabilir', 'Yükseltilebilir proxy (kod değişebilir)', 'Gizli owner', 'Kendini yok edebilir', 'İşlemler arası bekleme', 'Tümü satılamaz', 'Vergiler değiştirilebilir', 'Transferde harici çağrılar']),
    alertUsage: 'Kullanım: /alert eth 3000  (fiyat bu seviyeyi geçince uyarır)', alertAdded: 'Alarm kuruldu: {sym} {target} {dir}.', above: 'üzerinde', below: 'altında', alertsNone: 'Aktif alarm yok. /alert eth 3000', alertsTitle: 'Aktif alarmlar', alertFired: '{sym} şimdi {price} — {target} alarmının {dir}.',
    rateLimited: 'Yavaş — bir dakika sonra tekrar dene.', error: 'Bir şeyler ters gitti. Biraz sonra tekrar dene.', unknown: 'Bilinmeyen komut. /help',
  },
  ru: {
    chooseLanguage: 'Выберите язык', languageSet: 'Язык сохранён.',
    welcomeTitle: 'Добро пожаловать в Kalyx', welcomeBody: 'Kalyx — некастодиальный кошелёк: ключи живут на вашем телефоне, никогда здесь. Этот бот открывает панель и следит за сетью для вас.', commandsTitle: 'Команды',
    cmdApp: 'открыть кошелёк в Telegram', cmdPrice: 'курс в реальном времени', cmdGas: 'комиссии сети сейчас', cmdScan: 'проверка на honeypot / скам', cmdAlert: 'ценовое оповещение', cmdHelp: 'как это работает', cmdLang: 'сменить язык',
    openApp: '⚡ Открыть Kalyx', installApp: '📲 Установить приложение', site: '🌍 kalyxwallet.com', download: '📲 Скачать (Android)', support: '💬 Поддержка', changeLanguage: '🌐 Язык',
    appPrompt: 'Ваша панель — внутри Telegram. Каждая подпись по-прежнему подтверждается на телефоне.', siteTitle: 'Kalyx', siteL1: 'Официальный сайт и документация', siteL2: 'Приложение для Android (подписанный APK)', siteL3: 'Некастодиальный: ключи никогда не покидают телефон',
    helpTitle: 'Как работает Kalyx', helpBody: 'Ваш телефон — сейф: ключи создаются там, шифруются PIN-кодом и никогда его не покидают. Веб-панель и этот бот читают только публичные данные и передают запросы на подпись телефону, где вы их подтверждаете.', helpNever: 'Этот бот никогда не просит фразу восстановления, PIN, приватный ключ или API-ключ. Если кто-то от имени Kalyx это делает — это мошенники.', helpCommands: 'Команды',
    priceUsage: 'Использование: /price eth  (btc, sol, bnb, pol, arb… или id CoinGecko)', priceUnknown: 'Нет рыночных данных для «{q}».', h24: '24 ч', cap: 'Кап.',
    gasTitle: 'Комиссии сети сейчас', forTransfer: 'за перевод', solanaPriority: '~{n} лампортов приоритета (базовая комиссия 5000)', unavailable: 'недоступно',
    scanUsage: 'Использование: /scan 0x… (токен или контракт EVM). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 Проверка через GoPlus Security…', scanNoData: 'Нет данных безопасности для этого адреса (неизвестен или слишком новый). Считайте рискованным.', scanNotToken: 'Это адрес кошелька (или NFT), а не токен. /scan проверяет адрес контракта или mint токена.', report: 'Отчёт о безопасности', honeypot: 'HONEYPOT — продать может не получиться', sellable: 'Можно продать', buyTax: 'Налог на покупку', sellTax: 'Налог на продажу', source: 'Код', verified: 'проверен', notVerified: 'не проверен', noFlags: 'Опасных прав владельца не найдено.', disclaimer: 'Автоматическая проверка — не финансовый совет.',
    flags: flags(['Владелец может выпускать новые токены', 'Владелец может блокировать кошельки', 'Переводы можно приостановить', 'Обновляемый прокси (код может измениться)', 'Скрытый владелец', 'Может самоуничтожиться', 'Задержка между сделками', 'Нельзя продать всё', 'Налоги можно изменить', 'Внешние вызовы при переводе']),
    alertUsage: 'Использование: /alert eth 3000  (оповещение при пересечении уровня)', alertAdded: 'Оповещение установлено: {sym} {dir} {target}.', above: 'выше', below: 'ниже', alertsNone: 'Нет активных оповещений. /alert eth 3000', alertsTitle: 'Активные оповещения', alertFired: '{sym} сейчас {price} — {dir} вашего уровня {target}.',
    rateLimited: 'Помедленнее — попробуйте через минуту.', error: 'Что-то пошло не так. Попробуйте чуть позже.', unknown: 'Неизвестная команда. /help',
  },
  ar: {
    chooseLanguage: 'اختر لغتك', languageSet: 'تم حفظ اللغة.',
    welcomeTitle: 'مرحبًا بك في Kalyx', welcomeBody: 'Kalyx محفظة غير وصائية: مفاتيحك تعيش على هاتفك، وليس هنا أبدًا. هذا البوت يفتح لوحة التحكم ويراقب السلسلة من أجلك.', commandsTitle: 'الأوامر',
    cmdApp: 'افتح المحفظة داخل Telegram', cmdPrice: 'السعر المباشر', cmdGas: 'رسوم الشبكة الآن', cmdScan: 'كشف الـ honeypot / الاحتيال', cmdAlert: 'تنبيه سعر', cmdHelp: 'كيف يعمل', cmdLang: 'تغيير اللغة',
    openApp: '⚡ افتح Kalyx', installApp: '📲 ثبّت التطبيق', site: '🌍 kalyxwallet.com', download: '📲 تنزيل (Android)', support: '💬 الدعم', changeLanguage: '🌐 اللغة',
    appPrompt: 'لوحة تحكمك داخل Telegram. كل توقيع يبقى معتمدًا على هاتفك.', siteTitle: 'Kalyx', siteL1: 'الموقع الرسمي والوثائق', siteL2: 'تطبيق Android (APK موقّع)', siteL3: 'غير وصائي: المفاتيح لا تغادر هاتفك أبدًا',
    helpTitle: 'كيف يعمل Kalyx', helpBody: 'هاتفك هو الخزنة: تُنشأ المفاتيح فيه مشفّرة برمز PIN ولا تغادره أبدًا. لوحة الويب وهذا البوت يقرآن البيانات العامة فقط ويرسلان طلبات التوقيع إلى الهاتف حيث توافق عليها.', helpNever: 'هذا البوت لا يطلب أبدًا عبارة الاسترداد أو PIN أو مفتاحًا خاصًا أو مفتاح API. من يدّعي أنه Kalyx ويطلب ذلك محتال.', helpCommands: 'الأوامر',
    priceUsage: 'الاستخدام: /price eth  (btc, sol, bnb, pol, arb… أو معرّف CoinGecko)', priceUnknown: 'لا بيانات سوق لـ «{q}».', h24: '24 س', cap: 'القيمة',
    gasTitle: 'رسوم الشبكة الآن', forTransfer: 'لتحويل واحد', solanaPriority: '~{n} لامبورت أولوية (الرسم الأساسي 5000)', unavailable: 'غير متاح',
    scanUsage: 'الاستخدام: /scan 0x… (رمز أو عقد EVM). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 يجري الفحص عبر GoPlus Security…', scanNoData: 'لا بيانات أمان لهذا العنوان (غير معروف أو جديد جدًا). اعتبره خطرًا.', scanNotToken: 'هذا عنوان محفظة (أو NFT) وليس رمزًا. /scan يفحص عنوان عقد أو mint الرمز.', report: 'تقرير الأمان', honeypot: 'HONEYPOT — قد لا تستطيع البيع', sellable: 'قابل للبيع', buyTax: 'ضريبة الشراء', sellTax: 'ضريبة البيع', source: 'الكود', verified: 'مُتحقَّق', notVerified: 'غير مُتحقَّق', noFlags: 'لا صلاحيات خطرة للمالك.', disclaimer: 'فحص آلي — ليس نصيحة مالية.',
    flags: flags(['المالك يمكنه سكّ رموز جديدة', 'المالك يمكنه حظر محافظ', 'يمكن إيقاف التحويلات', 'Proxy قابل للتحديث (قد يتغير الكود)', 'مالك مخفي', 'يمكنه تدمير نفسه', 'مهلة بين التداولات', 'لا يمكن بيع الكل', 'يمكن تغيير الضرائب', 'استدعاءات خارجية في التحويل']),
    alertUsage: 'الاستخدام: /alert eth 3000  (تنبيه عند تجاوز هذا المستوى)', alertAdded: 'تم ضبط التنبيه: {sym} {dir} {target}.', above: 'فوق', below: 'تحت', alertsNone: 'لا تنبيهات نشطة. /alert eth 3000', alertsTitle: 'التنبيهات النشطة', alertFired: '{sym} الآن {price} — {dir} تنبيهك عند {target}.',
    rateLimited: 'بهدوء — أعد المحاولة بعد دقيقة.', error: 'حدث خطأ. أعد المحاولة بعد لحظات.', unknown: 'أمر غير معروف. /help',
  },
  hi: {
    chooseLanguage: 'अपनी भाषा चुनें', languageSet: 'भाषा सहेजी गई।',
    welcomeTitle: 'Kalyx में आपका स्वागत है', welcomeBody: 'Kalyx एक नॉन-कस्टोडियल वॉलेट है: आपकी कुंजियाँ आपके फ़ोन पर रहती हैं, यहाँ कभी नहीं। यह बॉट आपका डैशबोर्ड खोलता है और चेन पर नज़र रखता है।', commandsTitle: 'कमांड',
    cmdApp: 'Telegram में वॉलेट खोलें', cmdPrice: 'लाइव मूल्य', cmdGas: 'अभी नेटवर्क शुल्क', cmdScan: 'honeypot / धोखाधड़ी जाँच', cmdAlert: 'मूल्य अलर्ट', cmdHelp: 'यह कैसे काम करता है', cmdLang: 'भाषा बदलें',
    openApp: '⚡ Kalyx खोलें', installApp: '📲 ऐप इंस्टॉल करें', site: '🌍 kalyxwallet.com', download: '📲 डाउनलोड (Android)', support: '💬 सहायता', changeLanguage: '🌐 भाषा',
    appPrompt: 'आपका डैशबोर्ड, Telegram के अंदर। हर हस्ताक्षर अब भी आपके फ़ोन पर स्वीकृत होता है।', siteTitle: 'Kalyx', siteL1: 'आधिकारिक साइट और दस्तावेज़', siteL2: 'Android ऐप (साइन किया APK)', siteL3: 'नॉन-कस्टोडियल: कुंजियाँ कभी फ़ोन से बाहर नहीं जातीं',
    helpTitle: 'Kalyx कैसे काम करता है', helpBody: 'आपका फ़ोन तिजोरी है: कुंजियाँ वहीं बनती हैं, PIN से एन्क्रिप्टेड, और कभी बाहर नहीं जातीं। वेब डैशबोर्ड और यह बॉट केवल सार्वजनिक डेटा पढ़ते हैं और हस्ताक्षर अनुरोध फ़ोन को भेजते हैं, जहाँ आप उन्हें स्वीकृत करते हैं।', helpNever: 'यह बॉट कभी रिकवरी वाक्य, PIN, निजी कुंजी या API कुंजी नहीं माँगता। Kalyx के नाम पर कोई माँगे तो वह धोखा है।', helpCommands: 'कमांड',
    priceUsage: 'उपयोग: /price eth  (btc, sol, bnb, pol, arb… या CoinGecko id)', priceUnknown: '“{q}” के लिए बाज़ार डेटा नहीं।', h24: '24 घं', cap: 'कैप',
    gasTitle: 'अभी नेटवर्क शुल्क', forTransfer: 'एक ट्रांसफ़र के लिए', solanaPriority: '~{n} लैम्पोर्ट प्राथमिकता (आधार शुल्क 5000)', unavailable: 'उपलब्ध नहीं',
    scanUsage: 'उपयोग: /scan 0x… (EVM टोकन या कॉन्ट्रैक्ट)। Solana: /scan &lt;mint&gt;', scanRunning: '🔍 GoPlus Security से जाँच हो रही है…', scanNoData: 'इस पते के लिए सुरक्षा डेटा नहीं (अज्ञात या बहुत नया)। जोखिमपूर्ण मानें।', scanNotToken: 'यह वॉलेट (या NFT) पता है, टोकन नहीं। /scan टोकन के कॉन्ट्रैक्ट या mint पते की जाँच करता है।', report: 'सुरक्षा रिपोर्ट', honeypot: 'HONEYPOT — आप बेच नहीं पाएँगे शायद', sellable: 'बेचा जा सकता है', buyTax: 'ख़रीद कर', sellTax: 'बिक्री कर', source: 'कोड', verified: 'सत्यापित', notVerified: 'असत्यापित', noFlags: 'मालिक के ख़तरनाक अधिकार नहीं मिले।', disclaimer: 'स्वचालित जाँच — वित्तीय सलाह नहीं।',
    flags: flags(['मालिक नए टोकन बना सकता है', 'मालिक वॉलेट ब्लैकलिस्ट कर सकता है', 'ट्रांसफ़र रोके जा सकते हैं', 'अपग्रेड योग्य प्रॉक्सी (कोड बदल सकता है)', 'छिपा मालिक', 'स्वयं नष्ट हो सकता है', 'ट्रेड के बीच प्रतीक्षा', 'सब बेचा नहीं जा सकता', 'कर बदले जा सकते हैं', 'ट्रांसफ़र में बाहरी कॉल']),
    alertUsage: 'उपयोग: /alert eth 3000  (मूल्य इस स्तर को पार करे तो अलर्ट)', alertAdded: 'अलर्ट सेट: {sym} {target} से {dir}।', above: 'ऊपर', below: 'नीचे', alertsNone: 'कोई सक्रिय अलर्ट नहीं। /alert eth 3000', alertsTitle: 'सक्रिय अलर्ट', alertFired: '{sym} अब {price} है — आपके {target} अलर्ट से {dir}।',
    rateLimited: 'धीरे — एक मिनट बाद फिर कोशिश करें।', error: 'कुछ गड़बड़ हुई। थोड़ी देर बाद कोशिश करें।', unknown: 'अज्ञात कमांड। /help',
  },
  zh: {
    chooseLanguage: '选择你的语言', languageSet: '语言已保存。',
    welcomeTitle: '欢迎使用 Kalyx', welcomeBody: 'Kalyx 是非托管钱包：密钥保存在你的手机上，永远不在这里。此机器人为你打开仪表盘并盯着链上动态。', commandsTitle: '命令',
    cmdApp: '在 Telegram 内打开钱包', cmdPrice: '实时价格', cmdGas: '当前网络费用', cmdScan: '蜜罐 / 诈骗检测', cmdAlert: '价格提醒', cmdHelp: '工作原理', cmdLang: '更改语言',
    openApp: '⚡ 打开 Kalyx', installApp: '📲 安装应用', site: '🌍 kalyxwallet.com', download: '📲 下载（Android）', support: '💬 支持', changeLanguage: '🌐 语言',
    appPrompt: '你的仪表盘，就在 Telegram 里。每次签名仍在你的手机上批准。', siteTitle: 'Kalyx', siteL1: '官方网站与文档', siteL2: 'Android 应用（签名 APK）', siteL3: '非托管：密钥永不离开手机',
    helpTitle: 'Kalyx 如何工作', helpBody: '手机是保险箱：密钥在那里生成，用 PIN 加密，永不离开。网页仪表盘和此机器人只读取公开数据，并把签名请求转给手机由你批准。', helpNever: '此机器人绝不会索要助记词、PIN、私钥或 API 密钥。冒充 Kalyx 索要这些的是骗子。', helpCommands: '命令',
    priceUsage: '用法：/price eth（btc、sol、bnb、pol、arb… 或 CoinGecko id）', priceUnknown: '没有“{q}”的行情数据。', h24: '24 小时', cap: '市值',
    gasTitle: '当前网络费用', forTransfer: '一次转账', solanaPriority: '约 {n} lamports 优先费（基础费 5000）', unavailable: '不可用',
    scanUsage: '用法：/scan 0x…（EVM 代币或合约）。Solana：/scan &lt;mint&gt;', scanRunning: '🔍 正在通过 GoPlus Security 检查…', scanNoData: '该地址没有安全数据（未知或太新），请视为高风险。', scanNotToken: '这是钱包（或 NFT）地址，不是代币。/scan 检查代币的合约或 mint 地址。', report: '安全报告', honeypot: '蜜罐 — 你可能无法卖出', sellable: '可卖出', buyTax: '买入税', sellTax: '卖出税', source: '代码', verified: '已验证', notVerified: '未验证', noFlags: '未发现危险的所有者权限。', disclaimer: '自动检测 — 不构成投资建议。',
    flags: flags(['所有者可增发代币', '所有者可拉黑钱包', '转账可被暂停', '可升级代理（代码可变）', '隐藏所有者', '可自毁', '交易冷却时间', '无法全部卖出', '税率可更改', '转账中有外部调用']),
    alertUsage: '用法：/alert eth 3000（价格越过该水平时提醒）', alertAdded: '已设置提醒：{sym} {dir} {target}。', above: '高于', below: '低于', alertsNone: '没有活动提醒。/alert eth 3000', alertsTitle: '活动提醒', alertFired: '{sym} 现价 {price} — {dir}你的 {target} 提醒。',
    rateLimited: '慢一点——一分钟后再试。', error: '出错了，请稍后再试。', unknown: '未知命令。/help',
  },
  ja: {
    chooseLanguage: '言語を選んでください', languageSet: '言語を保存しました。',
    welcomeTitle: 'Kalyx へようこそ', welcomeBody: 'Kalyx はノンカストディアルなウォレットです。鍵はあなたのスマートフォンにあり、ここには決してありません。このボットはダッシュボードを開き、チェーンを見守ります。', commandsTitle: 'コマンド',
    cmdApp: 'Telegram 内でウォレットを開く', cmdPrice: 'リアルタイム価格', cmdGas: '現在のネットワーク手数料', cmdScan: 'ハニーポット / 詐欺チェック', cmdAlert: '価格アラート', cmdHelp: '仕組み', cmdLang: '言語を変更',
    openApp: '⚡ Kalyx を開く', installApp: '📲 アプリをインストール', site: '🌍 kalyxwallet.com', download: '📲 ダウンロード（Android）', support: '💬 サポート', changeLanguage: '🌐 言語',
    appPrompt: 'あなたのダッシュボードを Telegram の中で。署名は引き続きスマートフォンで承認します。', siteTitle: 'Kalyx', siteL1: '公式サイトとドキュメント', siteL2: 'Android アプリ（署名済み APK）', siteL3: 'ノンカストディアル：鍵はスマートフォンを離れません',
    helpTitle: 'Kalyx の仕組み', helpBody: 'スマートフォンが金庫です。鍵はそこで作られ、PIN で暗号化され、決して外に出ません。ウェブダッシュボードとこのボットは公開データを読むだけで、署名要求はスマートフォンに転送され、あなたが承認します。', helpNever: 'このボットがリカバリーフレーズ、PIN、秘密鍵、API キーを求めることは決してありません。Kalyx を名乗って求める者は詐欺です。', helpCommands: 'コマンド',
    priceUsage: '使い方：/price eth（btc、sol、bnb、pol、arb… または CoinGecko の id）', priceUnknown: '「{q}」の市場データがありません。', h24: '24 時間', cap: '時価総額',
    gasTitle: '現在のネットワーク手数料', forTransfer: '送金 1 回あたり', solanaPriority: '優先手数料 約 {n} lamports（基本手数料 5000）', unavailable: '取得不可',
    scanUsage: '使い方：/scan 0x…（EVM トークンまたはコントラクト）。Solana：/scan &lt;mint&gt;', scanRunning: '🔍 GoPlus Security で確認中…', scanNoData: 'このアドレスの安全性データがありません（不明または新しすぎます）。リスクありとして扱ってください。', scanNotToken: 'これはウォレット（または NFT）のアドレスで、トークンではありません。/scan はトークンのコントラクト／ミントアドレスを確認します。', report: 'セキュリティレポート', honeypot: 'ハニーポット — 売却できない可能性', sellable: '売却可能', buyTax: '購入税', sellTax: '売却税', source: 'コード', verified: '検証済み', notVerified: '未検証', noFlags: '危険なオーナー権限は見つかりません。', disclaimer: '自動チェック — 投資助言ではありません。',
    flags: flags(['オーナーが新規発行可能', 'オーナーがウォレットをブラックリスト化可能', '送金を停止可能', 'アップグレード可能プロキシ（コードが変わり得る）', '隠れたオーナー', '自己破壊可能', '取引クールダウン', '全量売却不可', '税率を変更可能', '送金時に外部呼び出し']),
    alertUsage: '使い方：/alert eth 3000（価格がその水準を越えたら通知）', alertAdded: 'アラート設定：{sym} が {target} {dir}。', above: 'より上', below: 'より下', alertsNone: '有効なアラートはありません。/alert eth 3000', alertsTitle: '有効なアラート', alertFired: '{sym} は現在 {price} — 設定した {target} {dir}です。',
    rateLimited: '少し待って、1 分後にもう一度お試しください。', error: '問題が発生しました。しばらくしてからお試しください。', unknown: '不明なコマンドです。/help',
  },
  ko: {
    chooseLanguage: '언어를 선택하세요', languageSet: '언어가 저장되었습니다.',
    welcomeTitle: 'Kalyx에 오신 것을 환영합니다', welcomeBody: 'Kalyx는 논커스터디얼 지갑입니다. 키는 휴대폰에만 있고 여기에는 절대 없습니다. 이 봇은 대시보드를 열고 체인을 대신 지켜봅니다.', commandsTitle: '명령어',
    cmdApp: 'Telegram 안에서 지갑 열기', cmdPrice: '실시간 가격', cmdGas: '현재 네트워크 수수료', cmdScan: '허니팟 / 사기 검사', cmdAlert: '가격 알림', cmdHelp: '작동 방식', cmdLang: '언어 변경',
    openApp: '⚡ Kalyx 열기', installApp: '📲 앱 설치', site: '🌍 kalyxwallet.com', download: '📲 다운로드 (Android)', support: '💬 지원', changeLanguage: '🌐 언어',
    appPrompt: 'Telegram 안의 내 대시보드. 모든 서명은 여전히 휴대폰에서 승인합니다.', siteTitle: 'Kalyx', siteL1: '공식 사이트 및 문서', siteL2: 'Android 앱 (서명된 APK)', siteL3: '논커스터디얼: 키는 휴대폰을 절대 떠나지 않음',
    helpTitle: 'Kalyx 작동 방식', helpBody: '휴대폰이 금고입니다. 키는 그곳에서 생성되어 PIN으로 암호화되며 절대 밖으로 나가지 않습니다. 웹 대시보드와 이 봇은 공개 데이터만 읽고 서명 요청을 휴대폰으로 전달하며, 승인은 당신이 합니다.', helpNever: '이 봇은 복구 문구, PIN, 개인 키, API 키를 절대 요구하지 않습니다. Kalyx를 사칭해 요구하는 사람은 사기입니다.', helpCommands: '명령어',
    priceUsage: '사용법: /price eth  (btc, sol, bnb, pol, arb… 또는 CoinGecko id)', priceUnknown: '“{q}”에 대한 시장 데이터가 없습니다.', h24: '24시간', cap: '시총',
    gasTitle: '현재 네트워크 수수료', forTransfer: '전송 1회', solanaPriority: '우선 수수료 약 {n} lamports (기본 수수료 5000)', unavailable: '사용 불가',
    scanUsage: '사용법: /scan 0x… (EVM 토큰 또는 컨트랙트). Solana: /scan &lt;mint&gt;', scanRunning: '🔍 GoPlus Security로 확인 중…', scanNoData: '이 주소의 보안 데이터가 없습니다 (알 수 없거나 너무 새로움). 위험한 것으로 간주하세요.', scanNotToken: '이것은 지갑(또는 NFT) 주소이며 토큰이 아닙니다. /scan은 토큰의 컨트랙트 또는 mint 주소를 확인합니다.', report: '보안 보고서', honeypot: '허니팟 — 매도가 불가능할 수 있음', sellable: '매도 가능', buyTax: '매수 세율', sellTax: '매도 세율', source: '코드', verified: '검증됨', notVerified: '미검증', noFlags: '위험한 소유자 권한이 없습니다.', disclaimer: '자동 검사 — 투자 조언이 아닙니다.',
    flags: flags(['소유자가 새 토큰을 발행할 수 있음', '소유자가 지갑을 차단할 수 있음', '전송이 일시 중지될 수 있음', '업그레이드 가능한 프록시 (코드 변경 가능)', '숨겨진 소유자', '자기 파괴 가능', '거래 쿨다운', '전량 매도 불가', '세율 변경 가능', '전송 중 외부 호출']),
    alertUsage: '사용법: /alert eth 3000  (가격이 그 수준을 넘으면 알림)', alertAdded: '알림 설정: {sym} {target} {dir}.', above: '이상', below: '이하', alertsNone: '활성 알림이 없습니다. /alert eth 3000', alertsTitle: '활성 알림', alertFired: '{sym}이(가) 현재 {price} — 설정한 {target} {dir}입니다.',
    rateLimited: '잠시만요 — 1분 후 다시 시도하세요.', error: '문제가 발생했습니다. 잠시 후 다시 시도하세요.', unknown: '알 수 없는 명령어입니다. /help',
  },
};

const STRINGS: Record<Lang, Strings> = Object.fromEntries(LANGS.map((l) => [l, build(W[l])])) as Record<Lang, Strings>;

export function strings(lang: Lang | string | undefined): Strings {
  return STRINGS[toLang(lang)];
}
