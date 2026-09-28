/**
 * Modale native qui DISPARAÎT quand l'app se verrouille.
 *
 * Une `Modal` React Native s'affiche dans sa propre fenêtre, au-dessus de tout
 * — y compris de l'écran de code. Les écrans restent montés sous l'écran de
 * déverrouillage (onglets, envoi en cours) : une feuille ouverte au moment du
 * verrouillage automatique (demande de signature, récapitulatif d'envoi,
 * détail d'un NFT…) restait donc affichée par-dessus, avec ses données. Toutes
 * les modales de l'app passent par ici ; elles réapparaissent au déverrouillage.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, type ModalProps } from 'react-native';
import { useLocked } from '../../lib/lockState';
import { journal } from '../../lib/debugJournal';

/** `visible` absent = visible (défaut de React Native) ; seul `false` ferme. */
export function modalWanted(visible: boolean | undefined): boolean {
  return visible ?? true;
}

/** Affichée seulement si demandée ET app non verrouillée. */
export function modalShown(visible: boolean | undefined, locked: boolean): boolean {
  return modalWanted(visible) && !locked;
}

export function SafeModal(props: ModalProps & { journalName?: string }) {
  const locked = useLocked();
  const { journalName, ...modal } = props;
  /*
   * `visible` ABSENT = visible, comme la `Modal` de React Native. Plusieurs
   * fenêtres (confirmation par PIN, demande de PIN, succès, détail NFT…) sont
   * montées conditionnellement par leur parent et n'ont jamais passé `visible`.
   * Le lire comme `false` les rendait invisibles à jamais : plus aucune
   * confirmation par PIN, donc WalletConnect, TON Pay, réinitialisation et
   * activation de la biométrie bloqués (28/09).
   */
  const wanted = modalWanted(modal.visible);
  // Journal : ouverture / fermeture, et SURTOUT une fenêtre demandée mais masquée par le verrouillage.
  const was = useRef(false);
  useEffect(() => {
    if (!wanted && !was.current) return; // jamais demandée : rien à dire
    was.current = wanted;
    journal('state', `fenêtre${journalName ? ` « ${journalName} »` : ''} : ${wanted ? (locked ? 'MASQUÉE (app verrouillée)' : 'affichée') : 'fermée'}`);
  }, [wanted, locked, journalName]);
  return <Modal {...modal} visible={modalShown(modal.visible, locked)} />;
}
