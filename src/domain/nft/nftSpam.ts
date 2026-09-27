/**
 * NFT d'ARNAQUE : reconnus à leur nom.
 *
 * Relevé sur un vrai compte Solana (`helius-das-live.json`) : sur 35 NFT, plus
 * de la moitié sont des publicités frappées gratuitement dans le portefeuille —
 * « Claim You BOME », « 🎁2.0 Jupiter AirDrop », « 4000$ W Drop 4000W.io »,
 * « RAYD.PROMO Limited Gift », « $ARMENI ». Ils mènent à un site qui vide le
 * portefeuille dès qu'on « réclame ». Deux ruses pour passer les filtres :
 *   - des ESPACES INVISIBLES dans les mots (« U​SD​C VO​UC​HER ») ;
 *   - des lettres d'un AUTRE alphabet (« Vоucher », avec un o cyrillique).
 *
 * Sur Solana, ces NFT sont presque tous « compressés » (quasi gratuits à
 * frapper par milliers) : les règles les plus larges ne s'appliquent qu'à eux,
 * pour ne pas écarter une vraie collection au nom malheureux.
 */
import { isScamName } from '../tx/spam';

const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/;
const LATIN = /[a-z]/i;
const OTHER_SCRIPT = /[Ͱ-ϿЀ-ӿ]/; // grec, cyrillique

/** Mot latin qui contient une lettre grecque ou cyrillique : sosie. */
function mixedScript(s: string): boolean {
  return s.split(/\s+/).some((w) => LATIN.test(w) && OTHER_SCRIPT.test(w));
}

const NFT_SCAM = /(\bdrop\b|drop\s?box|\bpromo\b|ticket|\bwin\b|winner|prize|\bmint\s?now|follow\s+@|\d+\s?%|^\s*\$[a-z]{2,})/i;

export interface NftSpamInput {
  name?: string;
  collection?: string;
  /** NFT compressé (Solana) : frappé pour presque rien, le spam de masse. */
  compressed?: boolean;
}

export function isSpamNft({ name = '', collection = '', compressed = false }: NftSpamInput): boolean {
  const texts = [name, collection].filter(Boolean);
  if (texts.some((s) => INVISIBLE.test(s) || mixedScript(s))) return true;
  const clean = texts.map((s) => s.replace(INVISIBLE, ''));
  if (clean.some((s) => isScamName(s))) return true;
  return compressed && clean.some((s) => NFT_SCAM.test(s));
}
