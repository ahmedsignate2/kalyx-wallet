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
// Expo inline `process.env.EXPO_PUBLIC_*` au build. Vide côté tests (Node) -> [].
export const EXPLORER_API_KEY: string = process.env.EXPO_PUBLIC_ETHERSCAN_KEY ?? '';

/**
 * Alchemy : RPC dédié (fiable) pour les chaînes EVM. Si la clé est présente,
 * on met l'endpoint Alchemy EN TÊTE des RPC (les publics restent en fallback).
 * Alchemy fait aussi soldes ERC-20, NFT et historique — utilisé plus tard.
 */
const ALCHEMY_KEY: string = process.env.EXPO_PUBLIC_ALCHEMY_KEY ?? '';
function withAlchemy(slug: string, fallbacks: string[]): string[] {
  return ALCHEMY_KEY ? [`https://${slug}.g.alchemy.com/v2/${ALCHEMY_KEY}`, ...fallbacks] : fallbacks;
}

export const ETHEREUM: ChainConfig = {
  id: 'ethereum',
  name: 'Ethereum',
  family: 'evm',
  evmChainId: 1,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  // eth.llamarpc.com retiré (down 521). Endpoints vérifiés répondant à eth_chainId=0x1.
  rpcUrls: withAlchemy('eth-mainnet', [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.drpc.org',
    'https://1rpc.io/eth',
    'https://cloudflare-eth.com',
  ]),
  explorerUrl: 'https://etherscan.io',
  coingeckoId: 'ethereum',
  coingeckoPlatform: 'ethereum',
};

export const BNB: ChainConfig = {
  id: 'bnb',
  name: 'BNB Chain',
  family: 'evm',
  evmChainId: 56,
  nativeSymbol: 'BNB',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('bnb-mainnet', [
    'https://bsc-rpc.publicnode.com',
    'https://bsc.drpc.org',
    'https://1rpc.io/bnb',
    'https://bsc-dataseed.binance.org',
  ]),
  explorerUrl: 'https://bscscan.com',
  coingeckoId: 'binancecoin',
  coingeckoPlatform: 'binance-smart-chain',
};

export const POLYGON: ChainConfig = {
  id: 'polygon',
  name: 'Polygon',
  family: 'evm',
  evmChainId: 137,
  nativeSymbol: 'POL',
  nativeDecimals: 18,
  // polygon-rpc.com retiré (clé désactivée). Endpoints vérifiés (chainId 0x89).
  rpcUrls: withAlchemy('polygon-mainnet', [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://1rpc.io/matic',
  ]),
  explorerUrl: 'https://polygonscan.com',
  coingeckoId: 'matic-network',
  coingeckoPlatform: 'polygon-pos',
};

export const BASE: ChainConfig = {
  id: 'base',
  name: 'Base',
  family: 'evm',
  evmChainId: 8453,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  // base.llamarpc.com retiré (down 521). Endpoints vérifiés (chainId 0x2105).
  rpcUrls: withAlchemy('base-mainnet', [
    'https://base-rpc.publicnode.com',
    'https://base.drpc.org',
    'https://mainnet.base.org',
  ]),
  explorerUrl: 'https://basescan.org',
  coingeckoId: 'ethereum',
  coingeckoPlatform: 'base',
};

export const ARBITRUM: ChainConfig = {
  id: 'arbitrum',
  name: 'Arbitrum',
  family: 'evm',
  evmChainId: 42161,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('arb-mainnet', [
    'https://arbitrum-one-rpc.publicnode.com',
    'https://arbitrum.drpc.org',
    'https://1rpc.io/arb',
    'https://arb1.arbitrum.io/rpc',
  ]),
  explorerUrl: 'https://arbiscan.io',
  coingeckoId: 'ethereum', // le natif est de l'ETH
  coingeckoPlatform: 'arbitrum-one',
};

export const OPTIMISM: ChainConfig = {
  id: 'optimism',
  name: 'Optimism',
  family: 'evm',
  evmChainId: 10,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('opt-mainnet', [
    'https://optimism-rpc.publicnode.com',
    'https://optimism.drpc.org',
    'https://1rpc.io/op',
    'https://mainnet.optimism.io',
  ]),
  explorerUrl: 'https://optimistic.etherscan.io',
  coingeckoId: 'ethereum', // le natif est de l'ETH
  coingeckoPlatform: 'optimistic-ethereum',
};

