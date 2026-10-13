/**
 * Compte de carte on-chain (Gnosis Pay) : l'adresse collée doit être un
 * CONTRAT (le Safe de la carte) sur Gnosis Chain, jamais une adresse du
 * portefeuille ; le solde ne compte que les stablecoins de l'émetteur.
 */
const mockCode = jest.fn();
const mockTokens = jest.fn();
jest.mock('../src/domain/chains/registry', () => ({
  getAdapter: () => ({ getCode: mockCode, config: { id: 'gnosis' } }),
}));
jest.mock('../src/domain/tokens/alchemyTokens', () => ({ getErc20TokensStrict: (...a: unknown[]) => mockTokens(...a) }));

import { checkCardAccount, cardAccountBalance } from './cardAccount';
import { cardIssuer } from '../src/domain/card/cardIssuers';

const gp = cardIssuer('gnosispay');
const SAFE = '0x1111111111111111111111111111111111111111';
const MINE = '0x2222222222222222222222222222222222222222';

describe('compte de carte on-chain', () => {
  beforeEach(() => { mockCode.mockReset(); mockTokens.mockReset(); });

  it('refuse une adresse mal formée, sans appel réseau', async () => {
    expect(await checkCardAccount('0x123', gp, [])).toEqual({ ok: false, reason: 'format' });
    expect(mockCode).not.toHaveBeenCalled();
  });

  it('refuse l’adresse du portefeuille lui-même', async () => {
    expect(await checkCardAccount(MINE, gp, [MINE.toUpperCase().replace('0X', '0x')])).toEqual({ ok: false, reason: 'ownWallet' });
  });

  it('refuse une adresse sans contrat (pas un Safe)', async () => {
    mockCode.mockResolvedValue('0x');
    expect(await checkCardAccount(SAFE, gp, [MINE])).toEqual({ ok: false, reason: 'notContract' });
  });

  it('réseau en échec : dit « réseau », pas « adresse invalide »', async () => {
    mockCode.mockRejectedValue(new Error('timeout'));
    expect(await checkCardAccount(SAFE, gp, [])).toEqual({ ok: false, reason: 'network' });
  });

  it('accepte un contrat et rend l’adresse normalisée', async () => {
    mockCode.mockResolvedValue('0x6080');
    expect(await checkCardAccount(`  ${SAFE} `, gp, [MINE])).toEqual({ ok: true, address: SAFE });
  });

  it('solde : seulement les stablecoins de l’émetteur, montants humains', async () => {
    mockTokens.mockResolvedValue([
      { contract: '0xa', symbol: 'EURe', decimals: 18, raw: 25n * 10n ** 18n, name: '' },
      { contract: '0xb', symbol: 'WETH', decimals: 18, raw: 10n ** 18n, name: '' },
      { contract: '0xc', symbol: 'USDC.e', decimals: 6, raw: 0n, name: '' },
    ]);
    expect(await cardAccountBalance(SAFE, gp)).toEqual([{ symbol: 'EURe', contract: '0xa', decimals: 18, amount: 25 }]);
  });
});
