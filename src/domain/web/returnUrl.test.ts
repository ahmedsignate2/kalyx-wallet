import { safeNativeReturn, safeUniversalReturn, tonReturnUrl, wcReturnUrl } from './returnUrl';

describe('safeUniversalReturn — retour web seulement vers le site de la dApp', () => {
  it.each([
    ['https://app.uniswap.org/swap', 'https://app.uniswap.org', 'https://app.uniswap.org/swap'],
    ['https://m.dapp.io/done', 'https://dapp.io', 'https://m.dapp.io/done'],
    ['https://dapp.io/x', 'https://www.dapp.io', 'https://dapp.io/x'],
    ['https://www.dapp.io/x', 'https://dapp.io', 'https://www.dapp.io/x'],
  ])('%s (site %s) → accepté', (url, site, out) => {
    expect(safeUniversalReturn(url, site)).toBe(out);
  });
  it.each([
    ['https://evil.com', 'https://dapp.io'],
    ['https://dapp.io.evil.com', 'https://dapp.io'],
    ['https://evildapp.io', 'https://dapp.io'],
    ['https://dapp.io@evil.com/', 'https://dapp.io'],
    ['https://evil.com/@dapp.io', 'https://dapp.io'],
    ['http://dapp.io', 'https://dapp.io'],
    ['javascript:alert(1)', 'https://dapp.io'],
    ['https://dapp.io', 'not a url'],
    ['https://dapp.io', ''],
    [undefined, 'https://dapp.io'],
  ])('%s (site %s) → refusé', (url, site) => {
    expect(safeUniversalReturn(url, site)).toBeNull();
  });
});

describe('safeNativeReturn — lien d’application', () => {
  it.each(['metamask://', 'tg://resolve?domain=x', 'uniswap://wc', 'rainbow:'])('%s accepté', (u) => {
    expect(safeNativeReturn(u)).toBe(u);
  });
  it.each(['https://dapp.io', 'http://dapp.io', 'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'intent://x#Intent;end', 'kalyx://', 'blob:x', '', 'no-scheme', 'tg://a b', null])('%s refusé', (u) => {
    expect(safeNativeReturn(u)).toBeNull();
  });
});

describe('wcReturnUrl', () => {
  it('lien d’application prioritaire', () => {
    expect(wcReturnUrl({ native: 'metamask://', universal: 'https://dapp.io/r' }, 'https://dapp.io')).toBe('metamask://');
  });
  it('native interdit → lien web contrôlé', () => {
    expect(wcReturnUrl({ native: 'https://evil.com', universal: 'https://dapp.io/r' }, 'https://dapp.io')).toBe('https://dapp.io/r');
  });
  it('lien web d’un autre domaine → rien', () => {
    expect(wcReturnUrl({ universal: 'https://evil.com/r' }, 'https://dapp.io')).toBeNull();
  });
  it('pas de redirect → rien', () => {
    expect(wcReturnUrl(undefined, 'https://dapp.io')).toBeNull();
  });
});

describe('tonReturnUrl', () => {
  it.each(['back', 'none', '', undefined])('%s → rien', (r) => {
    expect(tonReturnUrl(r, 'https://dapp.io')).toBeNull();
  });
  it('lien web du domaine du manifeste', () => {
    expect(tonReturnUrl('https://app.dapp.io/ok', 'https://dapp.io')).toBe('https://app.dapp.io/ok');
  });
  it('lien web étranger refusé', () => {
    expect(tonReturnUrl('https://evil.com', 'https://dapp.io')).toBeNull();
  });
  it('lien d’application accepté, javascript refusé', () => {
    expect(tonReturnUrl('tg://resolve?domain=app', 'https://dapp.io')).toBe('tg://resolve?domain=app');
    expect(tonReturnUrl('javascript:alert(1)', 'https://dapp.io')).toBeNull();
  });
});

describe('retour natif : schémas de navigateur refusés', () => {
  it.each(['x-safari-https://evil.example/', 'googlechromes://evil.example/', 'firefox://open-url?url=https://evil.example', 'X-SAFARI-HTTPS://evil.example/'])('%s → refusé', (u) => {
    expect(safeNativeReturn(u)).toBeNull();
  });
  it('schéma d’app ordinaire accepté', () => {
    expect(safeNativeReturn('uniswap://')).toBe('uniswap://');
  });
});
