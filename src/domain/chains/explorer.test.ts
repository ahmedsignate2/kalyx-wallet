import { buildExplorerTxUrl, SOLANA, SOLANA_DEVNET, SEPOLIA, BITCOIN, ETHEREUM } from './configs';

describe('buildExplorerTxUrl', () => {
  it('builds full URL for Solana mainnet', () => {
    const txHash = 'Qb2i4BnK8482kdjf95Bo';
    const url = buildExplorerTxUrl(SOLANA.explorerUrl, txHash);
    expect(url).toBe('https://solscan.io/tx/Qb2i4BnK8482kdjf95Bo');
  });

  it('builds full URL for Solana devnet with cluster query parameter', () => {
    const txHash = 'Qb2i4BnK8482kdjf95Bo';
    const url = buildExplorerTxUrl(SOLANA_DEVNET.explorerUrl, txHash);
    expect(url).toBe('https://solscan.io/tx/Qb2i4BnK8482kdjf95Bo?cluster=devnet');
  });

  it('builds full URL for Sepolia testnet', () => {
    const txHash = '0x1234567890abcdef';
    const url = buildExplorerTxUrl(SEPOLIA.explorerUrl, txHash);
    expect(url).toBe('https://sepolia.etherscan.io/tx/0x1234567890abcdef');
  });

  it('builds full URL for Ethereum mainnet', () => {
    const txHash = '0xabcdef123456';
    const url = buildExplorerTxUrl(ETHEREUM.explorerUrl, txHash);
    expect(url).toBe('https://etherscan.io/tx/0xabcdef123456');
  });

  it('builds full URL for Bitcoin', () => {
    const txHash = '3b814df378627';
    const url = buildExplorerTxUrl(BITCOIN.explorerUrl, txHash);
    expect(url).toBe('https://mempool.space/tx/3b814df378627');
  });

  it('ensures https:// is added if user provides URL without protocol', () => {
    const url = buildExplorerTxUrl('solscan.io', 'tx123');
    expect(url).toBe('https://solscan.io/tx/tx123');
  });

  it('handles trailing slashes properly without double slashes', () => {
    const url = buildExplorerTxUrl('https://solscan.io/', 'tx123');
    expect(url).toBe('https://solscan.io/tx/tx123');
  });
});
