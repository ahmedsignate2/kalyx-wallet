import { classifyToken } from './registry';

describe('classifyToken', () => {
  it('reconnaît stETH par contrat (registre, prioritaire)', () => {
    expect(classifyToken('ethereum', '0xae7ab96520dE3A18E5e111B5EaAb095312D7fE84', 'X', 'X')).toEqual({
      kind: 'staking',
      protocol: 'Lido',
    });
  });

  it('reconnaît wstETH, rETH, cbETH, sDAI, stMATIC', () => {
    expect(classifyToken('ethereum', '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', '', '')?.kind).toBe('staking');
    expect(classifyToken('ethereum', '0xae78736cd615f374d3085123a210448e74fc6393', '', '')?.protocol).toBe('Rocket Pool');
    expect(classifyToken('ethereum', '0xbe9895146f7af43049ca1c1ae358b0541ea49704', '', '')?.protocol).toBe('Coinbase');
    expect(classifyToken('ethereum', '0x83f20f44975d03b1b09e64809b757c47f942beea', '', '')?.kind).toBe('defi');
    expect(classifyToken('polygon', '0x3a58a54c066fdc0f2d55fc9c89f0415c92ebf3c4', '', '')?.protocol).toBe('Lido');
  });

  it('reconnaît les aTokens Aave par nom puis symbole', () => {
    expect(classifyToken('ethereum', '0x1', 'Aave Ethereum USDC', 'aEthUSDC')).toEqual({
      kind: 'defi',
      protocol: 'Aave',
    });
    // symbole seul (nom exotique)
    expect(classifyToken('base', '0x2', 'interest bearing', 'aBasUSDbC')?.protocol).toBe('Aave');
  });

  it('reconnaît Lido/Compound/Rocket Pool par nom', () => {
    expect(classifyToken('ethereum', '0x3', 'Lido Staked Ether', 'stETH')?.kind).toBe('staking');
    expect(classifyToken('ethereum', '0x4', 'Compound USDT', 'cUSDT')?.protocol).toBe('Compound');
    expect(classifyToken('ethereum', '0x5', 'Rocket Pool ETH', 'rETH')?.protocol).toBe('Rocket Pool');
  });

  it('laisse les tokens normaux en null (USDC, spam)', () => {
    expect(classifyToken('ethereum', '0x6', 'USD Coin', 'USDC')).toBeNull();
    expect(classifyToken('ethereum', '0x7', 'Visit-site.com', 'CLAIM')).toBeNull();
    // « a » + majuscule sans préfixe réseau ne matche pas (évite Aavegotchi etc.)
    expect(classifyToken('ethereum', '0x8', 'Aavegotchi', 'GHST')).toBeNull();
  });
});
