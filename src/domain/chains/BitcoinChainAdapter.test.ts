import { getAdapter } from './registry';
import { BitcoinChainAdapter } from './BitcoinChainAdapter';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { deriveBtcSigner } from '../../crypto/btc';
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

describe('BitcoinChainAdapter — transaction réellement construite et signée', () => {
  /*
   * Ces tests n'étaient pas possibles avant : `@scure/btc-signer` est publié en
   * ESM pur et Jest ne le chargeait pas, si bien que la CONSTRUCTION d'une
   * transaction Bitcoin n'était vérifiée nulle part. On décode ici le hex
   * réellement diffusé, plutôt que de faire confiance au code qui l'a produit.
   */
  const seed = mnemonicToSeedSync(PHRASE);
  const signer = deriveBtcSigner(seed, 0);

  const UTXO = { txid: 'b'.repeat(64), vout: 0, value: 2_000_000, status: { confirmed: true } };
  const FEES = { fastestFee: 40, halfHourFee: 20, hourFee: 10, minimumFee: 1 };

  /** Adapter sans réseau, qui capture le hex diffusé au lieu de l'envoyer. */
  function capture() {
    const a = new BitcoinChainAdapter((getAdapter('bitcoin') as BitcoinChainAdapter).config);
    let hex = '';
    (a as unknown as { fetchJson: unknown }).fetchJson = async (p: string) =>
      p.includes('/utxo') ? [UTXO] : FEES;
    (a as unknown as { broadcastHex: unknown }).broadcastHex = async (h: string) => {
      hex = h;
      return 'TXID';
    };
    return { adapter: a, hex: () => hex };
  }

  /** Décode la transaction diffusée avec la bibliothèque, pas avec notre code. */
  async function decode(hexStr: string) {
    const btc = await import('@scure/btc-signer');
    return btc.Transaction.fromRaw(Buffer.from(hexStr, 'hex'), { allowUnknownOutputs: true });
  }

  it('les entrées sont marquées REMPLAÇABLES (RBF)', async () => {
    /*
     * btc-signer met 0xFFFFFFFF par défaut, ce qui rend la transaction FINALE :
     * une transaction coincée à taux trop faible l'était définitivement, sans
     * aucun recours, ni depuis Kalyx ni par un service tiers.
     */
    const { adapter, hex } = capture();
    await adapter.sendBitcoinDetailed(signer.address, BTC_ADDR_0, '0.001', signer);
    const tx = await decode(hex());
    expect(tx.getInput(0).sequence).toBeLessThan(0xfffffffe);
  });

  it('envoie le bon montant au bon destinataire, et rend la monnaie à soi', async () => {
    const { adapter, hex } = capture();
    const res = await adapter.sendBitcoinDetailed(signer.address, BTC_ADDR_0, '0.001', signer);
    const tx = await decode(hex());

    expect(tx.outputsLength).toBe(2); // destinataire + monnaie
    expect(tx.getOutput(0).amount).toBe(100_000n); // 0,001 BTC
    // Rien ne se perd : entrée = montant + frais + monnaie.
    expect(100_000n + res.fee + BigInt(tx.getOutput(1).amount!)).toBe(BigInt(UTXO.value));
  });

  it('sait envoyer vers une adresse HÉRITÉE (1…), refusée jusqu\'ici', async () => {
    // Le trou d'origine : ces adresses étaient rejetées à la validation, donc
    // impossible de payer une plateforme ou un portefeuille ancien.
    const { adapter, hex } = capture();
    const P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    const res = await adapter.sendBitcoinDetailed(signer.address, P2PKH, '0.001', signer);
    expect(res.to).toBe(P2PKH);
    const tx = await decode(hex());
    // Script P2PKH : OP_DUP OP_HASH160 <20 octets> OP_EQUALVERIFY OP_CHECKSIG.
    const script = tx.getOutput(0).script!;
    expect(script.length).toBe(25);
    expect(script[0]).toBe(0x76);
    expect(script[1]).toBe(0xa9);
    expect(script[24]).toBe(0xac);
  });

  it('sait envoyer vers une adresse P2SH (3…)', async () => {
    const { adapter, hex } = capture();
    const res = await adapter.sendBitcoinDetailed(signer.address, '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', '0.001', signer);
    expect(res.to).toBe('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
    const tx = await decode(hex());
    // Script P2SH : OP_HASH160 <20 octets> OP_EQUAL.
    const script = tx.getOutput(0).script!;
    expect(script.length).toBe(23);
    expect(script[0]).toBe(0xa9);
    expect(script[22]).toBe(0x87);
  });

  it('accepte un bech32 en MAJUSCULES et le normalise', async () => {
    // Forme recommandée pour les QR ; elle repartait telle quelle vers le
    // signeur, qui attend la forme canonique.
    const { adapter } = capture();
    const res = await adapter.sendBitcoinDetailed(signer.address, BTC_ADDR_0.toUpperCase(), '0.001', signer);
    expect(res.to).toBe(BTC_ADDR_0);
  });

  it('le palier choisi change réellement les frais payés', async () => {
    const slow = capture();
    const fast = capture();
    const a = await slow.adapter.sendBitcoinDetailed(signer.address, BTC_ADDR_0, '0.001', signer, { speed: 'slow' });
    const b = await fast.adapter.sendBitcoinDetailed(signer.address, BTC_ADDR_0, '0.001', signer, { speed: 'fast' });
    expect(a.feeRate).toBe(FEES.hourFee);
    expect(b.feeRate).toBe(FEES.fastestFee);
    expect(a.fee).toBeLessThan(b.fee);
  });

  it('l\'accélération reprend les MÊMES entrées et paie strictement plus', async () => {
    const first = capture();
    const sent = await first.adapter.sendBitcoinDetailed(signer.address, BTC_ADDR_0, '0.001', signer, { speed: 'slow' });

    const bump = capture();
    const replaced = await bump.adapter.bumpBitcoinFee(signer.address, sent, signer, { speed: 'fast' });

    expect(replaced.inputs).toEqual(sent.inputs); // condition d'un remplacement valide
    expect(replaced.feeRate).toBeGreaterThan(sent.feeRate);
    expect(replaced.fee).toBeGreaterThan(sent.fee);

    // Le MONTANT ENVOYÉ ne bouge pas : la hausse sort de la monnaie.
    const tx = await decode(bump.hex());
    expect(tx.getOutput(0).amount).toBe(100_000n);
  });
});
