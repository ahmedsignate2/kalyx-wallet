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
import React from 'react';
import { Modal, type ModalProps } from 'react-native';
import { useLocked } from '../../lib/lockState';

export function SafeModal(props: ModalProps) {
  const locked = useLocked();
  return <Modal {...props} visible={!!props.visible && !locked} />;
}
