import { Tok } from "../src/domain/chains/EvmChainAdapter";

export interface DeFiPosition {
  id: string;
  protocol: string;
  name: string;
  logo: string;
  balance: number;
  valueUsd: number;
  url: string;
}

export async function fetchDeFiPortfolio(address: string, chainId: string | number, tokens: Tok[]): Promise<DeFiPosition[]> {
  // Simulate API call to Debank / Zerion
  await new Promise(r => setTimeout(r, 600));
  
  const positions: DeFiPosition[] = [];
  
  // 1. Cross-reference real wallet tokens with known DeFi footprints
  for (const tk of tokens) {
    const n = (tk.name || '').toLowerCase();
    const s = (tk.symbol || '').toLowerCase();
    
    if (n.includes('aave') || s.startsWith('a') && s.length > 3) {
      positions.push({ id: tk.contract, protocol: 'Aave', name: 'Aave Supply: ' + tk.symbol.replace(/^a/, ''), logo: 'https://cryptologos.cc/logos/aave-aave-logo.png', balance: Number(tk.fiat || 0) / 1, valueUsd: Number(tk.fiat || 0), url: 'https://app.aave.com' });
    } else if (n.includes('raydium') || s.includes('lp')) {
      positions.push({ id: tk.contract, protocol: 'Raydium', name: 'Liquidity Pool: ' + tk.symbol, logo: 'https://cryptologos.cc/logos/raydium-ray-logo.png', balance: Number(tk.fiat || 0) / 1, valueUsd: Number(tk.fiat || 0), url: 'https://raydium.io' });
    } else if (n.includes('kamino') || s.includes('k')) {
      positions.push({ id: tk.contract, protocol: 'Kamino', name: 'Kamino Vault: ' + tk.symbol, logo: 'https://cryptologos.cc/logos/solana-sol-logo.png', balance: Number(tk.fiat || 0) / 1, valueUsd: Number(tk.fiat || 0), url: 'https://app.kamino.finance' });
    } else if (tk.defi?.kind === 'defi') {
      positions.push({ id: tk.contract, protocol: 'DeFi Protocol', name: 'Position: ' + tk.symbol, logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png', balance: Number(tk.fiat || 0) / 1, valueUsd: Number(tk.fiat || 0), url: 'https://defillama.com' });
    }
  }

  return positions;
}
