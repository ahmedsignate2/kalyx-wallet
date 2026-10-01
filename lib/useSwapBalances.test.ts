jest.mock('react-native', () => ({ AppState: { currentState: 'active' } }));
jest.mock('../src', () => ({ ...jest.requireActual('../src'), getAdapter: jest.fn(), getAdapterV2: jest.fn() }));
import { beginSwap, isSwapPending, SWAP_PENDING_MAX_MS } from './useSwapBalances';

describe('beginSwap — échange en cours', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('verrouille le périmètre jusqu’à l’issue ; plusieurs échanges : libéré au dernier', () => {
    const a = beginSwap('base', '0xme');
    const b = beginSwap('base', '0xme');
    expect(isSwapPending('base', '0xme')).toBe(true);
    expect(isSwapPending('arbitrum', '0xme')).toBe(false);
    a(true);
    a(true); // idempotent
    expect(isSwapPending('base', '0xme')).toBe(true);
    b(true);
    expect(isSwapPending('base', '0xme')).toBe(false);
  });

  it('issue inconnue : le verrou tient jusqu’au plafond de 3 min', () => {
    const a = beginSwap('solana', 'me');
    a(false);
    jest.advanceTimersByTime(SWAP_PENDING_MAX_MS - 1);
    expect(isSwapPending('solana', 'me')).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isSwapPending('solana', 'me')).toBe(false);

    beginSwap('ton', 'me');
    jest.advanceTimersByTime(SWAP_PENDING_MAX_MS);
    expect(isSwapPending('ton', 'me')).toBe(false);
  });
});
