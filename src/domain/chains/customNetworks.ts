/**
 * Réseaux personnalisés : identité, validation et sauvegarde portable.
 *
 * Un réseau perso (RPC + symbole + explorateur) n'est PAS dérivable de la seed :
 * après une réinstallation, il faut le ressaisir. Ce module sérialise les
 * réseaux dans une enveloppe versionnée que l'utilisateur peut sauvegarder
 * (partage/fichier) puis réimporter — les fonds étaient toujours on-chain, il
 * suffit de redonner le RPC à Kalyx pour les revoir.
 *
 * DEUX LIMITES LEVÉES ICI :
 *
 * 1. `family` était écrit `'evm'` EN DUR. On pouvait donc ajouter n'importe
 *    quelle chaîne EVM, mais pas un réseau Bitcoin ni Solana — et donc pas son
 *    propre RPC Solana, alors que l'endpoint public est justement le goulot
 *    d'étranglement de cette chaîne. Le registre, lui, savait déjà fabriquer les
 *    trois adapters : seule cette ligne bloquait.
 * 2. `nativeDecimals` était figé à 18 et le formulaire ne le demandait pas. Une
 *    chaîne dont la pièce native n'a pas 18 décimales affichait ET envoyait des
 *    montants faux — d'un facteur 10^12 pour une pièce à 6 décimales.
 *
 * Au passage, `testnet` n'était pas conservé : un réseau marqué « test » perdait
 * ce drapeau à la sauvegarde, et réapparaissait parmi les réseaux principaux.
 *
 * Données NON sensibles (URLs publiques, pas de clé) : pas de chiffrement requis.
 */
import type { ChainConfig, ChainFamily } from './types';

export const NETWORKS_BACKUP_VERSION = 1;

interface NetworksBackup {
  v: number;
  app: 'kalyx' | 'nova';
  kind: 'networks';
  chains: ChainConfig[];
}

/**
 * Familles qu'un utilisateur peut ajouter lui-même.
 *
 * `bitcoin` en est ABSENT, volontairement. Le seul intérêt d'un réseau Bitcoin
 * personnalisé serait un testnet ou son propre nœud ; or `checkBtcAddress`
 * refuse les adresses testnet — un choix délibéré, pour qu'on ne puisse pas
 * envoyer des fonds réels vers une adresse de test. Proposer la famille
 * amènerait donc l'utilisateur dans une impasse : un réseau qu'il peut créer et
 * sélectionner, mais où aucune adresse n'est acceptée. Un testnet Bitcoin à
 * moitié géré vaut moins que pas de testnet du tout.
 *
 * Pour l'ouvrir un jour, il faudra : préfixe `tb1` en bech32, versions base58
 * 0x6F et 0xC4, et le tout conditionné à `config.testnet` — sans jamais
 * accepter une adresse testnet sur un réseau principal.
 */
export const CUSTOM_FAMILIES: ChainFamily[] = ['evm', 'solana'];

/**
 * Familles lisibles depuis une sauvegarde, plus large que celles qu'on propose.
 *
 * Un réseau `bitcoin` déjà enregistré avant ce resserrage doit continuer à se
 * charger : le supprimer en silence ferait disparaître une entrée que
 * l'utilisateur a créée, sans explication.
 */
const READABLE_FAMILIES: ChainFamily[] = ['evm', 'bitcoin', 'solana'];

/** Décimales par défaut d'une famille, quand l'utilisateur ne précise pas. */
export const DEFAULT_DECIMALS: Record<ChainFamily, number> = {
  evm: 18,
  bitcoin: 8,
  solana: 9,
};

/** Fragment d'identifiant stable et lisible dérivé d'un nom libre. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'reseau'
  );
}

/**
 * Identifiant d'un réseau personnalisé.
 *
 * Les réseaux EVM gardent `custom-<chainId>` : c'est l'identité naturelle d'une
 * chaîne EVM, et ça préserve les sauvegardes déjà créées. Hors EVM il n'y a pas
 * de chainId, donc le nom sert d'identité — deux RPC Solana de l'utilisateur
 * sont deux entrées distinctes, ce qui est exactement l'intention.
 */
export function customChainId(family: ChainFamily, evmChainId: number | undefined, name: string): string {
  return family === 'evm' ? `custom-${evmChainId}` : `custom-${family}-${slug(name)}`;
}