export const AVALANCHE: ChainConfig = {
  id: 'avalanche',
  name: 'Avalanche',
  family: 'evm',
  evmChainId: 43114,
  nativeSymbol: 'AVAX',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('avax-mainnet', [
    'https://avalanche-c-chain-rpc.publicnode.com',
    'https://avalanche.drpc.org',
    'https://1rpc.io/avax/c',
    'https://api.avax.network/ext/bc/C/rpc',
  ]),
  explorerUrl: 'https://snowtrace.io',
  coingeckoId: 'avalanche-2',
  coingeckoPlatform: 'avalanche',
};

export const LINEA: ChainConfig = {
  id: 'linea',
  name: 'Linea',
  family: 'evm',
  evmChainId: 59144,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('linea-mainnet', ['https://linea-rpc.publicnode.com', 'https://linea.drpc.org', 'https://rpc.linea.build']),
  explorerUrl: 'https://lineascan.build',
  coingeckoId: 'ethereum',
  coingeckoPlatform: 'linea',
};

export const SCROLL: ChainConfig = {
  id: 'scroll',
  name: 'Scroll',
  family: 'evm',
  evmChainId: 534352,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('scroll-mainnet', ['https://scroll-rpc.publicnode.com', 'https://scroll.drpc.org', 'https://rpc.scroll.io']),
  explorerUrl: 'https://scrollscan.com',
  coingeckoId: 'ethereum',
  coingeckoPlatform: 'scroll',
};

export const BLAST: ChainConfig = {
  id: 'blast',
  name: 'Blast',
  family: 'evm',
  evmChainId: 81457,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('blast-mainnet', ['https://blast-rpc.publicnode.com', 'https://blast.drpc.org', 'https://rpc.blast.io']),
  explorerUrl: 'https://blastscan.io',
  coingeckoId: 'ethereum',
  coingeckoPlatform: 'blast',
};

export const ZKSYNC: ChainConfig = {
  id: 'zksync',
  name: 'zkSync Era',
  family: 'evm',
  evmChainId: 324,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('zksync-mainnet', ['https://mainnet.era.zksync.io', 'https://zksync.drpc.org', 'https://1rpc.io/zksync2-era']),
  explorerUrl: 'https://explorer.zksync.io',
  coingeckoId: 'ethereum',
  coingeckoPlatform: 'zksync',
};

export const GNOSIS: ChainConfig = {
  id: 'gnosis',
  name: 'Gnosis',
  family: 'evm',
  evmChainId: 100,
  nativeSymbol: 'xDAI',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('gnosis-mainnet', ['https://gnosis-rpc.publicnode.com', 'https://gnosis.drpc.org', 'https://rpc.gnosischain.com']),
  explorerUrl: 'https://gnosisscan.io',
  coingeckoId: 'xdai',
  coingeckoPlatform: 'xdai',
};

export const MANTLE: ChainConfig = {
  id: 'mantle',
  name: 'Mantle',
  family: 'evm',
  evmChainId: 5000,
  nativeSymbol: 'MNT',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('mantle-mainnet', ['https://mantle-rpc.publicnode.com', 'https://mantle.drpc.org', 'https://rpc.mantle.xyz']),
  explorerUrl: 'https://mantlescan.xyz',
  coingeckoId: 'mantle',
  coingeckoPlatform: 'mantle',
};

export const CELO: ChainConfig = {
  id: 'celo',
  name: 'Celo',
  family: 'evm',
  evmChainId: 42220,
  nativeSymbol: 'CELO',
  nativeDecimals: 18,
  rpcUrls: withAlchemy('celo-mainnet', ['https://celo-rpc.publicnode.com', 'https://celo.drpc.org', 'https://forno.celo.org']),
  explorerUrl: 'https://celoscan.io',
  coingeckoId: 'celo',
  coingeckoPlatform: 'celo',
};

// --- Nouvelles chaînes EVM (RPC publics ; dégradation gracieuse si prix indispo) ---

export const BERACHAIN: ChainConfig = {
  id: 'berachain',
  name: 'Berachain',
  family: 'evm',
  evmChainId: 80094,
  nativeSymbol: 'BERA',
  nativeDecimals: 18,
  rpcUrls: ['https://rpc.berachain.com', 'https://berachain-rpc.publicnode.com'],
  explorerUrl: 'https://berascan.com',
  coingeckoId: 'berachain-bera',
  coingeckoPlatform: 'berachain',
};

export const HYPEREVM: ChainConfig = {
  id: 'hyperevm',
  name: 'Hyperliquid',
  family: 'evm',
  evmChainId: 999,
  nativeSymbol: 'HYPE',
  nativeDecimals: 18,
  rpcUrls: ['https://rpc.hyperliquid.xyz/evm'],
  explorerUrl: 'https://hyperevmscan.io',
  coingeckoId: 'hyperliquid',
};

