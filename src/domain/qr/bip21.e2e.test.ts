/**
 * BIP-21 de bout en bout : de l'URI scannée à la transaction SIGNÉE.
 *
 * Les autres tests vérifient chaque étage séparément. Celui-ci parcourt la
 * chaîne complète — parseur, intention d'envoi, paramètres de route, adapter,
 * signature — et DÉCODE le hex diffusé. C'est la seule façon de voir qu'un
 * étage ne perd pas ce que le précédent a lu : un montant correctement analysé
 * mais oublié en route donne un parseur qui passe et un paiement faux.
 *
 * Seul le réseau est bouchonné (UTXO et taux de frais). Tout le reste est le
 * code de production.
 */
import { parseQr } from './parse';
import { sendIntentFor } from './route';
import { BitcoinAdapterV2 } from '../chains/v2/BitcoinAdapterV2';
import { BitcoinChainAdapter } from '../chains/BitcoinChainAdapter';
import { BITCOIN } from '../chains/configs';
import { deriveBtcSigner } from '../../crypto/btc';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { parseAmount } from '../validation/amount';
import type { ChainSigner } from '../chains/v2/signer';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const me = deriveBtcSigner(mnemonicToSeedSync(PHRASE), 0);
const signer: ChainSigner = { curve: 'secp256k1', privateKey: me.privateKey, publicKey: me.publicKey };

const FEES = { fastestFee: 40, halfHourFee: 20, hourFee: 10, minimumFee: 1 };
const UTXOS = [{ txid: 'b'.repeat(64), vout: 0, value: 5_000_000, status: { confirmed: true } }];

function adapter() {
  const v1 = new BitcoinChainAdapter(BITCOIN);
  let hex = '';
  (v1 as unknown as { fetchJson: unknown }).fetchJson = async (p: string) =>
    p.includes('/utxo') ? UTXOS : FEES;
  (v1 as unknown as { broadcastHex: unknown }).broadcastHex = async (h: string) => {
    hex = h;
    return 'TXID';
  };
  return { a: new BitcoinAdapterV2(BITCOIN, v1), hex: () => hex };
}

/** Décode avec la bibliothèque, pas avec notre code. */
async function decode(hex: string) {
  const btc = await import('@scure/btc-signer');
  return btc.Transaction.fromRaw(Buffer.from(hex, 'hex'), { allowUnknownOutputs: true });
}

/** Parcourt la chaîne complète pour une URI BIP-21 donnée. */
async function payFromUri(uri: string) {
  const parsed = parseQr(uri);
  expect(parsed.kind).toBe('bitcoin-uri');
  const intent = sendIntentFor(parsed);
  expect(intent).not.toBeNull();

  // L'écran d'envoi convertit le montant décimal en unités de base.
  const amount = parseAmount(intent!.amount!, 8).raw;

  const { a, hex } = adapter();
  const draft = await a.prepareSend(me.address, { to: intent!.to, amount });
  const signed = await a.signSend(draft, signer);
  await a.broadcastSend(signed);
  return { parsed, intent: intent!, draft, tx: await decode(hex()) };
}

describe('BIP-21 de bout en bout', () => {
  it('bech32 : le montant de l’URI arrive intact dans la transaction signée', async () => {
    const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    const { intent, draft, tx } = await payFromUri(`bitcoin:${DEST}?amount=0.005`);

    expect(intent.to).toBe(DEST);
    expect(intent.amount).toBe('0.005');
    expect(draft.amount).toBe(500_000n); // 0,005 BTC
    expect(tx.getOutput(0).amount).toBe(500_000n);
    // Rien ne se perd : entrée = montant + frais + monnaie.
    expect(500_000n + draft.fee + BigInt(tx.getOutput(1).amount!)).toBe(5_000_000n);
  });

  it('adresse HÉRITÉE : script P2PKH construit, pas seulement accepté', async () => {
    /*
     * Le trou d'origine : ces adresses étaient refusées à la validation. Ici on
     * vérifie que le script réellement diffusé est bien un P2PKH.
     */
    const { tx } = await payFromUri('bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.001');
    const script = tx.getOutput(0).script!;
    expect(script.length).toBe(25);
    expect(script[0]).toBe(0x76); // OP_DUP
    expect(script[24]).toBe(0xac); // OP_CHECKSIG
  });

  it('adresse P2SH : script OP_HASH160 … OP_EQUAL', async () => {
    const { tx } = await payFromUri('bitcoin:3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy?amount=0.001');
    const script = tx.getOutput(0).script!;
    expect(script.length).toBe(23);
    expect(script[0]).toBe(0xa9);
    expect(script[22]).toBe(0x87);
  });

  it('bech32 en MAJUSCULES (la forme des QR) : normalisé jusqu’au signeur', async () => {
    const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    const { intent, draft } = await payFromUri(`bitcoin:${DEST.toUpperCase()}?amount=0.001`);
    expect(intent.to).toBe(DEST);
    expect(draft.to).toBe(DEST);
  });

  it('label et message remontent pour l’affichage, sans toucher la transaction', async () => {
    const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    const { intent, tx } = await payFromUri(
      `bitcoin:${DEST}?amount=0.002&label=Caf%C3%A9%20Nova&message=Table%2012`,
    );
    expect(intent.payee).toBe('Café Nova');
    expect(intent.note).toBe('Table 12');
    // Bitcoin n'inscrit rien de tout cela en chaîne : deux sorties, pas trois.
    expect(tx.outputsLength).toBe(2);
  });

  it('les entrées sont remplaçables : une transaction coincée reste accélérable', async () => {
    const { tx } = await payFromUri('bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.001');
    expect(tx.getInput(0).sequence).toBeLessThan(0xfffffffe);
  });

  it('formes de montant tolérées par l’ABNF : `.5` et `5.`', async () => {
    /*
     * `*digit [ "." *digit ]` : zéro ou plus de part et d'autre du point. Les
     * rejeter faisait disparaître le montant en silence.
     */
    const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    const a = parseQr(`bitcoin:${DEST}?amount=.02`);
    const b = parseQr(`bitcoin:${DEST}?amount=2.`);
    if (a.kind !== 'bitcoin-uri' || b.kind !== 'bitcoin-uri') throw new Error('type inattendu');
    expect(a.amount).toBe('.02');
    expect(b.amount).toBe('2.');
    // Et l'écran sait les convertir.
    expect(parseAmount('.02', 8).raw).toBe(2_000_000n);
  });
});

