import { dappHost } from './dappHost';

describe('dappHost — le domaine montré est le vrai', () => {
  it.each([
    ['https://app.uniswap.org/swap', 'app.uniswap.org'],
    ['https://app.uniswap.org@evil.com', 'evil.com'],
    ['https://evil.com/@app.uniswap.org', 'evil.com'],
    ['https://evil.com?x@app.uniswap.org', 'evil.com'],
    ['https://evil.com#@app.uniswap.org', 'evil.com'],
    ['https://user:pass@evil.com:8443/a', 'evil.com'],
    ['app.uniswap.org', 'app.uniswap.org'],
    ['wss://relay.example.org', 'relay.example.org'],
    ['', ''],
  ])('%s → %s', (url, host) => {
    expect(dappHost(url)).toBe(host);
  });
});