/** Reconstruit une ChainConfig propre à partir d'une entrée non fiable. */
function sanitize(raw: unknown): ChainConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;

  // Famille : par défaut `evm`, pour lire les sauvegardes d'avant ce changement.
  const family = (typeof c.family === 'string' && (READABLE_FAMILIES as string[]).includes(c.family)
    ? c.family
    : 'evm') as ChainFamily;

  const name = typeof c.name === 'string' ? c.name.trim() : '';
  const nativeSymbol = typeof c.nativeSymbol === 'string' ? c.nativeSymbol.trim().toUpperCase() : '';
  const rpcUrls = Array.isArray(c.rpcUrls) ? c.rpcUrls.filter((u): u is string => typeof u === 'string') : [];
  const explorerUrl = typeof c.explorerUrl === 'string' && c.explorerUrl.trim() ? c.explorerUrl.trim() : undefined;

  if (!name || !nativeSymbol) return null;

  // Le chainId n'est requis — et n'a de sens — que pour l'EVM.
  let evmChainId: number | undefined;
  if (family === 'evm') {
    const n = typeof c.evmChainId === 'number' ? c.evmChainId : Number(c.evmChainId);
    if (!Number.isInteger(n) || n <= 0) return null;
    evmChainId = n;
  }

  /*
   * Décimales : bornées à [0, 36]. Une valeur hors de cette plage n'est pas une
   * configuration, c'est une saisie fautive ou un fichier corrompu, et elle
   * fausserait tous les montants de la chaîne.
   *
   * On n'appelle `Number()` que sur ce qui peut raisonnablement porter un
   * nombre. `Number(null)`, `Number('')` et `Number([])` valent tous ZÉRO — un
   * entier parfaitement dans la plage. Un champ absent devenait donc « 0
   * décimale », et 0 est une valeur LÉGITIME, donc rien ne le rattrapait
   * ensuite : toute la chaîne affichait et envoyait des montants faux.
   */
  const rawDec =
    typeof c.nativeDecimals === 'number'
      ? c.nativeDecimals
      : typeof c.nativeDecimals === 'string' && c.nativeDecimals.trim() !== ''
        ? Number(c.nativeDecimals)
        : NaN;
  const nativeDecimals =
    Number.isInteger(rawDec) && rawDec >= 0 && rawDec <= 36 ? rawDec : DEFAULT_DECIMALS[family];

  // https uniquement : un RPC en clair expose adresses et soldes en chemin.
  const rpc = rpcUrls.map((u) => u.trim()).filter((u) => /^https:\/\//i.test(u));
  if (rpc.length === 0) return null;

  return {
    id: customChainId(family, evmChainId, name),
    name,
    family,
    ...(evmChainId !== undefined ? { evmChainId } : {}),
    nativeSymbol,
    nativeDecimals,
    rpcUrls: rpc,
    explorerUrl,
    // Conservé : sans lui, un réseau de test remontait parmi les réseaux réels.
    testnet: c.testnet === true,
  };
}

/** Sérialise les réseaux perso en JSON (enveloppe versionnée). */
export function serializeNetworks(chains: ChainConfig[]): string {
  const backup: NetworksBackup = { v: NETWORKS_BACKUP_VERSION, app: 'kalyx', kind: 'networks', chains };
  return JSON.stringify(backup, null, 2);
}

/**
 * Parse et valide une sauvegarde. Renvoie les réseaux valides (dédupliqués par
 * identifiant) ; `error` renseigné si le format est inutilisable. Tolérant :
 * ignore silencieusement les entrées mal formées et ne garde que les réseaux
 * sains, quelle que soit leur famille.
 */
export function parseNetworksBackup(text: string): { chains: ChainConfig[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { chains: [], error: 'Fichier illisible (JSON invalide).' };
  }
  // Accepte l'enveloppe {kind:'networks', chains} OU un simple tableau de réseaux.
  const rawChains = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as NetworksBackup).chains)
      ? (parsed as NetworksBackup).chains
      : null;
  if (!rawChains) return { chains: [], error: 'Sauvegarde de réseaux non reconnue.' };

  const seen = new Set<string>();
  const chains: ChainConfig[] = [];
  for (const raw of rawChains) {
    const c = sanitize(raw);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    chains.push(c);
  }
  if (chains.length === 0) return { chains: [], error: 'Aucun réseau valide dans la sauvegarde.' };
  return { chains };
}
