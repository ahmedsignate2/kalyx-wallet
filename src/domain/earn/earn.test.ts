import { Interface } from 'ethers';
import {
  EARN_CATALOG,
  AAVE_V3_POOL,
  findProtocol,
  protocolByReceipt,
  NATIVE,
  encodeLidoSubmit,
  encodeBenqiSubmit,
  encodeAaveSupply,
  encodeAaveWithdraw,
  encodeAaveGetReserveData,
  decodeAaveReserveData,
  MAX_UINT256,
  parseLlamaPoolApy,
  yearlyYield,
} from './index';

describe('catalogue Earn', () => {
  it('ids uniques, chaînes et adresses cohérentes', () => {
    const ids = EARN_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of EARN_CATALOG) {
      expect(p.receipt.address).not.toBe(NATIVE);
      if (p.chainId !== 'solana') {
        expect(p.receipt.address).toMatch(/^0x[0-9a-f]{40}$/); // minuscules
        if (p.underlying.address !== NATIVE) expect(p.underlying.address).toMatch(/^0x[0-9a-f]{40}$/);
      }
      // Toute route « contract » a une adresse de contrat cible.
      if (p.deposit.via === 'contract' || p.withdraw.via === 'contract') expect(p.contract).toBeTruthy();
      if (p.kind === 'lending') expect(p.contract).toBe(AAVE_V3_POOL[p.chainId]);
      expect(p.logo).toMatch(/^https:\/\//);
    }
  });

  it('retrouve un protocole par id et par token de reçu', () => {
    expect(findProtocol('lido-steth')?.name).toBe('Lido');
    expect(protocolByReceipt('ethereum', '0xAE7AB96520DE3A18E5E111B5EAAB095312D7FE84')?.id).toBe('lido-steth');
    expect(protocolByReceipt('solana', 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn')?.id).toBe('jito-jitosol');
    expect(protocolByReceipt('polygon', '0xae7ab96520de3a18e5e111b5eaab095312d7fe84')).toBeUndefined();
  });
});

describe('encodage ABI', () => {
  const OWNER = '0x28c6c06298d514db089934071355e5743bf21d60';
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

  it('sélecteurs vérifiés', () => {
    expect(encodeLidoSubmit().slice(0, 10)).toBe('0xa1903eab');
    expect(encodeBenqiSubmit()).toBe('0x5bcb2fc6');
    expect(encodeAaveSupply(USDC, 1_000_000n, OWNER).slice(0, 10)).toBe('0x617ba037');
    expect(encodeAaveWithdraw(USDC, MAX_UINT256, OWNER).slice(0, 10)).toBe('0x69328dec');
    expect(encodeAaveGetReserveData(USDC)).toBe('0x35ea6a75000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  it('supply/withdraw round-trip (cross-check ethers)', () => {
    const i = new Interface([
      'function supply(address,uint256,address,uint16)',
      'function withdraw(address,uint256,address)',
    ]);
    const s = i.decodeFunctionData('supply', encodeAaveSupply(USDC, 123n, OWNER));
    expect(s[0].toLowerCase()).toBe(USDC);
    expect(s[1]).toBe(123n);
    expect(s[2].toLowerCase()).toBe(OWNER);
    expect(s[3]).toBe(0n);
    const w = i.decodeFunctionData('withdraw', encodeAaveWithdraw(USDC, MAX_UINT256, OWNER));
    expect(w[1]).toBe(MAX_UINT256);
  });

  it('décode getReserveData (réponse réelle Aave v3 Ethereum USDC)', () => {
    // Fabrique une réponse : 15 mots, currentLiquidityRate = 3,5 % APR (RAY), aToken connu.
    const words: string[] = new Array(15).fill('0'.repeat(64));
    words[2] = (35n * 10n ** 24n).toString(16).padStart(64, '0'); // 0.035 * 1e27
    words[8] = '98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c'.padStart(64, '0');
    const hex = '0x' + words.join('');
    const r = decodeAaveReserveData(hex)!;
    expect(r.aToken).toBe('0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c');
    expect(r.supplyApy).toBeGreaterThan(3.5);
    expect(r.supplyApy).toBeLessThan(3.6); // composé ≈ 3,56 %
    expect(decodeAaveReserveData('0x')).toBeNull();
  });
});

describe('APY', () => {
  it('parse poolsEnriched', () => {
    expect(parseLlamaPoolApy({ data: [{ apy: 2.247 }] })).toBe(2.247);
    expect(parseLlamaPoolApy({ data: [{ apyBase: 4.1 }] })).toBe(4.1);
    expect(parseLlamaPoolApy({ data: [] })).toBeNull();
    expect(parseLlamaPoolApy({ data: [{ apy: -1 }] })).toBeNull();
    expect(parseLlamaPoolApy(null)).toBeNull();
  });
  it('rendement annuel', () => {
    expect(yearlyYield(10, 5)).toBeCloseTo(0.5);
    expect(yearlyYield(0, 5)).toBe(0);
    expect(yearlyYield(10, NaN)).toBe(0);
  });
});
