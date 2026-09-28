/**
 * Textes légaux : la source unique est `web/content` (le site). Ce module les
 * expose à l'app (écran Légal, documentation de l'assistant).
 *
 * Le FRANÇAIS fait foi (éditeur établi en France). L'anglais est servi à toutes
 * les autres langues : avant, un utilisateur coréen ou allemand lisait la
 * politique en français.
 *
 * Mise à jour du 27/09/2026 : la liste des services tiers (§4) était périmée —
 * elle omettait la source principale des prix (DefiLlama), les indexeurs
 * d'historique (Ankr), Solana (Helius), TON (TonAPI, TON Center, ponts TON
 * Connect), Bitcoin (mempool.space), la conversion d'images de NFT, et surtout
 * le relais TON de l'éditeur, par lequel passent l'adresse IP et les adresses
 * TON. Le dire est une obligation, pas une option.
 *
 * ⚠️ BROUILLONS à faire relire par un juriste avant une mise en production
 * réelle avec de vrais fonds.
 */
import { LEGAL_CONSTANTS } from '../src/constants/legal';
import { sections as PRIVACY_FR } from '../web/content/privacy';
import { sections as TERMS_FR } from '../web/content/terms';
import { sections as MENTIONS_FR } from '../web/content/mentions';
import { sections as PRIVACY_EN_SRC } from '../web/content/privacy.en';
import { sections as TERMS_EN_SRC } from '../web/content/terms.en';
import { sections as MENTIONS_EN_SRC } from '../web/content/mentions.en';

export const LEGAL_UPDATED = '27 septembre 2026';
export const LEGAL_UPDATED_EN = 'September 27, 2026';
export const LEGAL_PUBLISHER = LEGAL_CONSTANTS.COMPANY_NAME;
export const LEGAL_COUNTRY = 'France';
export const LEGAL_CONTACT = `${LEGAL_CONSTANTS.CONTACT_EMAIL} ou Telegram @kalyxntw (${LEGAL_CONSTANTS.TELEGRAM_URL})`;

export interface LegalSection {
  title: string;
  body: string;
}

/*
 * SOURCE UNIQUE : les textes du SITE (web/content). L'app en avait sa propre
 * copie, qui avait divergé (relais TonAPI, section LCEN absents de l'app). Le
 * site, l'écran Légal et la documentation de l'assistant lisent désormais les
 * mêmes fichiers ; les traductions anglaises sont à côté (`*.en.ts`).
 */
export const PRIVACY: LegalSection[] = PRIVACY_FR;
export const TERMS: LegalSection[] = TERMS_FR;
export const MENTIONS: LegalSection[] = MENTIONS_FR;
export const PRIVACY_EN: LegalSection[] = PRIVACY_EN_SRC;
export const TERMS_EN: LegalSection[] = TERMS_EN_SRC;
export const MENTIONS_EN: LegalSection[] = MENTIONS_EN_SRC;

/** Textes à montrer pour une langue : le français fait foi, l'anglais sert partout ailleurs. */
export function legalFor(lang: string): { privacy: LegalSection[]; terms: LegalSection[]; mentions: LegalSection[]; updated: string } {
  return lang === 'fr'
    ? { privacy: PRIVACY, terms: TERMS, mentions: MENTIONS, updated: LEGAL_UPDATED }
    : { privacy: PRIVACY_EN, terms: TERMS_EN, mentions: MENTIONS_EN, updated: LEGAL_UPDATED_EN };
}