export const MONAD_TESTNET: ChainConfig = {
  id: 'monad-testnet',
  name: 'Monad Testnet',
  family: 'evm',
  evmChainId: 10143,
  nativeSymbol: 'MON',
  nativeDecimals: 18,
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  explorerUrl: 'https://testnet.monadexplorer.com',
  testnet: true,
};

// --- Lot supplémentaire de chaînes EVM (RPC publics) ---
export const SONIC: ChainConfig = {
  id: 'sonic', name: 'Sonic', family: 'evm', evmChainId: 146, nativeSymbol: 'S', nativeDecimals: 18,
  rpcUrls: ['https://rpc.soniclabs.com'], explorerUrl: 'https://sonicscan.org', coingeckoId: 'sonic-3',
};
export const CRONOS: ChainConfig = {
  id: 'cronos', name: 'Cronos', family: 'evm', evmChainId: 25, nativeSymbol: 'CRO', nativeDecimals: 18,
  rpcUrls: ['https://evm.cronos.org', 'https://cronos-evm-rpc.publicnode.com'], explorerUrl: 'https://cronoscan.com', coingeckoId: 'crypto-com-chain',
};
export const MOONBEAM: ChainConfig = {
  id: 'moonbeam', name: 'Moonbeam', family: 'evm', evmChainId: 1284, nativeSymbol: 'GLMR', nativeDecimals: 18,
  rpcUrls: ['https://rpc.api.moonbeam.network', 'https://moonbeam-rpc.publicnode.com'], explorerUrl: 'https://moonscan.io', coingeckoId: 'moonbeam',
};
export const METIS: ChainConfig = {
  id: 'metis', name: 'Metis', family: 'evm', evmChainId: 1088, nativeSymbol: 'METIS', nativeDecimals: 18,
  rpcUrls: ['https://andromeda.metis.io/?owner=1088', 'https://metis-rpc.publicnode.com'], explorerUrl: 'https://explorer.metis.io', coingeckoId: 'metis-token',
};
export const POLYGON_ZKEVM: ChainConfig = {
  id: 'polygon-zkevm', name: 'Polygon zkEVM', family: 'evm', evmChainId: 1101, nativeSymbol: 'ETH', nativeDecimals: 18,
  rpcUrls: ['https://zkevm-rpc.com', 'https://polygon-zkevm.drpc.org'], explorerUrl: 'https://zkevm.polygonscan.com', coingeckoId: 'ethereum',
};
export const MODE: ChainConfig = {
  id: 'mode', name: 'Mode', family: 'evm', evmChainId: 34443, nativeSymbol: 'ETH', nativeDecimals: 18,
  rpcUrls: ['https://mainnet.mode.network', 'https://mode.drpc.org'], explorerUrl: 'https://explorer.mode.network', coingeckoId: 'ethereum',
};
export const MANTA: ChainConfig = {
  id: 'manta', name: 'Manta Pacific', family: 'evm', evmChainId: 169, nativeSymbol: 'ETH', nativeDecimals: 18,
  rpcUrls: ['https://pacific-rpc.manta.network/http'], explorerUrl: 'https://pacific-explorer.manta.network', coingeckoId: 'ethereum',
};
export const OPBNB: ChainConfig = {
  id: 'opbnb', name: 'opBNB', family: 'evm', evmChainId: 204, nativeSymbol: 'BNB', nativeDecimals: 18,
  rpcUrls: ['https://opbnb-mainnet-rpc.bnbchain.org', 'https://opbnb-rpc.publicnode.com'], explorerUrl: 'https://opbnbscan.com', coingeckoId: 'binancecoin',
};
export const TAIKO: ChainConfig = {
  id: 'taiko', name: 'Taiko', family: 'evm', evmChainId: 167000, nativeSymbol: 'ETH', nativeDecimals: 18,
  rpcUrls: ['https://rpc.mainnet.taiko.xyz', 'https://taiko.drpc.org'], explorerUrl: 'https://taikoscan.io', coingeckoId: 'ethereum',
};
export const UNICHAIN: ChainConfig = {
  id: 'unichain', name: 'Unichain', family: 'evm', evmChainId: 130, nativeSymbol: 'ETH', nativeDecimals: 18,
  rpcUrls: ['https://mainnet.unichain.org', 'https://unichain.drpc.org'], explorerUrl: 'https://uniscan.xyz', coingeckoId: 'ethereum',
};
export const WORLDCHAIN: ChainConfig = {
  id: 'worldchain', name: 'World Chain', family: 'evm', evmChainId: 480, nativeSymbol: 'ETH', nativeDecimals: 18,
  rpcUrls: ['https://worldchain-mainnet.gateway.tenderly.co', 'https://worldchain.drpc.org'], explorerUrl: 'https://worldscan.org', coingeckoId: 'ethereum',
};
export const SEI: ChainConfig = {
  id: 'sei', name: 'Sei', family: 'evm', evmChainId: 1329, nativeSymbol: 'SEI', nativeDecimals: 18,
  rpcUrls: ['https://evm-rpc.sei-apis.com', 'https://sei-evm-rpc.publicnode.com'], explorerUrl: 'https://seitrace.com', coingeckoId: 'sei-network',
};
export const FLARE: ChainConfig = {
  id: 'flare', name: 'Flare', family: 'evm', evmChainId: 14, nativeSymbol: 'FLR', nativeDecimals: 18,
  rpcUrls: ['https://flare-api.flare.network/ext/C/rpc', 'https://flare-rpc.publicnode.com'], explorerUrl: 'https://flarescan.com', coingeckoId: 'flare-networks',
};
export const KAVA: ChainConfig = {
  id: 'kava', name: 'Kava', family: 'evm', evmChainId: 2222, nativeSymbol: 'KAVA', nativeDecimals: 18,
  rpcUrls: ['https://evm.kava.io', 'https://kava-evm-rpc.publicnode.com'], explorerUrl: 'https://kavascan.com', coingeckoId: 'kava',
};
export const AURORA: ChainConfig = {
  id: 'aurora', name: 'Aurora', family: 'evm', evmChainId: 1313161554, nativeSymbol: 'ETH', nativeDecimals: 18,
  rpcUrls: ['https://mainnet.aurora.dev'], explorerUrl: 'https://explorer.aurora.dev', coingeckoId: 'ethereum',
};

