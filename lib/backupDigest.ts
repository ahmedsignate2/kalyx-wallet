/**
 * EMPREINTE DE CE QUE CONTIENT UNE SAUVEGARDE CHIFFRÉE — sans le contenu.
 *
 * L'état « sauvegardé » n'était qu'une date : créer, importer ou supprimer un
 * portefeuille ensuite laissait le centre de sécurité, l'accueil et le Copilot
 * affirmer que tout était à l'abri, alors que le nouveau portefeuille n'était
 * dans AUCUNE sauvegarde. C'est la pire promesse : celle qu'on ne vérifie
 * qu'après avoir perdu le téléphone.
 *
 * On retient donc, au moment de la sauvegarde, une empreinte de ce qu'elle
 * contient, et on la compare à l'empreinte courante. Elle reprend EXACTEMENT ce
 * que `exportAllWallets` met dans le fichier (voir walletStore) :
 *  - chaque portefeuille à secret (`type !== 'watch'` : une adresse suivie n'a
 *    pas de coffre, elle n'est pas sauvegardée) ;
 *  - son type et, pour une clé importée, sa famille ;
 *  - son NOM : il part dans le fichier, donc un renommage rend la sauvegarde
 *    périmée (restaurée, elle rendrait l'ancien nom) ;
 *  - ses comptes : numéro ET nom, tous deux exportés.
 * L'identifiant interne n'est pas dans le fichier, mais il distingue deux
 * portefeuilles : sans lui, supprimer un portefeuille puis en importer un autre
 * de même nom et même type donnerait la même empreinte — une sauvegarde
 * périmée annoncée à jour. L'avatar, lui, n'est pas sauvegardé : ignoré.
 *
 * JAMAIS de secret ni d'adresse ici : les comptes sont réduits à leur numéro et
 * leur nom avant tout calcul, quel que soit l'objet reçu.
 *
 * Module PUR (aucun stockage, aucun store) : testable seul, et appelable aussi
 * bien depuis l'export que depuis l'interface.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

/** Ce qu'il faut d'un portefeuille (sous-ensemble de `WalletMeta`). */
export interface DigestWallet {
  id: string;
  label?: string;
  type?: 'seed' | 'privateKey' | 'tonPhrase' | 'watch';
  keyFamily?: string;
}

/** Ce qu'il faut d'un compte (sous-ensemble de `StoredAccount` — les adresses sont ignorées). */
export interface DigestAccount {
  index: number;
  label?: string;
}

/** Préfixe de version : changer ce qui entre dans l'empreinte ⇒ changer le préfixe. */
const VERSION = 'kbd1';

/**
 * Empreinte (sha256, hexadécimal) des portefeuilles sauvegardables.
 *
 * Indépendante de l'ORDRE (portefeuilles triés par identifiant, comptes par
 * numéro) : la sauvegarde ne dépend pas de l'ordre d'affichage, l'empreinte non
 * plus. `accountsByWallet` absent : les comptes ne comptent pas ; présent, un
 * portefeuille qui n'y figure pas compte comme sans compte.
 */
export function backupDigest(
  wallets: readonly DigestWallet[],
  accountsByWallet?: Readonly<Record<string, readonly DigestAccount[] | null | undefined>>,
): string {
  const rows = wallets
    .filter((w) => w.type !== 'watch')
    .map((w) => {
      const type = w.type ?? 'seed'; // absent = phrase BIP-39 (rétro-compatibilité de WalletMeta)
      const row: unknown[] = [w.id, type, type === 'privateKey' ? w.keyFamily ?? 'evm' : '', w.label ?? ''];
      if (accountsByWallet) {
        row.push(
          [...(accountsByWallet[w.id] ?? [])]
            .map((a) => [a.index, a.label ?? ''] as const)
            .sort((a, b) => a[0] - b[0]),
        );
      }
      return row;
    })
    .sort((a, b) => ((a[0] as string) < (b[0] as string) ? -1 : (a[0] as string) > (b[0] as string) ? 1 : 0));
  return bytesToHex(sha256(utf8ToBytes(`${VERSION}:${JSON.stringify(rows)}`)));
}

/**
 * La sauvegarde chiffrée connue est-elle PÉRIMÉE ?
 *
 *  - pas de sauvegarde : rien de périmé (c'est « à faire », pas « à refaire ») ;
 *  - empreinte courante inconnue (`null` : pas encore calculée, ou session
 *    leurre) : on ne conclut rien, plutôt que de faire clignoter l'alerte ;
 *  - sauvegarde SANS empreinte : faite avant cette version, ou constatée sur
 *    Drive sans qu'on sache ce qu'elle contient. On ne peut pas savoir ce
 *    qu'elle couvre : « à refaire », une fois — c'est le choix sûr. Un faux
 *    « à jour » coûte des fonds, un faux « à refaire » coûte une minute ;
 *  - sinon : périmée dès que les empreintes diffèrent.
 */
export function isBackupStale(
  saved: { encryptedBackupAt: string | null; backupDigest: string | null },
  current: string | null,
): boolean {
  if (!saved.encryptedBackupAt) return false;
  if (current === null) return false;
  if (saved.backupDigest === null) return true;
  return saved.backupDigest !== current;
}

/** Un portefeuille tel qu'une SAUVEGARDE le décrit (sous-ensemble de `BackupWallet`, sans le secret). */
export interface ShapeWallet {
  label?: string;
  type?: 'seed' | 'privateKey' | 'tonPhrase' | 'watch';
  keyFamily?: string;
  accounts?: readonly DigestAccount[] | null;
}

/**
 * FORME d'un ensemble de portefeuilles : l'empreinte SANS les identifiants.
 *
 * Sert à une seule question : « l'état local est-il exactement ce que la
 * sauvegarde restaurée contenait ? ». Les identifiants internes ne sont pas dans
 * le fichier (ils sont recréés à la restauration) ; on compare donc le reste —
 * type, famille, nom, comptes. Une phrase TON se compare comme une phrase : la
 * sauvegarde l'écrit `seed` et la restauration la reclasse.
 *
 * Indépendante de l'ordre (lignes triées). Un portefeuille sans comptes connus
 * compte comme son compte n°1 sans nom : c'est ce que la restauration recrée
 * d'une sauvegarde qui ne listait pas ses comptes.
 */
export function backupShape(wallets: readonly ShapeWallet[]): string {
  const rows = wallets
    .filter((w) => w.type !== 'watch')
    .map((w) => {
      const type = w.type === 'privateKey' ? 'privateKey' : 'seed';
      const accounts = w.accounts?.length ? w.accounts : [{ index: 0, label: '' }];
      return JSON.stringify([
        type,
        type === 'privateKey' ? w.keyFamily ?? 'evm' : '',
        (w.label ?? '').trim(),
        [...accounts].map((a) => [a.index, a.label ?? '']).sort((a, b) => (a[0] as number) - (b[0] as number)),
      ]);
    })
    .sort();
  return bytesToHex(sha256(utf8ToBytes(`${VERSION}-shape:${JSON.stringify(rows)}`)));
}
