import { isAlchemyRpc, pauseFromResponse, pauseRelay, relayPaused, resetRelayPauses } from './relay';
import { parseRelayTokens } from '../tokens/relayTokens';

describe('relais Kalyx : disjoncteur', () => {
  afterEach(resetRelayPauses);

  it('quota (503) et débit (429) mettent en pause, le reste non', () => {
    expect(pauseFromResponse(503, '3600')).toBe(3600);
    expect(pauseFromResponse(503, null)).toBe(300);
    expect(pauseFromResponse(429, null)).toBe(30);
    expect(pauseFromResponse(200, '60')).toBe(0);
    expect(pauseFromResponse(400, null)).toBe(0);
  });

  it('la pause dure le temps indiqué, plafonnée à une heure', () => {
    const t = 1_000_000;
    pauseRelay('alchemy', 60, t);
    expect(relayPaused('alchemy', t + 59_000)).toBe(true);
    expect(relayPaused('alchemy', t + 61_000)).toBe(false);
    expect(relayPaused('helius', t)).toBe(false);
    pauseRelay('helius', 999_999, t);
    expect(relayPaused('helius', t + 3_600_000 - 1)).toBe(true);
    expect(relayPaused('helius', t + 3_600_000 + 1)).toBe(false);
  });

  it('reconnaît Alchemy en direct et par le relais', () => {
    expect(isAlchemyRpc('https://eth-mainnet.g.alchemy.com/v2/KEY')).toBe(true);
    expect(isAlchemyRpc('https://relay.example/rpc/alchemy/eth-mainnet')).toBe(true);
    expect(isAlchemyRpc('https://eth.llamarpc.com')).toBe(false);
  });
});

describe('relais Kalyx : tokens ERC-20', () => {
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  it('garde les tokens lisibles, écarte le spam et l’illisible', () => {
    const out = parseRelayTokens([
      { contract: USDC, raw: '1500000', name: 'USD Coin', symbol: 'USDC', decimals: 6, logo: 'https://x/usdc.png' },
      { contract: '0x0000000000000000000000000000000000000001', raw: '5', name: 'Claim reward at t.me/x', symbol: 'REWARD', decimals: 18 },
      { contract: 'pas une adresse', raw: '5', symbol: 'X', decimals: 18 },
      { contract: USDC, raw: '-1', symbol: 'USDC', decimals: 6 },
    ]);
    expect(out).toEqual([{ contract: USDC, raw: 1500000n, name: 'USD Coin', symbol: 'USDC', decimals: 6, logo: 'https://x/usdc.png' }]);
  });
  it('une réponse illisible fait échouer le réseau', () => {
    expect(() => parseRelayTokens({})).toThrow();
  });
});
