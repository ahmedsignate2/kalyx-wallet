import { humanizeTx, groupByDay, type ActivityTranslate } from './humanize';
import type { TxSummary } from '../chains/types';

/*
 * Les phrases viennent d'un TRADUCTEUR INJECTÉ, plus du module.
 *
 * On lui donne ici les motifs français, ceux de `lib/i18n`, pour deux raisons :
 * les assertions restent lisibles, et la substitution des paramètres est
 * exercée pour de vrai — c'est elle qui casserait en silence.
 */
const FR: Record<string, string> = {
  actSent: 'Envoyé {amount} {symbol}',
  actReceived: 'Reçu {amount} {symbol}',
  actSwapped: 'Échangé {amount} {symbol}',
  actApproved: 'Autorisé {name} à dépenser tes {symbol}',
  actNftIn: 'Reçu 1 NFT de {name}',
  actNftOut: 'Envoyé 1 NFT à {name}',
  actInternal: 'Transfert interne · {amount} {symbol}',
  actInteraction: 'Interaction avec {name}',
  actTo: 'à {name}',
  actFrom: 'de {name}',
  actUnverified: 'Token non vérifié — n’interagis pas avec lui',
  actFailedPrefix: 'Échouée · {what}',
  actFailedBody: 'Rien n’a été débité (sauf les frais réseau). Cause fréquente : frais trop bas ou autorisation manquante.',
};

const tr: ActivityTranslate = (key, params) => {
  let out = FR[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v);
  return out;
};

const ME = '0x28C6c06298d514Db089934071355E5743bf21d60';
const V = '0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F7';
const ctx = { t: tr, nativeSymbol: 'ETH', nativeDecimals: 18, nameOf: (a: string) => (a === V ? 'vitalik.eth' : undefined) };
const base: TxSummary = { chain: 'ethereum', hash: '0x1', from: ME, to: V, value: 10n ** 17n, timestamp: 1_700_000_000, direction: 'out', status: 'success' };

describe('humanizeTx', () => {
  it('envoi natif avec nom', () => {
    const h = humanizeTx(base, ctx);
    expect(h.title).toBe('Envoyé 0.1 ETH');
    expect(h.subtitle).toBe('à vitalik.eth');
    expect(h.amount).toBe('−0.1 ETH');
    expect(h.tone).toBe('down');
  });
  it('réception token', () => {
    const h = humanizeTx({ ...base, from: V, to: ME, direction: 'in', asset: 'USDC', decimals: 6, value: 50_000_000n }, ctx);
    expect(h.title).toBe('Reçu 50 USDC');
    expect(h.subtitle).toBe('de vitalik.eth');
    expect(h.tone).toBe('up');
    expect(h.spam).toBe(false);
  });
  it('token entrant NON vérifié = spam, gris, sans +, sans valeur', () => {
    const h = humanizeTx({ ...base, direction: 'in', from: '0xabc', to: ME, asset: 'PPOLY', decimals: 18, value: 9n * 10n ** 18n }, { ...ctx, verifiedSymbols: new Set(['ETH', 'USDC']), fiatOf: () => '1,00 €' });
    expect(h.spam).toBe(true);
    expect(h.tone).toBe('neutral');
    expect(h.amount).toBe('9 PPOLY');
    expect(h.fiat).toBeUndefined();
  });
  it('contrepartie + fiat sur un envoi', () => {
    const h = humanizeTx(base, { ...ctx, fiatOf: (s, a) => `${(a * 2000).toFixed(2)} €` });
    expect(h.counterparty).toBe(V);
    expect(h.fiat).toBe('200.00 €');
  });
  it('poussière entrante = spam masqué', () => {
    expect(humanizeTx({ ...base, direction: 'in', value: 0n, from: '0xabc', to: ME }, ctx).spam).toBe(true);
  });
  it('approbation, swap, NFT', () => {
    expect(humanizeTx({ ...base, type: 'APPROVE', asset: 'USDC', value: 0n }, ctx).title).toBe('Autorisé vitalik.eth à dépenser tes USDC');
    expect(humanizeTx({ ...base, type: 'SWAP' }, ctx).title).toBe('Échangé 0.1 ETH');
    expect(humanizeTx({ ...base, type: 'NFT', direction: 'in', from: V, to: ME }, ctx).title).toBe('Reçu 1 NFT de vitalik.eth');
  });
  it('échec expliqué', () => {
    const h = humanizeTx({ ...base, status: 'failed' }, ctx);
    /*
     * Le titre est repris tel quel, majuscule comprise. L'ancienne version en
     * minusculait la première lettre — un réflexe de français, sans objet en
     * chinois, en japonais ou en arabe, et qui abîme une phrase allemande
     * commençant par un montant.
     */
    expect(h.title).toBe('Échouée · Envoyé 0.1 ETH');
    expect(h.tone).toBe('danger');
    expect(h.subtitle).toContain('Rien n’a été débité');
  });
  it('groupe par jour', () => {
    const now = Date.UTC(2026, 8, 11, 12);
    const day = 86_400;
    const t = Math.floor(now / 1000);
    const g = groupByDay([{ timestamp: t - 3 * day }, { timestamp: t - 100 }, { timestamp: t - day }, { timestamp: t - 200 }], now);
    expect(g.map((x) => x.label)).toEqual(['Aujourd’hui', 'Hier', expect.any(String)]);
    expect(g[0].items).toHaveLength(2);
    expect(g[0].items[0].timestamp).toBe(t - 100);
  });
});

