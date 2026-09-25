/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/lib'],
  testMatch: ['**/*.test.ts'],

  /*
   * `@scure/btc-signer` est publié en ESM PUR (`"type": "module"`, aucune
   * variante CommonJS). Jest tourne en CommonJS : il ne pouvait donc pas le
   * charger, et TOUT le chemin de signature Bitcoin — BIP-137, BIP-322,
   * construction de transaction — n'était couvert par aucun test. Le code de
   * production contourne le problème avec un `await import()` dynamique, ce qui
   * le rend chargeable mais pas testable.
   *
   * Périmètre réduit au strict nécessaire : `@scure/btc-signer` (ses copies
   * IMBRIQUÉES de `@noble/curves`, `@noble/hashes` et `@scure/base` sont sous
   * son chemin, donc couvertes) et `micro-packed`, ESM pur lui aussi.
   *
   * Surtout PAS `@scure`/`@noble` en général : les copies à la racine de
   * `node_modules` sont déjà publiées en CommonJS, les transformer serait du
   * travail pour rien. (Mesuré : à cache chaud, la suite complète met le même
   * temps qu'avant cette configuration — le surcoût n'existe qu'à la première
   * exécution, quand le cache de transformation se reconstruit.)
   */
  /*
   * Motif ANCRÉ (`^`) et non `/node_modules/(?!…)`. Sans l'ancre, la négation
   * peut être satisfaite à n'importe quelle occurrence de `/node_modules/` :
   * pour `…/node_modules/@scure/btc-signer/node_modules/@noble/curves/…`, elle
   * échoue à la première mais réussit à la SECONDE, et le fichier repassait en
   * « ignoré ». Ancré, le chemin entier est jugé d'un bloc.
   */
  transformIgnorePatterns: ['^(?!.*(?:@scure[/\\\\]btc-signer|micro-packed)).*[/\\\\]node_modules[/\\\\]'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}],
    // ESM → CommonJS, sans preset : le paquet est déjà du JS moderne, seule la
    // forme des modules pose problème.
    '^.+\\.js$': [
      'babel-jest',
      { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] },
    ],
  },
};
