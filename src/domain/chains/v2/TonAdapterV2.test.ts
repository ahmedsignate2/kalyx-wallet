import { TonAdapterV2, TON_TARGET_CAPABILITIES } from './TonAdapterV2';
import { findAdapterV2 } from './registry';
import { listChains } from '../registry';
import { NO_CAPABILITIES } from './capabilities';
import type { ChainConfig } from '../types';
import type { ChainAdapterV2 } from './types';

const TON_CONFIG: ChainConfig = {
  id: 'ton',
  name: 'TON',
  family: 'ton',
  nativeSymbol: 'TON',
  nativeDecimals: 9,
  rpcUrls: ['https://toncenter.com/api/v2/jsonRPC'],
};

describe('TonAdapterV2 — squelette inoffensif', () => {
  it('aucune chaîne TON n\'est enregistrée', () => {
    /*
     * Le squelette ne doit pas pouvoir être atteint par accident : ni par le
     * catalogue, ni par le registre v2. Un adapter à moitié écrit qui rend des
     * valeurs plausibles est bien plus dangereux qu'un adapter qui refuse.
     */
    expect(listChains().some((c) => c.family === 'ton')).toBe(false);
    expect(findAdapterV2('ton')).toBeNull();
  });

  it('ne déclare AUCUNE capacité tant que rien n\'est implémenté', () => {
    // La règle de capabilities.ts : une capacité décrit ce que la chaîne PEUT
    // faire, jamais ce qu'on a eu le temps d'écrire. Déclarer sans implémenter
    // produirait un bouton qui échoue, ce qui est pire que pas de bouton.
    expect(new TonAdapterV2(TON_CONFIG).capabilities).toEqual(NO_CAPABILITIES);
  });

  it('refuse une configuration qui n\'est pas TON', () => {
    expect(() => new TonAdapterV2({ ...TON_CONFIG, family: 'evm' })).toThrow(/non-TON/);
  });

  it('chaque opération refuse en NOMMANT ce qui manque', async () => {
    const a = new TonAdapterV2(TON_CONFIG);
    expect(() => a.deriveAccount()).toThrow(/docs\/10-TON\.md/);
    await expect(a.getBalance()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(a.getHistory()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(a.listTokens()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(a.prepareSend('x', { to: 'y', amount: 1n })).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    });
    await expect(a.signSend()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(a.broadcastSend()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(a.waitForTx()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('aucune adresse n\'est acceptée, pas même une TON bien formée', () => {
    // Refuser par défaut : un validateur qui dirait « oui » sans savoir lire le
    // drapeau « rebondissante » laisserait passer des paiements qui rebondissent.
    const a = new TonAdapterV2(TON_CONFIG);
    expect(a.validateAddress()).toBe(false);
  });
});

describe('TonAdapterV2 — capacités VISÉES', () => {
  it('ni paliers de frais, ni accélération, ni annulation', () => {
    /*
     * Ce ne sont pas des manques. Les frais TON ne se négocient pas : le réseau
     * les calcule et les prélève. Et un message non inclus avant son
     * `validUntil` expire sans rien débiter — il n'y a rien à accélérer.
     */
    expect(TON_TARGET_CAPABILITIES.feeTiers).toBe(false);
    expect(TON_TARGET_CAPABILITIES.accelerate).toBe(false);
    expect(TON_TARGET_CAPABILITIES.cancel).toBe(false);
  });

  it('mémo et activation du destinataire : les deux qui comptent', () => {
    // Les plateformes d'échange EXIGENT le commentaire pour attribuer un dépôt
    // TON ; sans lui les fonds arrivent sans propriétaire. Et un transfert de
    // jeton déploie le portefeuille de jeton du destinataire, à nos frais.
    expect(TON_TARGET_CAPABILITIES.memo).toBe(true);
    expect(TON_TARGET_CAPABILITIES.activatesDestination).toBe(true);
  });

  it('l\'interface v2 porte DÉJÀ ce dont TON a besoin', () => {
    /*
     * `memo`, `expiresAt` et `BroadcastOutcome.opaque` ont été ajoutés en
     * migrant Solana et Bitcoin, pas pour TON. Ce test fige le fait qu'ils
     * suffisent : s'il casse un jour, c'est que l'interface a régressé.
     */
    const request: Parameters<ChainAdapterV2['prepareSend']>[1] = {
      to: 'UQ…',
      amount: 1n,
      memo: 'identifiant de dépôt',
    };
    expect(request.memo).toBe('identifiant de dépôt');

    const draft: Pick<Awaited<ReturnType<ChainAdapterV2['prepareSend']>>, 'expiresAt'> = {
      expiresAt: Date.now() + 60_000,
    };
    expect(draft.expiresAt).toBeGreaterThan(Date.now());
  });
});
