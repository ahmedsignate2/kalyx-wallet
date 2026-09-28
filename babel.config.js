module.exports = function (api) {
  api.cache(true);
  /*
   * Les `console.*` sont CONSERVÉS en production (28/09) : le journal de
   * diagnostic (lib/debugJournal.ts) les recopie, filtrés, dans l'écran
   * Développeur → Journal. `transform-remove-console` les supprimait tous, et
   * le journal restait muet sur les étapes du coffre, de WalletConnect et de
   * TON Connect. Hors du journal, seul `adb` lit le journal système Android.
   *
   * Changer ce fichier impose `eas update … --clear-cache` : Metro garde
   * sinon les modules compilés avec l'ancienne configuration.
   */
  return {
    presets: ['babel-preset-expo'],
  };
};
