/*
 * `react-native` et le module i18n sont bouchonnés : ce test porte sur le
 * ROUTAGE d'une demande de paiement, pas sur l'interface. Sans ces doubles,
 * l'import de `lib/i18n` tire I18nManager et le fichier ne se charge pas.
 */
jest.mock('react-native', () => ({
  I18nManager: { allowRTL: jest.fn(), forceRTL: jest.fn(), isRTL: false },
  Platform: { OS: 'android', Version: 34 },
  NativeModules: {},
}));
jest.mock('./i18n', () => ({ translate: (_l: string, k: string) => k }));
jest.mock('./walletconnect', () => ({ useWalletConnect: { getState: () => ({ pair: jest.fn() }) } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('./toast', () => ({ toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() } }));
jest.mock('./walletStore', () => ({
  useWallet: { getState: () => ({ activeChain: 'bitcoin', setActiveChain: jest.fn() }) },
}));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ language: 'fr' }) } }));
jest.mock('./portfolio/portfolioStore', () => ({ usePortfolioStore: { getState: () => ({ holdings: [] }) } }));

import { router } from 'expo-router';
import { runQrIntent } from './paymentIntent';
import { parseQr } from '../src';

const BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

/** Paramètres de route passés au dernier `router.push`. */
function lastParams(): Record<string, string> {
  const calls = (router.push as jest.Mock).mock.calls;
  return (calls[calls.length - 1]?.[0]?.params ?? {}) as Record<string, string>;
}

beforeEach(() => (router.push as jest.Mock).mockClear());

describe('BIP-21 → écran d’envoi : tout ce dont le récapitulatif a besoin', () => {
  it('destinataire ET montant sont transmis', async () => {
    /*
     * Le montant est la condition qui fait atterrir sur le récapitulatif au
     * lieu du tunnel manuel. Sans lui, l'utilisateur repasse par l'étape
     * « quoi envoyer », qui EFFACE le montant — le défaut exact remonté du
     * premier essai sur appareil.
     */
    await runQrIntent(parseQr(`bitcoin:${BTC}?amount=0.005`));
    const p = lastParams();
    expect(p.to).toBe(BTC);
    expect(p.amount).toBe('0.005');
  });

  it('bénéficiaire et motif sont transmis pour l’affichage', async () => {
    await runQrIntent(parseQr(`bitcoin:${BTC}?amount=0.01&label=Caf%C3%A9%20Nova&message=Table%2012`));
    const p = lastParams();
    expect(p.payee).toBe('Café Nova');
    expect(p.note).toBe('Table 12');
  });

  it('PAS de `chain` : elle ferait sauter le choix du jeton sur un scan d’adresse nue', async () => {
    await runQrIntent(parseQr(`bitcoin:${BTC}?amount=0.01`));
    expect(lastParams().chain).toBeUndefined();
  });

  it('une adresse NUE ne transmet pas de montant : le tunnel reste nécessaire', async () => {
    // C'est la distinction qui compte : une adresse n'est pas une demande de
    // paiement, il n'y a rien à préremplir.
    await runQrIntent(parseQr(BTC));
    const p = lastParams();
    expect(p.to).toBe(BTC);
    expect(p.amount).toBeUndefined();
  });
});

describe('Solana Pay → écran d’envoi', () => {
  const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
  const REF = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('montant, repères et mémo traversent jusqu’à la route', async () => {
    /*
     * Les repères ne changent rien au transfert, mais sans eux le marchand ne
     * retrouve jamais le paiement. Les perdre entre le parseur et l'écran
     * reviendrait à ne pas les avoir lus.
     */
    await runQrIntent(parseQr(`solana:${SOL}?amount=1.5&reference=${REF}&memo=cmd-42&label=Nova`));
    const p = lastParams();
    expect(p.to).toBe(SOL);
    expect(p.amount).toBe('1.5');
    expect(p.references).toBe(REF);
    expect(p.memo).toBe('cmd-42');
    expect(p.payee).toBe('Nova');
  });

  it('plusieurs repères sont joints, pas réduits au dernier', async () => {
    await runQrIntent(parseQr(`solana:${SOL}?amount=1&reference=${REF}&reference=${SOL}`));
    expect(lastParams().references).toBe(`${REF},${SOL}`);
  });
});

describe('Routage vers les écrans dédiés', () => {
  it('un lien WalletConnect Pay va sur /pay, pas sur l’écran d’envoi', async () => {
    await runQrIntent(parseQr('https://pay.walletconnect.com/pay_1'));
    expect((router.push as jest.Mock).mock.calls.at(-1)?.[0]?.pathname).toBe('/pay');
  });

  it('une requête de transaction Solana va sur son écran dédié', async () => {
    // La transaction sera construite par un serveur : l'écran d'envoi ne
    // convient pas, il suppose qu'on sait déjà ce qu'on envoie.
    await runQrIntent(parseQr('solana:https://marchand.example/pay/42'));
    expect((router.push as jest.Mock).mock.calls.at(-1)?.[0]?.pathname).toBe('/solana-request');
  });
});
