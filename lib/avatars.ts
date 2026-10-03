/**
 * Avatars de portefeuille : un sticker tiré au hasard à la création, que
 * l'utilisateur peut changer ensuite.
 *
 * Deux styles, au choix de l'utilisateur :
 *  - `3d`   : stickers Fluent Emoji 3D (Microsoft, MIT — assets/avatars/),
 *             le style par défaut ;
 *  - `flat` : pictogrammes Phosphor sur fond de couleur, dans la ligne des
 *             icônes de l'app.
 *
 * Les stickers 3D sont une exception VOULUE aux règles de finition (pas d'emoji d'interface)
 * (« illustrations 3D : hors identité »), limitée aux avatars de profil :
 * décision produit du 2026-09-27.
 *
 * Ce module ne contient que des identifiants et des couleurs, pour rester
 * testable sans images : les images vivent dans ui/avatarArt.tsx.
 */

export type AvatarStyle = '3d' | 'flat';

/** Sticker 3D → couleur de fond (pastel, pour que le sujet ressorte). */
export const AVATARS_3D = {
  rocket: '#E0E4FF',
  gem_stone: '#D3ECFF',
  crescent_moon: '#243170',
  spouting_whale: '#CFE9FF',
  gorilla: '#DDD6EE',
  frog: '#D9F7C8',
  bear: '#F5DEC4',
  dog_face: '#F7E1C8',
  cat_face: '#FFE9B8',
  unicorn: '#F1DDFF',
  fox: '#FFE1CC',
  fire: '#FFE0CC',
  high_voltage: '#FFF4BF',
  money_bag: '#FCE8C2',
  crown: '#FFF0B8',
  money_mouth_face: '#D7F5D9',
  smiling_face_with_sunglasses: '#FFF0C2',
  robot: '#D8EEFF',
  alien_monster: '#E3D5FF',
  alien: '#C8F7C5',
  penguin: '#D8E6FF',
  owl: '#EFE0CF',
  octopus: '#FFD9E8',
  shark: '#D6ECF5',
  dragon: '#CFF3E0',
  panda: '#E4EBE6',
  lion: '#FCE3B8',
  tiger_face: '#FFE3C7',
  ringed_planet: '#E2D9FF',
  rainbow: '#DDEBFF',
  glowing_star: '#FFF3C2',
  ghost: '#E6E8F5',
  pizza: '#FFE4C4',
  doughnut: '#FFD6E7',
  hamster: '#FFE6D5',
  monkey_face: '#F3DDC9',
  butterfly: '#FFD6D1',
  four_leaf_clover: '#D4F5D0',
  koala: '#E3E7EE',
  rabbit_face: '#F4E1F0',
} as const;

/** Pictogramme plat → couleur de fond (saturée : le pictogramme est blanc). */
export const AVATARS_FLAT = {
  rocket: '#5B5BF0',
  diamond: '#2F8FE8',
  moon: '#3B3F9E',
  lightning: '#E0A106',
  fire: '#EF5A2A',
  crown: '#C98A0B',
  planet: '#7C4DE0',
  star: '#E8B20C',
  ghost: '#6B7280',
  robot: '#1F9DB8',
  alien: '#2EAF6A',
  cat: '#E07A2E',
  dog: '#A0673A',
  bird: '#1FA3D6',
  butterfly: '#D6488E',
  horse: '#8C5A3C',
  fish: '#2AA7C9',
  rabbit: '#C45FA8',
  cow: '#6D5BD0',
  paw: '#D9774A',
  cactus: '#3E9E4F',
  flower: '#E0558A',
  sun: '#F09A0B',
  snowflake: '#3AA0E0',
  atom: '#4C6FE8',
  infinity: '#8A4FE0',
  pizza: '#E2742B',
  game: '#5A4FD6',
  trophy: '#D19A0A',
  coins: '#C7920E',
} as const;

export type Avatar3dId = keyof typeof AVATARS_3D;
export type AvatarFlatId = keyof typeof AVATARS_FLAT;
/** Identifiant stocké : « 3d:rocket », « flat:diamond ». */
export type AvatarId = `3d:${Avatar3dId}` | `flat:${AvatarFlatId}`;

export const AVATAR_IDS_3D = Object.keys(AVATARS_3D).map((k) => `3d:${k}` as AvatarId);
export const AVATAR_IDS_FLAT = Object.keys(AVATARS_FLAT).map((k) => `flat:${k}` as AvatarId);

export interface ParsedAvatar {
  style: AvatarStyle;
  key: string;
  background: string;
}

/** Lit un identifiant stocké ; undefined s'il est inconnu (version plus récente, donnée abîmée). */
export function parseAvatar(id: string | undefined): ParsedAvatar | undefined {
  if (!id) return undefined;
  const [style, key] = id.split(':');
  if (style === '3d' && key in AVATARS_3D) return { style, key, background: AVATARS_3D[key as Avatar3dId] };
  if (style === 'flat' && key in AVATARS_FLAT) return { style, key, background: AVATARS_FLAT[key as AvatarFlatId] };
  return undefined;
}

/** Tirage au hasard, dans le style 3D (le style par défaut). */
export function randomAvatarId(random: () => number = Math.random): AvatarId {
  return AVATAR_IDS_3D[Math.floor(random() * AVATAR_IDS_3D.length) % AVATAR_IDS_3D.length];
}

/**
 * Avatar affiché pour un portefeuille : le sien, ou à défaut un sticker STABLE
 * tiré de son identifiant — jamais d'avatar qui change d'un rendu à l'autre
 * avant que la migration du démarrage l'ait enregistré.
 */
export function avatarForWallet(wallet: { id: string; avatar?: string }): ParsedAvatar {
  const own = parseAvatar(wallet.avatar);
  if (own) return own;
  let h = 2166136261;
  for (let i = 0; i < wallet.id.length; i++) h = Math.imul(h ^ wallet.id.charCodeAt(i), 16777619);
  return parseAvatar(AVATAR_IDS_3D[(h >>> 0) % AVATAR_IDS_3D.length])!;
}
