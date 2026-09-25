import { getAdapter } from './registry';
import { BitcoinChainAdapter } from './BitcoinChainAdapter';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { isWalletError } from '../errors';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const BTC_ADDR_0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

describe('BitcoinChainAdapter', () => {
  const adapter = getAdapter('bitcoin');
  const seed = mnemonicToSeedSync(PHRASE);

  it('est enregistré dans le registre', () => {
    expect(adapter).toBeInstanceOf(BitcoinChainAdapter);
    expect(adapter.config.nativeSymbol).toBe('BTC');
    expect(adapter.config.nativeDecimals).toBe(8);
  });

  it('dérive l’adresse BIP-84 de référence', () => {
    expect(adapter.deriveAccount(seed, 0).address).toBe(BTC_ADDR_0);
  });

  it('buildTransfer valide l’envoi hors-ligne (adresse + montant)', () => {
    // Adresse + montant valides → intention (value en satoshis, evmChainId=0).
    const intent = adapter.buildTransfer({ to: BTC_ADDR_0, amount: '0.001' });
    expect(intent.value).toBe(100000n); // 0.001 BTC = 100 000 sats
    expect(intent.to).toBe(BTC_ADDR_0);

    // Adresse invalide → INVALID_ADDRESS.
    try {
      adapter.buildTransfer({ to: '0xNotBitcoin', amount: '0.001' });
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e) && e.code).toBe('INVALID_ADDRESS');
    }
  });

  it('les méthodes EVM génériques ne servent pas à l’envoi BTC', async () => {
    // L'envoi BTC passe par sendBitcoin ; prepare/sign/broadcast lèvent.
    await expect(adapter.broadcast('0x00')).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('getHistory renvoie [] (réception seulement pour l’instant)', async () => {
    await expect(adapter.getHistory('bc1qxyz')).resolves.toEqual([]);
  });
});

describe('BitcoinChainAdapter — paliers de frais et remplacement', () => {
  const BTC = new BitcoinChainAdapter(
    (getAdapter('bitcoin') as BitcoinChainAdapter).config,
  );

  /** Adapter dont chaque appel HTTP est fourni par le test, sans réseau. */
  function stub(fetchJson: (path: string) => unknown) {
    const a = new BitcoinChainAdapter(BTC.config);
    (a as unknown as { fetchJson: unknown }).fetchJson = async (p: string) => fetchJson(p);
    return a;
  }

  it('getFeeRates expose trois paliers issus du réseau', () => {
    // Avant : une seule valeur lue (halfHourFee), aucun choix de vitesse.
    const a = stub(() => ({ fastestFee: 40, halfHourFee: 22, hourFee: 12, minimumFee: 1 }));
    return expect(a.getFeeRates()).resolves.toEqual({ slow: 12, normal: 22, fast: 40 });
  });

  it('getFeeRates retombe sur le repli si l\'API échoue, sans lever', async () => {
    const a = stub(() => {
      throw new Error('502');
    });
    const r = await a.getFeeRates();
    expect(r.slow).toBeLessThanOrEqual(r.normal);
    expect(r.normal).toBeLessThanOrEqual(r.fast);
  });

  it('bumpBitcoinFee refuse une transaction dont on ignore les entrées', async () => {
    // Sans les entrées originales, aucun remplacement valide n'est possible.
    const a = stub(() => ({}));
    await expect(
      a.bumpBitcoinFee(
        BTC_ADDR_0,
        { to: BTC_ADDR_0, target: 10_000n, feeRate: 5, inputs: [] },
        { privateKey: new Uint8Array(32), publicKey: new Uint8Array(33) },
      ),
    ).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('bumpBitcoinFee refuse si la monnaie ne couvre pas la hausse', async () => {
    /*
     * On n'accélère JAMAIS en rognant le montant envoyé : l'utilisateur a
     * demandé à accélérer un paiement, pas à en changer la valeur.
     */
    const a = stub(() => ({ fastestFee: 500, halfHourFee: 400, hourFee: 300 }));
    await expect(
      a.bumpBitcoinFee(
        BTC_ADDR_0,
        // Entrée à peine plus grande que le montant : aucune marge de frais.
        { to: BTC_ADDR_0, target: 10_000n, feeRate: 1, inputs: [{ txid: 'a'.repeat(64), vout: 0, value: 10_100 }] },
        { privateKey: new Uint8Array(32), publicKey: new Uint8Array(33) },
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('bumpBitcoinFee refuse quand le taux est déjà au plafond', async () => {
    const a = stub(() => ({ fastestFee: 2_000, halfHourFee: 2_000, hourFee: 2_000 }));
    await expect(
      a.bumpBitcoinFee(
        BTC_ADDR_0,
        { to: BTC_ADDR_0, target: 1_000n, feeRate: 2_000, inputs: [{ txid: 'a'.repeat(64), vout: 0, value: 10_000_000 }] },
        { privateKey: new Uint8Array(32), publicKey: new Uint8Array(33) },
      ),
    ).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });

  it('bumpBitcoinFee refuse une adresse de destination invalide', async () => {
    const a = stub(() => ({}));
    await expect(
      a.bumpBitcoinFee(
        BTC_ADDR_0,
        { to: 'pas-une-adresse', target: 1_000n, feeRate: 5, inputs: [{ txid: 'a'.repeat(64), vout: 0, value: 100_000 }] },
        { privateKey: new Uint8Array(32), publicKey: new Uint8Array(33) },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('sendBitcoinDetailed refuse un solde insuffisant AVANT de signer', async () => {
    const a = stub((path) =>
      path.includes('/utxo')
        ? [{ txid: 'a'.repeat(64), vout: 0, value: 500, status: { confirmed: true } }]
        : { fastestFee: 40, halfHourFee: 22, hourFee: 12 },
    );
    await expect(
      a.sendBitcoinDetailed(BTC_ADDR_0, BTC_ADDR_0, '0.001', {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(33),
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('sendBitcoinDetailed applique le palier demandé', async () => {
    // Le palier « lent » doit réellement sélectionner un taux plus bas : sinon
    // le choix offert à l'utilisateur serait décoratif.
    const utxos = [{ txid: 'a'.repeat(64), vout: 0, value: 1_000_000, status: { confirmed: true } }];
    const fees = { fastestFee: 40, halfHourFee: 22, hourFee: 12, minimumFee: 1 };
    const seen: number[] = [];
    for (const speed of ['slow', 'fast'] as const) {
      const a = stub((path) => (path.includes('/utxo') ? utxos : fees));
      // On intercepte juste avant la signature pour lire le taux retenu.
      (a as unknown as { signAndBroadcast: unknown }).signAndBroadcast = async (
        _from: string,
        _dest: string,
        _target: bigint,
        selection: { fee: bigint },
      ) => {
        seen.push(Number(selection.fee));
        return 'txid';
      };
      await a.sendBitcoinDetailed(BTC_ADDR_0, BTC_ADDR_0, '0.001', {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(33),
      }, { speed });
    }
    expect(seen[0]).toBeLessThan(seen[1]); // slow coûte moins que fast
  });
});
