/** Adresses de logos distants chargeables sur iOS (voir LogoImage). */

/** URL qu'un <Image> / SvgUri sait charger sur iOS comme sur Android. */
export function displayableLogoUri(uri: string): string {
  const u = uri.trim();
  if (u.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${u.slice(7).replace(/^ipfs\//, '')}`;
  if (/^http:\/\//i.test(u)) return `https://${u.slice(7)}`;
  return u;
}

/** Vrai pour un SVG distant (extension, avant la requête ou le fragment). */
export function isSvgUri(uri: string): boolean {
  return /^https:\/\/[^?#]+\.svg(?:[?#]|$)/i.test(uri);
}
