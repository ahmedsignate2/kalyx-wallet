/**
 * `Buffer.prototype.subarray` doit rendre un `Buffer` — sous Hermes aussi.
 *
 * ## Le plantage
 *
 * L'app s'arrêtait AU DÉMARRAGE sur Android, dès que TON était chargé :
 * `TypeError: undefined is not a function` dans `getRepr` de `@ton/core`.
 *
 * `@ton/core` construit ses cellules avec des `Buffer` (le paquet `buffer`,
 * installé en global par `polyfills.ts`) et en extrait des morceaux par
 * `subarray`, puis appelle des méthodes de `Buffer` dessus (`.copy`, `.equals`…).
 * Sur V8 (Node, Chrome) et JavaScriptCore, `subarray` respecte `Symbol.species`
 * et rend donc un `Buffer`. **Hermes n'implémente pas `species` pour les
 * tableaux typés** : il rend un `Uint8Array` nu, sans `.copy` — d'où l'erreur.
 * Jest (Node) et l'export web (Chromium) ne pouvaient pas le voir.
 *
 * Le paquet `buffer` le sait : sa propre méthode `slice` rétablit le prototype
 * après `subarray`. Mais `subarray` lui-même n'est pas redéfini.
 *
 * ## Le correctif
 *
 * Redéfinir `subarray` pour qu'il fasse ce qu'il fait sous V8 : même mémoire
 * partagée (aucune copie), prototype `Buffer`. Idempotent.
 */
type BufferCtor = { prototype: Uint8Array & { __kalyxSubarray?: true } };

export function installBufferSubarrayFix(BufferCtor: BufferCtor | undefined | null): void {
  if (!BufferCtor?.prototype || BufferCtor.prototype.__kalyxSubarray) return;
  const native = Uint8Array.prototype.subarray;
  Object.defineProperty(BufferCtor.prototype, 'subarray', {
    configurable: true,
    writable: true,
    value: function subarray(this: Uint8Array, start?: number, end?: number) {
      const sub = native.call(this, start, end);
      Object.setPrototypeOf(sub, BufferCtor.prototype);
      return sub;
    },
  });
  Object.defineProperty(BufferCtor.prototype, '__kalyxSubarray', { value: true });
}
