/**
 * Section d'un texte juridique. Type SANS dépendance : ces textes sont la
 * source unique, lue par le site (pages légales) ET par l'app (écran légal,
 * documentation de l'assistant) — qui ne doit rien tirer de Next.js.
 */
export interface LegalSection {
  id: string;
  title: string;
  body: string;
}
