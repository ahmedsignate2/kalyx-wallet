import type { LegalSection } from '../components/legal-page';

/** Texte juridique, en français (fait foi). */
export const sections: LegalSection[] = [
  {
    id: 'editeur',
    title: '1. Éditeur du site',
    body: `Le présent site kalyxwallet.com est édité par KALYX (Ahamed Signate), entrepreneur individuel.
SIREN : 130 046 865 — Code APE : 62.01Z.
Directeur de la publication : Ahamed Signate.
Contact : support@kalyxwallet.com.`,
  },
  {
    id: 'hebergement',
    title: '2. Hébergement',
    body: `Le site est hébergé par Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, États-Unis — téléphone : +1 (888) 993-5273.`,
  },
  {
    id: 'nature',
    title: '3. Nature du service',
    body: `Kalyx est un logiciel client non-custodial : l'application génère et stocke vos clés privées uniquement sur votre appareil, chiffrées de bout en bout. KALYX n'a accès à aucune clé, ne détient ni ne garde aucun fonds pour le compte d'autrui, et n'agit à aucun moment comme intermédiaire financier, dépositaire ou prestataire de services sur actifs numériques (PSAN). L'usage des crypto-actifs comporte des risques ; voir nos Conditions d'utilisation.`,
  },
  {
    id: 'propriete',
    title: '4. Propriété intellectuelle',
    body: `L'ensemble des éléments du site kalyxwallet.com (textes, structure, identité visuelle, marque « Kalyx ») est la propriété de KALYX, sauf mention contraire. Toute reproduction sans autorisation préalable est interdite.`,
  },
  {
    id: 'contact',
    title: '5. Contact',
    body: `Pour toute question relative à l'éditeur, à l'hébergement ou au contenu du site : support@kalyxwallet.com.`,
  },
];
