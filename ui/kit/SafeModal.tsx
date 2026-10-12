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
import { createContext, useContext, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { Modal, Platform, type ModalProps } from 'react-native';
import { useLocked } from '../../lib/lockState';
import { journal } from '../../lib/debugJournal';
import { modalDismissed, modalHasTurn, requestModal, subscribeModalGate, withdrawModal } from '../../lib/modalGate';

/** Vrai à l'intérieur d'une fenêtre : une fenêtre imbriquée n'attend pas son tour. */
const InsideModal = createContext(false);

/** `visible` absent = visible (défaut de React Native) ; seul `false` ferme. */
export function modalWanted(visible: boolean | undefined): boolean {
  return visible ?? true;
}

/** Affichée seulement si demandée ET app non verrouillée. */
export function modalShown(visible: boolean | undefined, locked: boolean): boolean {
  return modalWanted(visible) && !locked;
}

export function SafeModal(props: ModalProps & { journalName?: string; /** Fenêtre de l'écran de code lui-même (« Code oublié ? ») : affichée app verrouillée. */ showWhenLocked?: boolean }) {
  const locked = useLocked();
  const { journalName, showWhenLocked, ...modal } = props;
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
  /*
   * iOS : une fenêtre de PREMIER NIVEAU attend que la précédente ait fini de
   * se fermer (lib/modalGate.ts) — sinon UIKit ignore la présentation et
   * l'écran reste bloqué. Android empile les fenêtres sans souci.
   */
  const id = useId();
  const nested = useContext(InsideModal);
  const gated = Platform.OS === 'ios' && !nested;
  const shown = modalShown(modal.visible, locked && !showWhenLocked);
  useEffect(() => {
    if (!gated) return;
    if (shown) requestModal(id);
    else withdrawModal(id);
  }, [gated, shown, id]);
  useEffect(() => () => withdrawModal(id), [id]);
  const turn = useSyncExternalStore(subscribeModalGate, () => modalHasTurn(id));
  const { onDismiss, children } = modal;
  return (
    <Modal
      {...modal}
      visible={shown && (!gated || turn)}
      onDismiss={() => {
        modalDismissed(id);
        onDismiss?.();
      }}
    >
      <InsideModal.Provider value>{children}</InsideModal.Provider>
    </Modal>
  );
}
