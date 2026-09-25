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

  it('envoi : le montant est ce que le destinataire reçoit, frais exclus', () => {
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
    /*
     * 70 000 partent vers OTHER, 29 000 reviennent en monnaie, 1 000 de frais.
     * On rendait le débit net (71 000), donc un envoi de 70 000 s'affichait
     * 71 000 : un montant que l'utilisateur n'a jamais saisi.
     */
    expect(r.value).toBe(70_000n);
    expect(r.status).toBe('success');
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

describe('parseBtcTx — attente et horodatage', () => {
  const NOW = 1_800_000_000_000; // ms

  /*
   * Une transaction du mempool était annoncée « réussie » et datée de 1970 : le
   * repli d'horodatage valait 0. Elle passait donc en dernier au tri par date,
   * hors des cinq lignes de l'accueil — l'envoi qu'on venait de faire était le
   * seul absent de sa propre liste.
   */
  it('non confirmée : statut en attente et horodatage à maintenant', () => {
    const tx: BtcTxResponse = {
      txid: 'mempool1',
      status: { confirmed: false },
      vin: [{ prevout: { scriptpubkey_address: ME, value: 100_000 } }],
      vout: [
        { scriptpubkey_address: OTHER, value: 70_000 },
        { scriptpubkey_address: ME, value: 29_000 },
      ],
    };
    const r = parseBtcTx(ME, tx, NOW)!;
    expect(r.status).toBe('pending');
    expect(r.timestamp).toBe(Math.floor(NOW / 1000));
  });

  it('confirmée : l’horodatage du bloc prime sur l’instant présent', () => {
    const tx: BtcTxResponse = {
      txid: 'bloc1',
      status: { confirmed: true, block_time: 1_700_000_000 },
      vin: [{ prevout: { scriptpubkey_address: OTHER, value: 10_000 } }],
      vout: [{ scriptpubkey_address: ME, value: 9_000 }],
    };
    expect(parseBtcTx(ME, tx, NOW)!.timestamp).toBe(1_700_000_000);
  });

  /*
   * Consolidation : nos entrées sont dépensées, tout revient chez nous, seuls
   * les frais sortent. L'annoncer comme un envoi de la valeur des frais serait
   * faux — c'est un mouvement interne.
   */
  it('consolidation : mouvement interne, pas un envoi du montant des frais', () => {
    const tx: BtcTxResponse = {
      txid: 'consol',
      status: { confirmed: true, block_time: 1_700_000_200 },
      vin: [
        { prevout: { scriptpubkey_address: ME, value: 40_000 } },
        { prevout: { scriptpubkey_address: ME, value: 30_000 } },
      ],
      vout: [{ scriptpubkey_address: ME, value: 69_000 }],
    };
    const r = parseBtcTx(ME, tx, NOW)!;
    expect(r.direction).toBe('self');
    expect(r.value).toBe(69_000n);
  });

  /** Envoi groupé : le montant est la somme de ce qui sort. */
  it('deux destinataires : le montant additionne les sorties externes', () => {
    const THIRD = 'bc1qthird000000000000000000000000000000000';
    const tx: BtcTxResponse = {
      txid: 'batch',
      status: { confirmed: true, block_time: 1_700_000_300 },
      vin: [{ prevout: { scriptpubkey_address: ME, value: 100_000 } }],
      vout: [
        { scriptpubkey_address: OTHER, value: 40_000 },
        { scriptpubkey_address: THIRD, value: 25_000 },
        { scriptpubkey_address: ME, value: 34_000 },
      ],
    };
    const r = parseBtcTx(ME, tx, NOW)!;
    expect(r.direction).toBe('out');
    expect(r.value).toBe(65_000n);
    expect(r.to).toBe(OTHER);
  });
});
