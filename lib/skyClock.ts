/**
 * L'HEURE DU CIEL — quand le paysage passe de l'aube au jour, au crépuscule, à
 * la nuit.
 *
 * Avant : des heures FIXES (crépuscule de 17 h à 21 h toute l'année). En
 * décembre il faisait nuit noire dehors avec un ciel de jour à l'écran, et en
 * juin l'inverse. Ici les bascules suivent le VRAI soleil du jour : durée du
 * jour selon la date (déclinaison solaire) et une latitude estimée d'après le
 * fuseau horaire de l'appareil (hémisphère sud, tropiques, ou latitudes
 * moyennes), midi solaire décalé de l'heure d'été. Aucune localisation
 * demandée : le fuseau suffit à quelques dizaines de minutes près.
 *
 * Et le ciel change EN DIRECT : un écran resté ouvert passe du jour au
 * crépuscule sans qu'on ait à le quitter (vérification à la minute, et au
 * retour de l'app au premier plan).
 */
/** Les quatre ciels du paysage (même union que `SkyPhase` dans ui/tokens). */
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

/** Fuseaux de l'hémisphère sud (préfixes) : saisons inversées. */
const SOUTH = ['Australia/', 'Antarctica/', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Noumea', 'America/Argentina', 'America/Santiago', 'America/Sao_Paulo', 'America/Montevideo', 'America/Asuncion', 'America/La_Paz', 'America/Lima', 'Africa/Johannesburg', 'Africa/Maputo', 'Africa/Harare', 'Africa/Windhoek', 'Africa/Gaborone', 'Indian/Reunion', 'Indian/Mauritius', 'Indian/Antananarivo'];
/** Fuseaux tropicaux (préfixes) : jours presque égaux toute l'année. */
const TROPICS = ['Africa/', 'Asia/Kolkata', 'Asia/Calcutta', 'Asia/Colombo', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Dubai', 'Asia/Riyadh', 'America/Bogota', 'America/Caracas', 'America/Mexico_City', 'America/Guatemala', 'America/Panama', 'America/Lima', 'America/La_Paz', 'America/Sao_Paulo', 'America/Martinique', 'America/Guadeloupe', 'America/Cayenne', 'Indian/', 'Pacific/Tahiti', 'Pacific/Noumea'];

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Latitude estimée (degrés, signée) d'après le fuseau : 46° N par défaut (Europe, Amérique du Nord). */
export function latitudeFor(tz: string): number {
  const south = SOUTH.some((p) => tz.startsWith(p));
  const tropical = TROPICS.some((p) => tz.startsWith(p)) && !tz.startsWith('Africa/Johannesburg') && !tz.startsWith('Africa/Algiers') && !tz.startsWith('Africa/Tunis') && !tz.startsWith('Africa/Casablanca') && !tz.startsWith('Africa/Cairo');
  const north = tz.startsWith('Africa/Algiers') || tz.startsWith('Africa/Tunis') || tz.startsWith('Africa/Casablanca') || tz.startsWith('Africa/Cairo') ? 33 : 46;
  const lat = tropical ? 12 : south ? 34 : north;
  return south ? -lat : lat;
}

/** Lever et coucher du soleil, en heures d'horloge locale (ex. 7,5 = 7 h 30). */
export function sunTimes(date: Date, lat = latitudeFor(timeZone())): { rise: number; set: number } {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const phi = (lat * Math.PI) / 180;
  const cosH = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)));
  const half = (Math.acos(cosH) * 180) / Math.PI / 15; // demi-journée, en heures
  // Heure d'été : l'horloge avance d'une heure, le midi solaire aussi.
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  const dst = date.getTimezoneOffset() < Math.max(jan, jul) ? 1 : 0;
  const noon = 12.4 + dst;
  return { rise: noon - half, set: noon + half };
}

/** La phase du ciel à cet instant : l'aube encadre le lever, le crépuscule le coucher. */
export function skyPhaseNow(date = new Date()): SkyPhase {
  const h = date.getHours() + date.getMinutes() / 60;
  const { rise, set } = sunTimes(date);
  if (h >= rise - 0.75 && h < rise + 1.25) return 'dawn';
  if (h >= rise + 1.25 && h < set - 1.25) return 'day';
  if (h >= set - 1.25 && h < set + 0.75) return 'dusk';
  return 'night';
}

