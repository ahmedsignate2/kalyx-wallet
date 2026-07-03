/**
 * Configuration des réseaux supportés.
 *
 * ETH, BNB Chain et Polygon partagent la même dérivation EVM (coin type 60) :
 * la MÊME adresse fonctionne sur les trois, seul le RPC/chainId change. C'est
 * pourquoi un seul `EvmChainAdapter` paramétré suffit pour tous les réseaux
 * EVM. Ajouter Base / Arbitrum / Avalanche = ajouter une entrée ici.
 *
 * Les RPC publics ci-dessous conviennent au dev. En prod, préférer un provider
 * dédié (Alchemy/Infura) via variable d'environnement — jamais de secret ici.
 */
import type { ChainConfig } from './types';

/**
 * API explorer unifiée Etherscan V2 : un seul endpoint pour toutes les chaînes
 * EVM (on passe `chainid`). La clé est optionnelle : sans clé, l'historique
 * dégrade proprement en liste vide (voir EvmChainAdapter.getHistory).
 * Renseigne ta clé ici (ou via EXPO_PUBLIC_ETHERSCAN_KEY) pour activer l'historique.
 */
export const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api';
export const EXPLORER_API_KEY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ETHERSCAN_KEY) || '';

export const ETHEREUM: ChainConfig = {
  id: 'ethereum',
  name: 'Ethereum',
  family: 'evm',
  evmChainId: 1,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: ['https://eth.llamarpc.com', 'https://cloudflare-eth.com'],
  explorerUrl: 'https://etherscan.io',
};

export const BNB: ChainConfig = {
  id: 'bnb',
  name: 'BNB Chain',
  family: 'evm',
  evmChainId: 56,
  nativeSymbol: 'BNB',
  nativeDecimals: 18,
  rpcUrls: ['https://bsc-dataseed.binance.org'],
  explorerUrl: 'https://bscscan.com',
};

export const POLYGON: ChainConfig = {
  id: 'polygon',
  name: 'Polygon',
  family: 'evm',
  evmChainId: 137,
  nativeSymbol: 'POL',
  nativeDecimals: 18,
  rpcUrls: ['https://polygon-rpc.com'],
  explorerUrl: 'https://polygonscan.com',
};

export const BASE: ChainConfig = {
  id: 'base',
  name: 'Base',
  family: 'evm',
  evmChainId: 8453,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
  explorerUrl: 'https://basescan.org',
};

/** Testnet Ethereum — réseau de dev par défaut du MVP (zéro risque). */
export const SEPOLIA: ChainConfig = {
  id: 'sepolia',
  name: 'Sepolia (testnet)',
  family: 'evm',
  evmChainId: 11155111,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  // Ordre = priorité du fallback. rpc.sepolia.org retiré (renvoyait 404).
  // Ces 3 endpoints publics répondent (chainId 0xaa36a7). En prod : Alchemy/Infura.
  rpcUrls: [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org',
    'https://1rpc.io/sepolia',
  ],
  explorerUrl: 'https://sepolia.etherscan.io',
  testnet: true,
};

// Ordre d'affichage dans le sélecteur : testnet en tête (réseau par défaut).
export const ALL_CHAINS: ChainConfig[] = [SEPOLIA, ETHEREUM, POLYGON, BNB, BASE];
