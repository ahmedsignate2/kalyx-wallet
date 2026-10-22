/**
 * STON.fi (échanges TON) dans l'EXTENSION : absent. Substitué au module du
 * cœur au moment du build (scripts/registryPlugin.ts) — l'extension ne sert
 * pas TON. Le garde du cœur (src/domain/swap/guard) n'accepte alors AUCUN
 * routeur TON : un devis TON est toujours refusé.
 */
export const STONFI_ROUTERS: ReadonlySet<string> = new Set();

export function tonSwapPaysUser(): boolean {
  return false;
}
