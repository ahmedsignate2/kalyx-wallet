import { describe, expect, test } from 'vitest';
import { lookalikeOf, registrable, safeIcon, siteReport } from './siteInfo';

describe('ce qu’on sait d’un site', () => {
  test('domaine enregistrable', () => {
    expect(registrable('app.uniswap.org')).toBe('uniswap.org');
    expect(registrable('www.example.co.uk')).toBe('example.co.uk');
  });

  test('vrais sites et leurs sous-domaines : pas de sosie', () => {
    for (const h of ['delay.com', 'curve.fi', 'relay.link', 'scrolls.com', 'base.org', 'app.uniswap.org', 'uniswap.org', 'jup.ag', 'station.jup.ag', 'opensea.io', 'app.aave.com', 'localhost', 'example.com', 'github.com', 'google.com']) expect(lookalikeOf(h), h).toBeNull();
  });

  test('sosies repérés', () => {
    expect(lookalikeOf('uniswap-airdrop.com')).toBe('uniswap.org');
    expect(lookalikeOf('app.uniswap.app')).toBe('uniswap.org');
    expect(lookalikeOf('uniswapp.org')).toBe('uniswap.org');
    expect(lookalikeOf('unsiwap.org')).toBe('uniswap.org');
    expect(lookalikeOf('opensae.io')).toBe('opensea.io');
    expect(lookalikeOf('raydlum.io')).toBe('raydium.io');
    expect(lookalikeOf('phantom-wallet.app')).toBe('phantom.app');
    expect(lookalikeOf('jupag.io')).toBe('jup.ag');
    expect(lookalikeOf('claim-lido.org')).toBeNull(); // « lido » trop court pour le tiret : pas de faux positif sur les mots courts
    expect(lookalikeOf('pancakeswap.finance.claim-now.xyz')).toBeNull(); // domaine enregistrable « claim-now.xyz »… sans marque
    expect(lookalikeOf('metamask-io.com')).toBe('metamask.io');
    expect(lookalikeOf('kalyxwalet.com')).toBe('kalyxwallet.com');
  });

  test('icône : https ou image data: seulement', () => {
    expect(safeIcon('https://app.uniswap.org/favicon.png')).toBe('https://app.uniswap.org/favicon.png');
    expect(safeIcon('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeIcon('javascript:alert(1)')).toBeUndefined();
    expect(safeIcon('http://site.example/favicon.ico')).toBeUndefined();
    expect(safeIcon('chrome://favicon/x')).toBeUndefined();
    expect(safeIcon('data:text/html,<script>')).toBeUndefined();
    expect(safeIcon(undefined)).toBeUndefined();
  });

  test('rapport : verdict GoPlus, sosie, déjà connu ; service muet = inconnu', async () => {
    expect(await siteReport('https://uniswap-airdrop.com', false, { phishing: async () => 'phishing' })).toEqual({ verdict: 'phishing', lookalike: 'uniswap.org', known: false });
    expect(await siteReport('https://app.uniswap.org', true, { phishing: async () => 'safe' })).toEqual({ verdict: 'safe', lookalike: null, known: true });
    expect((await siteReport('https://x.example', false, { phishing: () => new Promise(() => {}), timeoutMs: 10 })).verdict).toBe('unknown');
    expect((await siteReport('https://x.example', false, { phishing: async () => { throw new Error('x'); } })).verdict).toBe('unknown');
  });
});
