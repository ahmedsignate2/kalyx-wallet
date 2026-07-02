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

/** Testnet Ethereum — réseau de dev par défaut du MVP (zéro risque). */
export const SEPOLIA: ChainConfig = {
  id: 'sepolia',
  name: 'Sepolia (testnet)',
  family: 'evm',
  evmChainId: 11155111,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: ['https://rpc.sepolia.org', 'https://ethereum-sepolia-rpc.publicnode.com'],
  explorerUrl: 'https://sepolia.etherscan.io',
  testnet: true,
};

export const ALL_CHAINS: ChainConfig[] = [ETHEREUM, BNB, POLYGON, SEPOLIA];