describe('BIP-21 — ce qui doit être refusé ou signalé', () => {
  const DEST = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

  it('`req-` inconnu en minuscules → URI invalide, comme l’exige la spec', () => {
    // « Si un client n'implémente aucune variable préfixée req-, il DOIT
    // considérer l'URI entière comme invalide. »
    expect(parseQr(`bitcoin:${DEST}?amount=0.01&req-fiat=EUR`).kind).toBe('invalid');
  });

  it('`REQ-` en majuscules N’EST PAS une exigence : les clés sont sensibles à la casse', () => {
    /*
     * La spec est explicite sur ce point, et l'ABNF fixe le préfixe littéral
     * `req-`. Mettre la clé en minuscules faisait refuser une URI valide — un
     * paiement bloqué pour rien.
     */
    const r = parseQr(`bitcoin:${DEST}?amount=0.01&REQ-fiat=EUR`);
    expect(r.kind).toBe('bitcoin-uri');
    if (r.kind === 'bitcoin-uri') expect(r.amount).toBe('0.01');
  });

  it('un paramètre inconnu sans préfixe est IGNORÉ, pas bloquant', () => {
    const r = parseQr(`bitcoin:${DEST}?amount=0.01&somethingyoudontunderstand=50`);
    expect(r.kind).toBe('bitcoin-uri');
    if (r.kind === 'bitcoin-uri') expect(r.amount).toBe('0.01');
  });

  it('QR unifié sans adresse en chaîne : on DIT que seul Lightning est proposé', () => {
    // La spec autorise une adresse vide. Répondre « QR non reconnu » laissait
    // croire que le scanner était cassé.
    expect(parseQr('bitcoin:?lightning=lnbc1p3xyz').kind).toBe('lightning-only');
    expect(parseQr('bitcoin:?lno=lno1zrxyz').kind).toBe('lightning-only');
  });

  it('QR unifié AVEC adresse : on paie en chaîne et on ignore Lightning', () => {
    const r = parseQr(`bitcoin:${DEST}?amount=0.01&lightning=lnbc1p3xyz`);
    expect(r.kind).toBe('bitcoin-uri');
    if (r.kind === 'bitcoin-uri') expect(r.address).toBe(DEST);
  });

  it('une adresse vide SANS offre Lightning reste invalide', () => {
    expect(parseQr('bitcoin:?amount=0.01').kind).toBe('invalid');
    expect(parseQr('bitcoin:').kind).toBe('invalid');
  });

  it('montant nul, négatif ou non numérique : ignoré, jamais inventé', () => {
    for (const amount of ['0', '-1', 'abc', '.', '0.0']) {
      const r = parseQr(`bitcoin:${DEST}?amount=${amount}`);
      if (r.kind !== 'bitcoin-uri') throw new Error(`type inattendu pour ${amount}`);
      expect(r.amount).toBeUndefined();
    }
  });

  it('montant sous le seuil de poussière : refusé AVANT la signature', async () => {
    const parsed = parseQr(`bitcoin:${DEST}?amount=0.00000100`); // 100 sats
    const intent = sendIntentFor(parsed)!;
    const { a } = adapter();
    await expect(
      a.prepareSend(me.address, { to: intent.to, amount: parseAmount(intent.amount!, 8).raw }),
    ).rejects.toMatchObject({ code: 'AMOUNT_TOO_SMALL' });
  });
});
