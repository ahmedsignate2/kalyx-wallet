/**
 * Noms des modules natifs que l'app charge de façon GARDÉE.
 *
 * Certains modules natifs ne sont présents qu'après un build qui les embarque ;
 * les importer directement ferait planter l'app sur une installation plus
 * ancienne. On vérifie donc d'abord leur présence avec
 * `requireOptionalNativeModule(nom)` — et ce nom doit être EXACTEMENT celui sous
 * lequel le paquet enregistre son module.
 *
 * C'est là que l'erreur s'était glissée : `expo-image-picker` s'enregistre sous
 * « ExponentImagePicker », avec l'ancien préfixe Exponent, et la garde cherchait
 * « ExpoImagePicker ». Elle ne le trouvait jamais : le choix d'une photo dans le
 * scanner se déclarait indisponible sur TOUS les builds, et l'écran retombait
 * sur le presse-papiers. Aucune erreur, aucun plantage — juste une fonction
 * absente.
 *
 * `nativeModules.test.ts` lit le code des paquets installés et échoue si un nom
 * ne correspond plus : une mise à jour d'Expo qui renommerait un module sera
 * vue en CI, pas par un utilisateur.
 */
export const NATIVE_MODULE = {
  /** `expo-camera` */
  camera: 'ExpoCamera',
  /** `expo-image-picker` — préfixe « Exponent », pas « Expo ». */
  imagePicker: 'ExponentImagePicker',
} as const;

/** Paquet npm de chaque module, pour le test de correspondance. */
export const NATIVE_MODULE_PACKAGE: Record<keyof typeof NATIVE_MODULE, string> = {
  camera: 'expo-camera',
  imagePicker: 'expo-image-picker',
};
