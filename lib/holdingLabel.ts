/**
 * Libellé d'une position : « Nom · Réseau », SAUF quand le réseau répète le
 * nom. La liste affichait « Ethereum · Ethereum », « TON · TON »,
 * « Solana · Solana » : du bruit à chaque ligne. Le réseau reste quand il
 * apporte une information (« Ethereum · Base », « Tether USD · TON »).
 */
/** `aliases` : autres noms du même actif (symbole, nom complet) comparés au réseau. */
export function holdingLabel(title: string, chainName: string, aliases: string[] = []): string {
  const c = chainName.trim().toLowerCase();
  const same = [title, ...aliases].some((x) => {
    const v = x.trim().toLowerCase();
    return v === c || c.startsWith(`${v} `); // « BNB » sur « BNB Chain »
  });
  return same ? title : `${title} · ${chainName}`;
}