/** Testnet Ethereum — réseau de dev par défaut du MVP (zéro risque). */
export const SEPOLIA: ChainConfig = {
  id: 'sepolia',
  name: 'Sepolia',
  family: 'evm',
  evmChainId: 11155111,
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  // Ordre = priorité du fallback. rpc.sepolia.org retiré (renvoyait 404).
  // Ces 3 endpoints publics répondent (chainId 0xaa36a7). En prod : Alchemy/Infura.
  rpcUrls: withAlchemy('eth-sepolia', [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org',
    'https://1rpc.io/sepolia',
  ]),
  explorerUrl: 'https://sepolia.etherscan.io',
  testnet: true,
};

/** Bitcoin mainnet (SegWit natif). Réception uniquement pour l'instant. */
export const BITCOIN: ChainConfig = {
  id: 'bitcoin',
  name: 'Bitcoin',
  family: 'bitcoin',
  nativeSymbol: 'BTC',
  nativeDecimals: 8,
  // APIs REST (pas du JSON-RPC) : mempool.space puis blockstream en fallback.
  rpcUrls: ['https://mempool.space/api', 'https://blockstream.info/api'],
  explorerUrl: 'https://mempool.space',
  coingeckoId: 'bitcoin',
};

export const SOLANA: ChainConfig = {
  id: 'solana',
  name: 'Solana',
  family: 'solana',
  nativeSymbol: 'SOL',
  nativeDecimals: 9, // 1 SOL = 1e9 lamports
  // JSON-RPC mainnet-beta : endpoint public officiel (limité), repli Ankr public.
  rpcUrls: ['https://api.mainnet-beta.solana.com', 'https://rpc.ankr.com/solana'],
  explorerUrl: 'https://solscan.io',
  coingeckoId: 'solana',
  coingeckoPlatform: 'solana', // prix des tokens SPL par mint
};

// Ordre d'affichage dans le sélecteur : testnet en tête (réseau par défaut).
export const ALL_CHAINS: ChainConfig[] = [
  SEPOLIA,
  ETHEREUM,
  POLYGON,
  BNB,
  BASE,
  ARBITRUM,
  OPTIMISM,
  AVALANCHE,
  LINEA,
  SCROLL,
  BLAST,
  ZKSYNC,
  GNOSIS,
  MANTLE,
  CELO,
  BERACHAIN,
  HYPEREVM,
  SONIC,
  CRONOS,
  MOONBEAM,
  METIS,
  POLYGON_ZKEVM,
  MODE,
  MANTA,
  OPBNB,
  TAIKO,
  UNICHAIN,
  WORLDCHAIN,
  SEI,
  FLARE,
  KAVA,
  AURORA,
  MONAD_TESTNET,
  BITCOIN,
  SOLANA,
];
