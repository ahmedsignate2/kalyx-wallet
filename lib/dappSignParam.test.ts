import { signMessageParam } from './dappProvider';

const ADDR = '0x84E90B03e29c28B22c645AD6C0BADC9574995Eb3';
it('personal_sign : le message, même quand la dApp inverse les paramètres', () => {
  expect(signMessageParam('personal_sign', ['0x48656c6c6f', ADDR])).toBe('0x48656c6c6f');
  expect(signMessageParam('personal_sign', [ADDR, '0x48656c6c6f'])).toBe('0x48656c6c6f');
  expect(signMessageParam('personal_sign', ['Sign in to app.xyz', ADDR])).toBe('Sign in to app.xyz');
  expect(signMessageParam('eth_sign', [ADDR, '0xdead'])).toBe('0xdead');
});
