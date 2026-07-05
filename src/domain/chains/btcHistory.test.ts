import { parseBtcTx, type BtcTxResponse } from './btcHistory';

const ME = 'bc1qme00000000000000000000000000000000000';
const OTHER = 'bc1qother0000000000000000000000000000000000';

describe('parseBtcTx', () => {
  it('réception : sortie vers moi → direction in', () => {
    const tx: BtcTxResponse = {
      txid: 'abc',
      status: { confirmed: true, block_time: 1_700_000_000 },
      vin: [{ prevout: { scriptpubkey_address: OTHER, value: 100_000 } }],
      vout: [
        { scriptpubkey_address: ME, value: 60_000 },
        { scriptpubkey_address: OTHER, value: 39_000 }, // monnaie rendue à l'expéditeur
      ],
    };
    const r = parseBtcTx(ME, tx)!;
    expect(r.direction).toBe('in');
    expect(r.to).toBe(ME);
    expect(r.from).toBe(OTHER);
    expect(r.value).toBe(60_000n);
    expect(r.timestamp).toBe(1_700_000_000);
  });

  it('envoi : mon entrée dépensée, montant net = ce qui part', () => {
    const tx: BtcTxResponse = {
      txid: 'def',
      status: { confirmed: true, block_time: 1_700_000_100 },
      vin: [{ prevout: { scriptpubkey_address: ME, value: 100_000 } }],
      vout: [
        { scriptpubkey_address: OTHER, value: 70_000 }, // destinataire
        { scriptpubkey_address: ME, value: 29_000 }, // monnaie rendue à moi
      ],
    };
    const r = parseBtcTx(ME, tx)!;
    expect(r.direction).toBe('out');
    expect(r.from).toBe(ME);
    expect(r.to).toBe(OTHER);
    // net = reçu(29_000) - dépensé(100_000) = -71_000 → value 71_000 (inclut les frais)
    expect(r.value).toBe(71_000n);
  });

  it('adresse non impliquée → null', () => {
    const tx: BtcTxResponse = {
      txid: 'ghi',
      vin: [{ prevout: { scriptpubkey_address: OTHER, value: 1 } }],
      vout: [{ scriptpubkey_address: OTHER, value: 1 }],
    };
    expect(parseBtcTx(ME, tx)).toBeNull();
  });

  it('sans txid → null', () => {
    expect(parseBtcTx(ME, { txid: '' } as BtcTxResponse)).toBeNull();
  });
});
