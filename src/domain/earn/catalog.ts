/**
 * Catalogue Earn — la SEULE source de vérité des protocoles supportés.
 *
 * Chaque entrée a été vérifiée on-chain (symbol() du token de reçu, simulation
 * eth_call des appels directs, routes LI.FI, pools DefiLlama) le 2026-09-11.
 * Ajouter un protocole = ajouter une entrée ici, rien d'autre.
 *
 * Adresses en minuscules côté EVM (comparaisons insensibles à la casse).
 */
import type { EarnProtocol, EarnToken } from './types';

/** Marqueur « monnaie native » (ETH, AVAX, SOL…), commun EVM/Solana. */
export const NATIVE = 'native';

/** Logo protocole (DefiLlama, webp) converti en PNG via wsrv.nl — même proxy que chainIconUrl. */
const ICON = (slug: string) =>
  `https://wsrv.nl/?url=${encodeURIComponent(`icons.llamao.fi/icons/protocols/${slug}?w=96&h=96`)}&output=png&w=96&h=96&fit=cover`;

// ─── Sous-jacents ──────────────────────────────────────────────────────
const ETH: EarnToken = { address: NATIVE, symbol: 'ETH', decimals: 18, coingeckoId: 'ethereum' };
const AVAX: EarnToken = { address: NATIVE, symbol: 'AVAX', decimals: 18, coingeckoId: 'avalanche-2' };
const SOL: EarnToken = { address: NATIVE, symbol: 'SOL', decimals: 9, coingeckoId: 'solana' };
const usdc = (address: string): EarnToken => ({ address, symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin' });
const usdt = (address: string, decimals = 6): EarnToken => ({ address, symbol: 'USDT', decimals, coingeckoId: 'tether' });

// ─── Aave v3 : Pool par chaîne (vérifiés via getReserveData) ──────────
export const AAVE_V3_POOL: Record<string, string> = {
  ethereum: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
  arbitrum: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
  optimism: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
  polygon: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
  avalanche: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
  base: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',
  bnb: '0x6807dc923806fe8fd134338eabca509979a7e0cb',
};

function aave(
  chainId: string,
  underlying: EarnToken,
  aToken: string,
  llamaPool: string,
): EarnProtocol {
  const chainLabel = chainId.charAt(0).toUpperCase() + chainId.slice(1);
  return {
    id: `aave-v3-${chainId}-${underlying.symbol.toLowerCase()}`,
    kind: 'lending',
    name: 'Aave v3',
    chainId,
    underlying,
    receipt: {
      address: aToken,
      symbol: `a${underlying.symbol}`,
      decimals: underlying.decimals,
      coingeckoId: underlying.coingeckoId,
    },
    deposit: { via: 'contract' },
    withdraw: { via: 'contract' },
    apy: { source: 'aave-v3', pool: llamaPool },
    logo: ICON('aave-v3'),
    url: `https://app.aave.com/?marketName=proto_${chainId === 'ethereum' ? 'mainnet' : chainId}_v3`,
    contract: AAVE_V3_POOL[chainId],
    withdrawNote: `Retrait instantané sur ${chainLabel}, sans période de blocage.`,
  };
}

export const EARN_CATALOG: EarnProtocol[] = [
  // ─── Staking liquide ───────────────────────────────────────────────
  {
    id: 'lido-steth',
    kind: 'staking',
    name: 'Lido',
    chainId: 'ethereum',
    underlying: ETH,
    receipt: { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', symbol: 'stETH', decimals: 18, coingeckoId: 'staked-ether' },
    deposit: { via: 'contract' }, // stETH.submit(referral) payable
    withdraw: { via: 'lifi' }, // swap stETH → ETH (instantané ; le retrait natif Lido prend 1–5 jours)
    apy: { source: 'defillama', pool: '747c1d2a-c668-4682-b9f9-296708a3dd90' },
    logo: ICON('lido'),
    url: 'https://stake.lido.fi',
    contract: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    withdrawNote: 'Sortie instantanée par échange stETH → ETH (léger écart de prix possible).',
  },
  {
    id: 'rocket-pool-reth',
    kind: 'staking',
    name: 'Rocket Pool',
    chainId: 'ethereum',
    underlying: ETH,
    receipt: { address: '0xae78736cd615f374d3085123a210448e74fc6393', symbol: 'rETH', decimals: 18, coingeckoId: 'rocket-pool-eth' },
    deposit: { via: 'lifi' },
    withdraw: { via: 'lifi' },
    apy: { source: 'defillama', pool: 'd4b3c522-6127-4b89-bedf-83641cdcd2eb' },
    logo: ICON('rocket-pool'),
    url: 'https://stake.rocketpool.net',
    withdrawNote: 'Entrée et sortie par échange ETH ↔ rETH (meilleure route DEX).',
  },
  {
    id: 'benqi-savax',
    kind: 'staking',
    name: 'Benqi',
    chainId: 'avalanche',
    underlying: AVAX,
    receipt: { address: '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be', symbol: 'sAVAX', decimals: 18, coingeckoId: 'benqi-liquid-staked-avax' },
    deposit: { via: 'contract' }, // sAVAX.submit() payable
    withdraw: { via: 'lifi' }, // le retrait natif Benqi impose 15 jours
    apy: { source: 'defillama', pool: '3790c3e5-8644-4f6b-8feb-12434d8b99f9' },
    logo: ICON('benqi-staked-avax'),
    url: 'https://staking.benqi.fi',
    contract: '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be',
    withdrawNote: 'Sortie instantanée par échange sAVAX → AVAX (le retrait natif Benqi prend 15 jours).',
  },
  {
    id: 'jito-jitosol',
    kind: 'staking',
    name: 'Jito',
    chainId: 'solana',
    underlying: SOL,
    receipt: { address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', symbol: 'JitoSOL', decimals: 9, coingeckoId: 'jito-staked-sol' },
    deposit: { via: 'lifi' },
    withdraw: { via: 'lifi' },
    apy: { source: 'defillama', pool: '0e7d0722-9054-4907-8593-567b353c0900' },
    logo: ICON('jito-liquid-staking'),
    url: 'https://www.jito.network/staking',
    withdrawNote: 'Entrée et sortie instantanées via Jupiter.',
  },
  {
    id: 'marinade-msol',
    kind: 'staking',
    name: 'Marinade',
    chainId: 'solana',
    underlying: SOL,
    receipt: { address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', symbol: 'mSOL', decimals: 9, coingeckoId: 'msol' },
    deposit: { via: 'lifi' },
    withdraw: { via: 'lifi' },
    apy: { source: 'defillama', pool: 'b3f93865-5ec8-4662-90a0-11808e0aa2bd' },
    logo: ICON('marinade-liquid-staking'),
    url: 'https://marinade.finance',
    withdrawNote: 'Entrée et sortie instantanées via Jupiter.',
  },

  // ─── Lending (Aave v3) — aTokens vérifiés via Pool.getReserveData ──
  aave('ethereum', usdc('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), '0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c', 'aa70268e-4b52-42bf-a116-608b370f9501'),
  aave('ethereum', usdt('0xdac17f958d2ee523a2206206994597c13d831ec7'), '0x23878914efe38d27c4d67ab83ed1b93a74d4086a', 'f981a304-bb6c-45b8-b0c5-fd2f515ad23a'),
  aave('arbitrum', usdc('0xaf88d065e77c8cc2239327c5edb3a432268e5831'), '0x724dc807b04555b71ed48a6896b6f41593b8c637', 'd9fa8e14-0447-4207-9ae8-7810199dfa1f'),
  aave('base', usdc('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'), '0x4e65fe4dba92790696d040ac24aa414708f5c0ab', '7e0661bf-8cf3-45e6-9424-31916d4c7b84'),
  aave('polygon', usdc('0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'), '0xa4d94019934d8333ef880abffbf2fdd611c762bd', '1b8b4cdb-0728-42a8-bf13-2c8fea7427ee'),
  aave('avalanche', usdc('0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'), '0x625e7708f30ca75bfd92586e17077590c60eb4cd', 'c4b05318-88af-4536-a834-f5fc8940d2d3'),
  aave('optimism', usdc('0x0b2c639c533813f4aa9d7837caf62653d097ff85'), '0x38d693ce1df5aadf7bc62595a37d667ad57922e5', '0758c3b8-4ffb-4176-b0a9-f446e367db46'),
  aave('bnb', usdt('0x55d398326f99059ff775485246999027b3197955', 18), '0xa9251ca9de909cb71783723713b21e4233fbf1b1', '29be6a85-414f-4a66-b075-98863278912a'),
];

export function findProtocol(id: string): EarnProtocol | undefined {
  return EARN_CATALOG.find((p) => p.id === id);
}

/** Protocoles dont le token de reçu correspond (détection d'une position depuis un token détenu). */
export function protocolByReceipt(chainId: string, address: string): EarnProtocol | undefined {
  const a = address.toLowerCase();
  return EARN_CATALOG.find((p) => p.chainId === chainId && p.receipt.address.toLowerCase() === a);
}

export function isNative(token: EarnToken): boolean {
  return token.address === NATIVE;
}
