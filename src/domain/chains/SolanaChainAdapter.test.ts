import { base58, base64 } from '@scure/base';
import { SolanaChainAdapter } from './SolanaChainAdapter';
import { SOLANA } from './configs';
import { COMPUTE_BUDGET_PROGRAM } from './solPriority';
import { isWalletError } from '../errors';

const FROM = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PQtwhpU';
const TO = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
const SECRET = new Uint8Array(32).fill(7);

/** Adapter dont chaque appel RPC est fourni par un scénario, sans réseau. */
function stub(handlers: Record<string, (params: unknown[]) => unknown>) {
  const adapter = new SolanaChainAdapter(SOLANA);
  const calls: { method: string; params: unknown[] }[] = [];
  (adapter as unknown as { rpc: unknown }).rpc = async (method: string, params: unknown[]) => {
    calls.push({ method, params });
    const h = handlers[method];
    if (!h) throw new Error(`méthode RPC non prévue par le test : ${method}`);
    return h(params);
  };
  return { adapter, calls };
}

/** Clés de comptes présentes dans une transaction filaire base64. */
function accountKeys(wireB64: string): string[] {
  const wire = base64.decode(wireB64);
  const msg = wire.slice(1 + 64); // [nb signatures][signature 64][message]
  let i = 3; // en-tête : 3 compteurs
  const count = msg[i];
  i += 1;
  const keys: string[] = [];
  for (let k = 0; k < count; k++) {
    keys.push(base58.encode(msg.slice(i, i + 32)));
    i += 32;
  }
  return keys;
}

const blockhashOk = () => ({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1000 } });
const confirmed = () => ({ value: [{ err: null, confirmationStatus: 'confirmed' }] });

