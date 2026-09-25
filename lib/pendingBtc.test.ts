jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

import { usePendingBtc } from './pendingBtc';
import type { BtcSendResult } from '../src';

const ADDR = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const OTHER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const utxo = (txid: string, vout = 0, value = 100_000) => ({ txid, vout, value });

const sent = (over: Partial<BtcSendResult> = {}): BtcSendResult => ({
  txid: 'tx1',
  to: OTHER,
  target: 50_000n,
  feeRate: 5,
  fee: 700n,
  inputs: [utxo('a'.repeat(64))],
  ...over,
});

beforeEach(() => usePendingBtc.setState({ txs: [] }));

describe('usePendingBtc', () => {
  it('mémorise un envoi avec ses ENTRÉES — sans elles, aucun remplacement possible', () => {
    /*
     * Les UTXO dépensés disparaissent de l'ensemble des UTXO disponibles dès la
     * diffusion : on ne peut donc pas les retrouver après coup, et un
     * remplacement BIP-125 doit reprendre exactement les mêmes.
     */
    usePendingBtc.getState().remember(ADDR, sent());
    const [tx] = usePendingBtc.getState().txs;
    expect(tx.txid).toBe('tx1');
    expect(tx.inputs).toHaveLength(1);
    // bigint sérialisé en chaîne : JSON ne sait pas les porter.
    expect(tx.target).toBe('50000');
    expect(tx.fee).toBe('700');
  });

  it('évince l\'originale quand un remplacement dépense les mêmes entrées', () => {
    // Sinon on proposerait d'accélérer une transaction déjà remplacée, dont la
    // diffusion serait rejetée par les nœuds.
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'original', feeRate: 5 }));
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'remplacement', feeRate: 12 }));
    const txs = usePendingBtc.getState().txs;
    expect(txs).toHaveLength(1);
    expect(txs[0].txid).toBe('remplacement');
  });

  it('garde côte à côte deux envois qui ne partagent aucune entrée', () => {
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'un', inputs: [utxo('a'.repeat(64))] }));
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'deux', inputs: [utxo('b'.repeat(64))] }));
    expect(usePendingBtc.getState().txs.map((t) => t.txid)).toEqual(['deux', 'un']);
  });

  it('un même txid n\'est jamais dupliqué', () => {
    usePendingBtc.getState().remember(ADDR, sent());
    usePendingBtc.getState().remember(ADDR, sent());
    expect(usePendingBtc.getState().txs).toHaveLength(1);
  });

  it('bumpable ne rend que les transactions DE CE compte', () => {
    // Une entrée d'un autre compte n'est pas signable avec la clé courante.
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'mien', inputs: [utxo('a'.repeat(64))] }));
    usePendingBtc.getState().remember(OTHER, sent({ txid: 'autre', inputs: [utxo('b'.repeat(64))] }));
    expect(usePendingBtc.getState().bumpable(ADDR).map((t) => t.txid)).toEqual(['mien']);
    expect(usePendingBtc.getState().bumpable(OTHER).map((t) => t.txid)).toEqual(['autre']);
  });

  it('bumpable ignore une transaction sans entrées connues', () => {
    usePendingBtc.getState().remember(ADDR, sent({ inputs: [] }));
    expect(usePendingBtc.getState().bumpable(ADDR)).toHaveLength(0);
  });

  it('oublie les transactions trop vieilles pour être accélérées', () => {
    /*
     * Au-delà de quelques jours, la transaction est confirmée ou évincée du
     * mempool : garder l'entrée ferait afficher un bouton qui ne peut qu'échouer.
     */
    const old = Date.now() - 4 * 24 * 60 * 60 * 1000;
    usePendingBtc.setState({
      txs: [
        { txid: 'vieille', from: ADDR, to: OTHER, target: '1', fee: '1', feeRate: 5, inputs: [utxo('c'.repeat(64))], at: old },
      ],
    });
    expect(usePendingBtc.getState().bumpable(ADDR)).toHaveLength(0);
  });

  it('forget retire une transaction précise', () => {
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'un', inputs: [utxo('a'.repeat(64))] }));
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'deux', inputs: [utxo('b'.repeat(64))] }));
    usePendingBtc.getState().forget('un');
    expect(usePendingBtc.getState().txs.map((t) => t.txid)).toEqual(['deux']);
  });

  it('les plus récentes d\'abord', () => {
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'un', inputs: [utxo('a'.repeat(64))] }));
    usePendingBtc.getState().remember(ADDR, sent({ txid: 'deux', inputs: [utxo('b'.repeat(64))] }));
    const list = usePendingBtc.getState().bumpable(ADDR);
    expect(list[0].at).toBeGreaterThanOrEqual(list[1].at);
  });
});
