/**
 * Noms par défaut des wallets et des comptes.
 *
 * LE PROBLÈME. Ces noms étaient écrits en français EN DUR au moment de la
 * création — « Portefeuille principal », « Compte 2 », « Clé importée 1 » — puis
 * PERSISTÉS en stockage. Deux conséquences : un utilisateur anglophone voyait du
 * français dès l'installation, et changer de langue ensuite n'y changeait rien,
 * puisque le texte était déjà figé sur le disque.
 *
 * LA CORRECTION. On ne stocke plus de nom par défaut du tout : `label` vide
 * signifie « pas nommé par l'utilisateur ». Le nom affiché est alors calculé à
 * chaque rendu depuis la langue active. Un nom CHOISI par l'utilisateur, lui,
 * est stocké tel quel et n'est jamais traduit — c'est le sien.
 *
 * MIGRATION. Les installations existantes ont déjà les libellés français en
 * stockage. `isLegacyDefaultName` les reconnaît pour qu'ils soient traités comme
 * des noms par défaut, donc traduits. Un utilisateur qui aurait délibérément
 * nommé son wallet « Portefeuille 2 » le verra suivre la langue : c'est le
 * compromis assumé, et il est invisible puisque le texte est le même en français.
 */
import type { WalletMeta, StoredAccount } from './secureStore';

/**
 * Traducteur injecté plutôt qu'importé : ce module n'a ainsi aucune dépendance
 * vers `lib/i18n`, qui charge `react-native` et n'est donc pas chargeable dans
 * l'environnement de test. Les écrans passent simplement leur `useT()`.
 */
type T = (key: 'walletDefaultMain' | 'walletDefaultN' | 'walletDefaultKey' | 'accountDefaultMain' | 'accountDefaultN') => string;

/** Libellés générés par les versions précédentes, en français uniquement. */
const LEGACY = [
  /^Portefeuille principal$/,
  /^Portefeuille \d+$/,
  /^Portefeuille importé \d+$/,
  /^Clé importée \d+$/,
  /^Compte principal$/,
  /^Compte \d+$/,
  /^Compte importé$/,
];

export function isLegacyDefaultName(label: string): boolean {
  const l = label.trim();
  return LEGACY.some((re) => re.test(l));
}

/** Un libellé stocké est-il un nom choisi par l'utilisateur ? */
function isCustom(label: string | undefined): boolean {
  const l = (label ?? '').trim();
  return l.length > 0 && !isLegacyDefaultName(l);
}

/**
 * Nom affiché d'un wallet. `position` est son rang dans la liste (0-indexé) :
 * il ne sert qu'à numéroter les noms par défaut.
 */
export function walletDisplayName(w: WalletMeta, position: number, t: T): string {
  if (isCustom(w.label)) return w.label;
  if (position === 0) return t('walletDefaultMain');
  const key = w.type === 'privateKey' ? 'walletDefaultKey' : 'walletDefaultN';
  return t(key).replace('{n}', String(position + 1));
}

/** Nom affiché d'un compte. `index` est l'indice de dérivation HD. */
export function accountDisplayName(a: Pick<StoredAccount, 'index' | 'label'>, t: T): string {
  if (isCustom(a.label)) return a.label;
  if (a.index === 0) return t('accountDefaultMain');
  return t('accountDefaultN').replace('{n}', String(a.index + 1));
}
