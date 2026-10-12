/**
 * LIEN DE RETOUR VERS LA dApp, après une connexion ou une signature.
 *
 * WalletConnect (`metadata.redirect`) et TON Connect (paramètre `ret`) laissent
 * la dApp déclarer où renvoyer l'utilisateur. Ce lien vient de la dApp, donc
 * d'un tiers : l'ouvrir sans contrôle, c'est laisser n'importe quel site
 * envoyer l'utilisateur, juste après une signature, vers une page de son choix
 * (fausse « confirmation » qui redemande la phrase secrète, par exemple).
 *
 * Règles :
 *  - lien web : https seulement, et sur le domaine de la dApp (ou un de ses
 *    sous-domaines) — un « retour » vers un autre site n'en est pas un ;
 *  - lien d'application (`metamask://`, `tg://`…) : accepté, sauf les schémas
 *    qui exécutent ou lisent du contenu (`javascript:`, `data:`, `file:`…),
 *    `intent:` (Android : lance n'importe quelle activité) et le nôtre (boucle).
 */

import { dappHost } from './dappHost';

/** Schémas jamais ouverts comme « application » de retour. */
/*
 * Schémas de NAVIGATEURS refusés aussi : « x-safari-https://n'importe-où » ouvrait
 * n'importe quel site sans le contrôle de domaine appliqué aux liens web.
 */
const FORBIDDEN_NATIVE = new Set([
  'http', 'https', 'javascript', 'vbscript', 'data', 'file', 'blob', 'about', 'content', 'intent', 'kalyx',
  'x-safari-http', 'x-safari-https', 'googlechrome', 'googlechromes', 'firefox', 'firefox-focus', 'opera-http', 'opera-https', 'brave', 'microsoft-edge-http', 'microsoft-edge-https', 'duckduckgo',
]);

/** `www.` retiré : « www.dapp.io » et « dapp.io » sont le même site pour l'utilisateur. */
const bare = (h: string) => h.replace(/^www\./, '');

/** Lien web de retour acceptable pour la dApp dont le site est `dappUrl`. */
export function safeUniversalReturn(url: unknown, dappUrl: unknown): string | null {
  if (typeof url !== 'string' || typeof dappUrl !== 'string') return null;
  const u = url.trim();
  if (!/^https:\/\/[^\s]+$/i.test(u)) return null;
  // Le site de la dApp doit lui-même être une adresse web, sinon il n'y a pas de domaine à comparer.
  if (!/^https?:\/\//i.test(dappUrl.trim())) return null;
  const host = bare(dappHost(u));
  const site = bare(dappHost(dappUrl));
  if (!host || !site || !site.includes('.')) return null;
  return host === site || host.endsWith(`.${site}`) ? u : null;
}

/** Lien d'application de retour acceptable (schéma propre à une app). */
export function safeNativeReturn(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u || /\s/.test(u)) return null;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(u);
  if (!m) return null;
  return FORBIDDEN_NATIVE.has(m[1].toLowerCase()) ? null : u;
}

/**
 * WalletConnect : `metadata.redirect` de la dApp, contrôlé contre `metadata.url`.
 * Le lien d'application d'abord (retour direct dans l'app de la dApp), sinon le
 * lien web. `null` : rien d'ouvrable sans risque.
 */
export function wcReturnUrl(redirect: { native?: unknown; universal?: unknown } | null | undefined, dappUrl: unknown): string | null {
  if (!redirect || typeof redirect !== 'object') return null;
  return safeNativeReturn(redirect.native) ?? safeUniversalReturn(redirect.universal, dappUrl);
}

/**
 * TON Connect : paramètre `ret` du lien de connexion. `back` (valeur par
 * défaut de la spec) et `none` ne désignent aucune adresse : rien à ouvrir —
 * iOS ne permet pas de « revenir » à l'app précédente.
 */
export function tonReturnUrl(ret: unknown, dappUrl: unknown): string | null {
  if (typeof ret !== 'string') return null;
  const r = ret.trim();
  if (!r || r === 'back' || r === 'none') return null;
  return /^https?:\/\//i.test(r) ? safeUniversalReturn(r, dappUrl) : safeNativeReturn(r);
}
