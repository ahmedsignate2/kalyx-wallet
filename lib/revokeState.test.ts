import { isRecentlyRevoked, markRevoked, RECENT_REVOKE_MS } from './revokeState';

describe('revokeState', () => {
  it('une révocation envoyée compte comme faite, sans casse, pendant 10 min', () => {
    markRevoked('base', '0xAbC', '0xToKeN', '0xSpEnDeR', 1_000);
    expect(isRecentlyRevoked('base', '0xabc', '0xtoken', '0xspender', 1_000 + RECENT_REVOKE_MS - 1)).toBe(true);
    expect(isRecentlyRevoked('base', '0xabc', '0xtoken', '0xspender', 1_000 + RECENT_REVOKE_MS)).toBe(false);
    expect(isRecentlyRevoked('ethereum', '0xabc', '0xtoken', '0xspender', 1_000)).toBe(false);
  });
});
