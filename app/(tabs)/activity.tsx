/**
 * Onglet Activité : le même écran que /history (filtres, jours, anti-spam),
 * rendu comme onglet de la barre — sans flèche de retour, avec la place de la
 * barre flottante sous la liste.
 */
import History from '../history';

export default function ActivityTab() {
  return <History inTab />;
}