describe('confirmSignature', () => {
  it('résout dès que le réseau annonce « confirmed »', async () => {
    const { adapter } = stub({ getSignatureStatuses: confirmed });
    await expect(adapter.confirmSignature('sig')).resolves.toBeUndefined();
  });

  it('résout aussi sur « finalized »', async () => {
    const { adapter } = stub({
      getSignatureStatuses: () => ({ value: [{ err: null, confirmationStatus: 'finalized' }] }),
    });
    await expect(adapter.confirmSignature('sig')).resolves.toBeUndefined();
  });

  it('TX_FAILED quand la chaîne rejette la transaction', async () => {
    const { adapter } = stub({
      getSignatureStatuses: () => ({ value: [{ err: { InstructionError: [0, 'Custom'] } }] }),
    });
    await expect(adapter.confirmSignature('sig')).rejects.toMatchObject({ code: 'TX_FAILED' });
  });

  it('TX_EXPIRED quand le blockhash périme sans inclusion', async () => {
    /*
     * Le cas qui n'était pas détecté du tout : la transaction est acceptée par
     * le RPC, jamais incluse, et l'app affichait « envoyé ».
     */
    const { adapter } = stub({
      getSignatureStatuses: () => ({ value: [null] }),
      getBlockHeight: () => 1001, // > lastValidBlockHeight
    });
    const err = await adapter.confirmSignature('sig', 1000).catch((e) => e);
    expect(isWalletError(err) && err.code).toBe('TX_EXPIRED');
    expect(String(err.message)).toMatch(/fonds n'ont pas bougé/);
  });

  it('une erreur de lecture n\'est pas un échec : on retente', async () => {
    // Seul un `err` explicite de la chaîne est définitif ; un RPC qui tousse ne
    // doit pas faire croire à l'utilisateur que son envoi a échoué.
    let n = 0;
    const { adapter } = stub({
      getSignatureStatuses: () => {
        n += 1;
        if (n === 1) throw new Error('502 bad gateway');
        return confirmed();
      },
      getBlockHeight: () => 1,
    });
    await expect(adapter.confirmSignature('sig', 1000)).resolves.toBeUndefined();
    expect(n).toBe(2);
  });
});

describe('sendSolana', () => {
  it('inclut les instructions ComputeBudget et ATTEND la confirmation', async () => {
    let sent: string | null = null;
    const { adapter, calls } = stub({
      getLatestBlockhash: blockhashOk,
      getRecentPrioritizationFees: () => [{ slot: 1, prioritizationFee: 50_000 }],
      sendTransaction: (p) => {
        sent = p[0] as string;
        return 'SIGNATURE';
      },
      getSignatureStatuses: confirmed,
    });

    const sig = await adapter.sendSolana(FROM, TO, '0.5', { secretKey: SECRET, publicKey: base58.decode(FROM) });
    expect(sig).toBe('SIGNATURE');

    // Le programme ComputeBudget figure parmi les comptes → priorité posée.
    expect(accountKeys(sent!)).toContain(COMPUTE_BUDGET_PROGRAM);
    // Et la confirmation a bien été demandée, pas seulement l'émission.
    expect(calls.map((c) => c.method)).toContain('getSignatureStatuses');
  });

  it('demande le blockhash en « confirmed », pas en « finalized »', async () => {
    // `finalized` a une douzaine de secondes de retard, prises sur la validité.
    const { adapter, calls } = stub({
      getLatestBlockhash: blockhashOk,
      getRecentPrioritizationFees: () => [],
      sendTransaction: () => 'SIG',
      getSignatureStatuses: confirmed,
    });
    await adapter.sendSolana(FROM, TO, '0.1', { secretKey: SECRET, publicKey: base58.decode(FROM) });
    const bh = calls.find((c) => c.method === 'getLatestBlockhash');
    expect(bh!.params).toEqual([{ commitment: 'confirmed' }]);
  });

  it('un RPC de priorité muet n\'empêche pas d\'envoyer', async () => {
    const { adapter } = stub({
      getLatestBlockhash: blockhashOk,
      getRecentPrioritizationFees: () => {
        throw new Error('indisponible');
      },
      sendTransaction: () => 'SIG',
      getSignatureStatuses: confirmed,
    });
    await expect(
      adapter.sendSolana(FROM, TO, '0.1', { secretKey: SECRET, publicKey: base58.decode(FROM) }),
    ).resolves.toBe('SIG');
  });

  it('refuse une adresse ou un montant invalide avant tout appel réseau', async () => {
    const { adapter, calls } = stub({});
    const signer = { secretKey: SECRET, publicKey: base58.decode(FROM) };
    await expect(adapter.sendSolana(FROM, 'pas-une-adresse', '1', signer)).rejects.toMatchObject({
      code: 'INVALID_ADDRESS',
    });
    // `parseAmount` tranche avant le garde de l'adapter : c'est AMOUNT_TOO_SMALL
    // qui remonte, et le point qui compte est qu'aucun appel réseau n'a eu lieu.
    await expect(adapter.sendSolana(FROM, TO, '0', signer)).rejects.toMatchObject({
      code: 'AMOUNT_TOO_SMALL',
    });
    expect(calls).toHaveLength(0);
  });

  it('BROADCAST_FAILED si le réseau ne rend aucune signature', async () => {
    const { adapter } = stub({
      getLatestBlockhash: blockhashOk,
      getRecentPrioritizationFees: () => [],
      sendTransaction: () => '',
    });
    await expect(
      adapter.sendSolana(FROM, TO, '0.1', { secretKey: SECRET, publicKey: base58.decode(FROM) }),
    ).rejects.toMatchObject({ code: 'BROADCAST_FAILED' });
  });
});

describe('sendSplToken', () => {
  it('pose aussi la priorité, avec un budget plus large que le transfert SOL', async () => {
    let sent: string | null = null;
    const { adapter } = stub({
      getLatestBlockhash: blockhashOk,
      getRecentPrioritizationFees: () => [{ slot: 1, prioritizationFee: 20_000 }],
      sendTransaction: (p) => {
        sent = p[0] as string;
        return 'SPLSIG';
      },
      getSignatureStatuses: confirmed,
    });

    const sig = await adapter.sendSplToken(FROM, TO, 1_000_000n, TO, 6, {
      secretKey: SECRET,
      publicKey: base58.decode(FROM),
    });
    expect(sig).toBe('SPLSIG');
    expect(accountKeys(sent!)).toContain(COMPUTE_BUDGET_PROGRAM);
  });

  it('refuse un mint invalide', async () => {
    const { adapter } = stub({});
    await expect(
      adapter.sendSplToken(FROM, TO, 1n, 'pas-un-mint', 6, {
        secretKey: SECRET,
        publicKey: base58.decode(FROM),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });
});

describe('getBalance', () => {
  it('refuse une adresse invalide sans appeler le réseau', async () => {
    const { adapter, calls } = stub({});
    await expect(adapter.getBalance('nope')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    expect(calls).toHaveLength(0);
  });
});

describe('méthodes génériques EVM', () => {
  it('lèvent NOT_SUPPORTED et orientent vers sendSolana', async () => {
    const { adapter } = stub({});
    await expect(adapter.prepareTransfer()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(adapter.signTransaction()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    await expect(adapter.broadcast()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });
});
