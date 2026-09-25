/**
 * Extraction d'intentions depuis un lien profond (pur, testable).
 *
 * Ces trois fonctions vivaient dans `ui/DeepLinks.tsx`, hors des `roots` de
 * Jest (`src` et `lib`) : la porte d'entrée de l'app depuis l'extérieur n'avait
 * donc AUCUN test, alors que c'est exactement le genre de code où une casse
 * passe inaperçue — un lien qui ne mène nulle part ne lève pas d'erreur, il ne
 * fait simplement rien.
 *
 * Aucune de ces fonctions ne navigue ni n'exécute : elles classent, et l'UI
 * décide après confirmation.
 */

/** Schémas d'URI de paiement reconnus, dans leur forme directe. */
export const PAY_SCHEMES = ['ethereum:', 'bitcoin:', 'solana:'] as const;

/** Valeur d'un paramètre de requête, décodée, ou null. */
function queryParam(url: string, key: string): string | null {
  const m = url.match(new RegExp(`[?&]${key}=([^&]+)`));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Extrait une URI WalletConnect d'un lien (directe ou via `?uri=`). */
export function extractWcUri(url: string): string | null {
  if (url.startsWith('wc:')) return decodeURIComponent(url);

  /*
   * Lien WalletConnect direct intercepté par le schéma `kalyx://`. Certains
   * systèmes réécrivent `wc:<topic>@2?…` en `kalyx://<topic>@2?…` : on le
   * reconnaît à ses paramètres propres, pas à son schéma.
   */
  if (url.startsWith('kalyx://') && (url.includes('symKey=') || url.includes('relay-protocol='))) {
    return `wc:${url.slice('kalyx://'.length)}`;
  }

  const decoded = queryParam(url, 'uri');
  return decoded && decoded.startsWith('wc:') ? decoded : null;
}

/**
 * Extrait une URI de paiement d'un lien (directe, ou enveloppée dans
 * `…/pay?uri=…`).
 *
 * L'enveloppe existe pour les liens PARTAGÉS : un `bitcoin:` collé dans une
 * conversation n'est pas cliquable partout et ne mène nulle part sans l'app,
 * alors qu'un `https://kalyxwallet.com/pay?uri=…` l'est toujours et peut servir
 * une page d'installation à qui n'a pas Kalyx.
 */
export function extractPaymentUri(url: string): string | null {
  const lower = url.toLowerCase();
  if (PAY_SCHEMES.some((p) => lower.startsWith(p))) return url;

  const isEnvelope = /^kalyx:\/\/pay\b/i.test(url) || /^https:\/\/kalyxwallet\.com\/pay\b/i.test(url);
  if (!isEnvelope) return null;

  const decoded = queryParam(url, 'uri');
  if (!decoded) return null;
  return PAY_SCHEMES.some((p) => decoded.toLowerCase().startsWith(p)) ? decoded : null;
}

/**
 * Extrait une URL https à ouvrir dans le navigateur dApps
 * (`kalyx://browse?url=…`).
 *
 * `https` uniquement : un `http` en clair, ou un `javascript:`/`data:` glissé
 * ici, s'ouvrirait dans une WebView où le portefeuille est injecté.
 */
export function extractBrowseUrl(url: string): string | null {
  const decoded = queryParam(url, 'url');
  return decoded && /^https:\/\//i.test(decoded) ? decoded : null;
}
