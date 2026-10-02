/**
 * HÔTE RÉEL d'une URL déclarée par une dApp — celui qu'on montre comme origine.
 *
 * Écrit à la main, sans `URL` : l'implémentation de React Native lit l'hôte
 * avec une expression qui laisse « @ » franchir un « / » ou un « ? »
 * (« https://evil.com/@app.uniswap.org » donnait « app.uniswap.org »). Ici :
 * schéma retiré, autorité coupée au premier « / ? # \ », identifiants
 * (`user:mot@`) retirés jusqu'au DERNIER « @ » de l'autorité, port retiré.
 * Rend '' si rien d'exploitable.
 */
export function dappHost(url: string): string {
  if (!url) return '';
  const noScheme = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const authority = noScheme.split(/[/?#\\]/)[0] ?? '';
  const host = authority.slice(authority.lastIndexOf('@') + 1);
  // IPv6 entre crochets : gardé tel quel ; sinon le port est retiré.
  const bare = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return bare.toLowerCase();
}
