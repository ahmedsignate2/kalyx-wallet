jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US', textDirection: 'ltr' }]) }));
jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
import { translate } from './i18n';
import { friendlyTxError } from './txError';
import { WalletError } from '../src';

/*
 * Les erreurs qui portent leurs montants (`WalletError.meta`) donnent une phrase
 * CHIFFRÉE, dans la vraie traduction : « tu peux envoyer au plus 0,0005 SOL »
 * plutôt que « reste sous le loyer minimal ».
 */
describe('friendlyTxError — les montants disent quoi corriger', () => {
  const t = (key: string) => translate('en', key as never);

  it('Solana : le montant maximum et « tout envoyer » sont écrits', () => {
    const msg = friendlyTxError(new WalletError('SOL_RENT_SENDER', 'Reste sous le loyer minimal', { max: '0.0005', all: '0.00139' }), t as never);
    expect(msg).toContain('0.0005 SOL');
    expect(msg).toContain('0.00139 SOL');
  });

  it('Solana : sans marge, seul « tout envoyer » est proposé', () => {
    const msg = friendlyTxError(new WalletError('SOL_RENT_SENDER', 'x', { max: '0', all: '0.0009' }), t as never);
    expect(msg).toContain('0.0009 SOL');
    expect(msg).not.toContain('{');
  });

  it('solde insuffisant : ce qu’on a et les frais', () => {
    const msg = friendlyTxError(new WalletError('INSUFFICIENT_FUNDS', 'x', { have: '0.00002', fee: '0.0000141', symbol: 'BTC' }), t as never);
    expect(msg).toContain('0.00002 BTC');
    expect(msg).toContain('0.0000141 BTC');
  });

  it('échange TON : le TON nécessaire, le gas et le solde', () => {
    const msg = friendlyTxError(new WalletError('INSUFFICIENT_GAS', 'x', { need: '1.33', have: '1', gas: '0.33' }), t as never);
    expect(msg).toContain('1.33 TON');
    expect(msg).toContain('0.33 TON');
    expect(msg).toContain('1 TON');
  });

  it('simulation d’échange en échec : un message dédié, pas « action non disponible »', () => {
    expect(friendlyTxError(new WalletError('SWAP_SIMULATION_FAILED', 'x'), ((k: string) => `T:${k}`) as never)).toBe('T:errSwapSimulationFailed');
  });

  it('sans montants, le message du code reste le repli', () => {
    expect(friendlyTxError(new WalletError('SOL_RENT_SENDER', 'x'), ((k: string) => `T:${k}`) as never)).toBe('T:errSolRentSender');
  });
});
