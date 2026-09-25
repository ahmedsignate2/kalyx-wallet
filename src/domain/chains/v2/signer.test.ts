import { wipeSigner, withSigner, assertCurve, type ChainSigner } from './signer';

const secp = (): ChainSigner => ({
  curve: 'secp256k1',
  privateKey: Uint8Array.from({ length: 32 }, (_, i) => i + 1),
  publicKey: new Uint8Array(33).fill(2),
});

const ed = (): ChainSigner => ({
  curve: 'ed25519',
  secretKey: Uint8Array.from({ length: 64 }, (_, i) => i + 1),
  publicKey: new Uint8Array(32).fill(3),
});

describe('wipeSigner', () => {
  it('efface la clé privée secp256k1', () => {
    const s = secp();
    wipeSigner(s);
    expect(Array.from((s as { privateKey: Uint8Array }).privateKey).every((b) => b === 0)).toBe(true);
  });

  it('efface la clé secrète ed25519', () => {
    const s = ed();
    wipeSigner(s);
    expect(Array.from((s as { secretKey: Uint8Array }).secretKey).every((b) => b === 0)).toBe(true);
  });

  it('laisse la clé PUBLIQUE intacte : elle n\'est pas un secret', () => {
    const s = secp();
    wipeSigner(s);
    expect(Array.from(s.publicKey).every((b) => b === 2)).toBe(true);
  });
});

describe('withSigner', () => {
  it('efface après un succès', async () => {
    const s = secp();
    const vu = await withSigner(s, async (x) => Array.from((x as { privateKey: Uint8Array }).privateKey)[0]);
    expect(vu).toBe(1); // la clé était lisible PENDANT
    expect((s as { privateKey: Uint8Array }).privateKey[0]).toBe(0); // plus après
  });

  it('efface aussi quand la signature ÉCHOUE', async () => {
    /*
     * C'est tout l'intérêt de la forme : le chemin d'erreur est celui qu'on
     * oublie, et c'est celui où la clé resterait en mémoire le plus longtemps.
     */
    const s = ed();
    await expect(
      withSigner(s, async () => {
        throw new Error('réseau indisponible');
      }),
    ).rejects.toThrow('réseau indisponible');
    expect(Array.from((s as { secretKey: Uint8Array }).secretKey).every((b) => b === 0)).toBe(true);
  });
});

describe('assertCurve', () => {
  it('laisse passer la bonne courbe', () => {
    expect(() => assertCurve(secp(), 'secp256k1')).not.toThrow();
    expect(() => assertCurve(ed(), 'ed25519')).not.toThrow();
  });

  it('refuse un signataire de la mauvaise courbe', () => {
    /*
     * Le store choisit la dérivation d'après la famille de la chaîne. Une erreur
     * d'aiguillage produirait une signature valide sur la MAUVAISE courbe :
     * transaction rejetée, ou signée par une clé qui n'est pas celle du compte
     * affiché. Le typage ne suffit pas, l'aiguillage se fait à l'exécution.
     */
    expect(() => assertCurve(ed(), 'secp256k1')).toThrow(/ed25519.*secp256k1/);
    expect(() => assertCurve(secp(), 'ed25519')).toThrow(/secp256k1.*ed25519/);
  });
});
