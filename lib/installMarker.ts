/**
 * Témoin d'installation — détecte une RÉINSTALLATION sur iOS.
 *
 * Le trousseau iOS (expo-secure-store) SURVIT à la désinstallation de l'app,
 * AsyncStorage non. Après une réinstallation, la liste des portefeuilles (et
 * leurs coffres chiffrés) réapparaît donc, alors que l'historique, les
 * préférences locales, etc. ont disparu.
 *
 * Ce module pose un drapeau AsyncStorage au premier lancement. Drapeau ABSENT
 * + AsyncStorage vide + portefeuilles présents dans le trousseau (iOS) ⇒
 * réinstallation probable.
 *
 * Choix volontaire : AUCUN effacement automatique. AsyncStorage peut aussi être
 * vidé pour d'autres raisons (restauration partielle, nettoyage système, bug) ;
 * effacer le trousseau sur cette seule base risquerait de détruire l'unique
 * copie d'un coffre (perte de fonds si la phrase n'a pas été notée). Le
 * résultat est conservé (`reinstallPending`) pour qu'un écran FUTUR propose à
 * l'utilisateur de garder ou de retirer ces portefeuilles, puis appelle
 * `acknowledgeReinstall()`. Pour l'instant, seul le journal technique en parle.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { loadWalletsList } from './secureStore';

export const INSTALL_MARKER_KEY = 'kalyx.installMarker';

interface Marker {
  v: 1;
  /** Date de pose du témoin (ms). */
  at: number;
  /** Réinstallation détectée, pas encore traitée par l'utilisateur. */
  reinstallPending: boolean;
}

/** Dépendances injectables (tests). */
export interface InstallMarkerDeps {
  os: string;
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  getAllKeys: () => Promise<readonly string[]>;
  walletCount: () => Promise<number>;
  now: () => number;
}

const defaultDeps = (): InstallMarkerDeps => ({
  os: Platform.OS,
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  getAllKeys: () => AsyncStorage.getAllKeys(),
  walletCount: async () => (await loadWalletsList()).length,
  now: () => Date.now(),
});

function parse(raw: string | null): Marker | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<Marker>;
    return { v: 1, at: Number(m.at) || 0, reinstallPending: m.reinstallPending === true };
  } catch {
    // Valeur illisible : le témoin existe quand même → installation connue.
    return { v: 1, at: 0, reinstallPending: false };
  }
}

/**
 * Vrai si une réinstallation iOS a été détectée et n'a pas encore été traitée.
 * Pose le témoin au premier appel. N'efface JAMAIS rien. Ne lève jamais.
 */
/** Clés que l'app écrit d'elle-même au démarrage, avant tout usage. */
const BOOT_WRITTEN_KEY = /^kalyx\.(debugJournal\.|rpcOverrides\.)/;

export async function detectReinstall(deps: InstallMarkerDeps = defaultDeps()): Promise<boolean> {
  try {
    const existing = parse(await deps.getItem(INSTALL_MARKER_KEY));
    if (existing) return existing.reinstallPending;

    let suspected = false;
    // Android : le Keystore est détruit à la désinstallation → aucun reste possible.
    if (deps.os === 'ios') {
      // Les clés de DIAGNOSTIC sont écrites dès le démarrage (journal ~1,5 s après le
      // lancement), avant l'écran de déverrouillage : elles ne prouvent pas une ancienne installation.
      const others = (await deps.getAllKeys()).filter((k) => k !== INSTALL_MARKER_KEY && !BOOT_WRITTEN_KEY.test(k));
      // Une installation qui tournait déjà (mise à jour vers une version qui pose
      // le témoin) a des données AsyncStorage : ce n'est pas une réinstallation.
      suspected = others.length === 0 && (await deps.walletCount()) > 0;
    }
    const marker: Marker = { v: 1, at: deps.now(), reinstallPending: suspected };
    await deps.setItem(INSTALL_MARKER_KEY, JSON.stringify(marker));
    return suspected;
  } catch {
    return false;
  }
}

/**
 * Pose le témoin s'il manque, SANS conclure à une réinstallation : à appeler
 * quand l'app crée elle-même un portefeuille (premier lancement réel).
 */
export async function ensureInstallMarker(deps: InstallMarkerDeps = defaultDeps()): Promise<void> {
  try {
    if (await deps.getItem(INSTALL_MARKER_KEY)) return;
    const marker: Marker = { v: 1, at: deps.now(), reinstallPending: false };
    await deps.setItem(INSTALL_MARKER_KEY, JSON.stringify(marker));
  } catch {
    /* sans témoin : la prochaine détection le posera */
  }
}

/** L'utilisateur a tranché (futur écran) : la réinstallation n'est plus signalée. */
export async function acknowledgeReinstall(deps: InstallMarkerDeps = defaultDeps()): Promise<void> {
  try {
    const m = parse(await deps.getItem(INSTALL_MARKER_KEY));
    const marker: Marker = { v: 1, at: m?.at || deps.now(), reinstallPending: false };
    await deps.setItem(INSTALL_MARKER_KEY, JSON.stringify(marker));
  } catch {
    /* rien */
  }
}
