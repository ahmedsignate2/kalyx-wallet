import { isRevokeInFlight, markRevokeSent, RECENT_REVOKE_MS } from './revokeState';

describe('revokeState', () => {
  it('en vol tant que non minée ; minée → oubliée (la chaîne fait foi)', async () => {
    markRevokeSent('base', '0xAbC', '0xT', '0xS', '0xh', 1_000);
    expect(await isRevokeInFlight('base', '0xabc', '0xt', '0xs', async () => false, 2_000)).toBe(true);
    expect(await isRevokeInFlight('base', '0xabc', '0xt', '0xs', async () => { throw new Error('rpc'); }, 2_000)).toBe(true);
    expect(await isRevokeInFlight('base', '0xabc', '0xt', '0xs', async () => true, 2_000)).toBe(false);
    expect(await isRevokeInFlight('base', '0xabc', '0xt', '0xs', async () => false, 2_000)).toBe(false); // oubliée
  });
  it('envoi incertain (sans hash) : en cours jusqu’au délai', async () => {
    markRevokeSent('eth', '0xa', '0xt', '0xs', null, 0);
    expect(await isRevokeInFlight('eth', '0xa', '0xt', '0xs', async () => true, RECENT_REVOKE_MS - 1)).toBe(true);
    expect(await isRevokeInFlight('eth', '0xa', '0xt', '0xs', async () => true, RECENT_REVOKE_MS)).toBe(false);
  });
});