describe('humanizeTx — liste qui mêle les réseaux', () => {
  /*
   * LE BUG SIGNALÉ. L'accueil agrège l'historique de tous les réseaux, mais le
   * contexte portait les décimales du réseau AFFICHÉ. Un envoi de 1 000
   * satoshis consulté depuis Base ressortait donc divisé par 10^18 et libellé
   * en ETH : ni le montant, ni la monnaie, ni la contre-valeur.
   */
  const natives: Record<string, { symbol: string; decimals: number }> = {
    bitcoin: { symbol: 'BTC', decimals: 8 },
    base: { symbol: 'ETH', decimals: 18 },
    solana: { symbol: 'SOL', decimals: 9 },
  };
  // Contexte d'un écran POSÉ SUR BASE, comme lors du test sur appareil.
  const onBase = {
    t: tr,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativeOf: (c: string) => natives[c],
  };

  it('un envoi Bitcoin garde ses 8 décimales et son symbole, vu depuis Base', () => {
    const tx: TxSummary = { chain: 'bitcoin', hash: 'btc1', from: ME, to: V, value: 1_000n, timestamp: 1, direction: 'out', status: 'success' };
    const h = humanizeTx(tx, onBase);
    expect(h.title).toBe('Envoyé 0.00001 BTC');
    expect(h.amount).toBe('−0.00001 BTC');
  });

  it('un envoi Solana garde ses 9 décimales, vu depuis Base', () => {
    const tx: TxSummary = { chain: 'solana', hash: 'sol1', from: ME, to: V, value: 10_000n, timestamp: 1, direction: 'out', status: 'success' };
    expect(humanizeTx(tx, onBase).title).toBe('Envoyé 0.00001 SOL');
  });

  /*
   * La contre-valeur suivait le mauvais symbole : on cherchait le prix de l'ETH
   * pour un montant en Bitcoin. Elle doit maintenant interroger BTC.
   */
  it('la contre-valeur est demandée pour le symbole de la bonne chaîne', () => {
    const asked: string[] = [];
    const tx: TxSummary = { chain: 'bitcoin', hash: 'btc2', from: ME, to: V, value: 100_000_000n, timestamp: 1, direction: 'out', status: 'success' };
    humanizeTx(tx, { ...onBase, fiatOf: (symbol) => { asked.push(symbol); return undefined; } });
    expect(asked).toEqual(['BTC']);
  });

  it('chaîne inconnue : on retombe sur le contexte au lieu de casser', () => {
    const tx: TxSummary = { chain: 'reseau-retire', hash: 'x', from: ME, to: V, value: 10n ** 17n, timestamp: 1, direction: 'out', status: 'success' };
    expect(humanizeTx(tx, onBase).title).toBe('Envoyé 0.1 ETH');
  });
});

describe('humanizeTx — attente', () => {
  /*
   * Bitcoin codait `success` en dur, si bien qu'une transaction encore dans le
   * mempool s'affichait comme confirmée. `pending` est transversal : il ne
   * remplace ni la nature de l'opération, ni le montant.
   */
  it('une transaction en attente est signalée sans changer son libellé', () => {
    const h = humanizeTx({ ...base, status: 'pending' }, ctx);
    expect(h.pending).toBe(true);
    expect(h.failed).toBe(false);
    expect(h.title).toBe('Envoyé 0.1 ETH');
    expect(h.amount).toBe('−0.1 ETH');
  });

  it('une transaction confirmée ne l’est pas', () => {
    expect(humanizeTx(base, ctx).pending).toBe(false);
  });

  /** Un échec n'est pas une attente : les deux états restent distincts. */
  it('un échec reste un échec, jamais une attente', () => {
    const h = humanizeTx({ ...base, status: 'failed' }, ctx);
    expect(h.failed).toBe(true);
    expect(h.pending).toBe(false);
    expect(h.tone).toBe('danger');
  });
});
