import { holdingLabel } from './holdingLabel';

describe('holdingLabel', () => {
  it('n’affiche pas le réseau quand il répète le nom', () => {
    expect(holdingLabel('Ethereum', 'Ethereum', ['ETH'])).toBe('Ethereum');
    expect(holdingLabel('Toncoin', 'TON', ['TON'])).toBe('Toncoin');
    expect(holdingLabel('BNB', 'BNB Chain', ['BNB'])).toBe('BNB');
    expect(holdingLabel('SOL', 'Solana', ['Solana'])).toBe('SOL');
    expect(holdingLabel('ETH', 'Ethereum', ['Ethereum'])).toBe('ETH');
  });
  it('garde le réseau quand il informe', () => {
    expect(holdingLabel('Ethereum', 'Base', ['ETH'])).toBe('Ethereum · Base');
    expect(holdingLabel('Tether USD', 'TON', ['USD₮'])).toBe('Tether USD · TON');
  });
});
