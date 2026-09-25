import { Transaction } from 'ethers';
import { EvmChainAdapter } from './EvmChainAdapter';
import { ETHEREUM, BNB, POLYGON, SEPOLIA } from './configs';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { deriveEvmAccount } from '../../crypto/hd';
import { isWalletError } from '../errors';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const KNOWN_ADDRESS_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('EvmChainAdapter (hors-ligne)', () => {
  const seed = mnemonicToSeedSync(PHRASE);

  it('dérive la même adresse sur Ethereum, BNB et Polygon (clé partagée)', () => {
    const eth = new EvmChainAdapter(ETHEREUM).deriveAccount(seed, 0);
    const bnb = new EvmChainAdapter(BNB).deriveAccount(seed, 0);
    const pol = new EvmChainAdapter(POLYGON).deriveAccount(seed, 0);

    expect(eth.address).toBe(KNOWN_ADDRESS_0);
    expect(bnb.address).toBe(KNOWN_ADDRESS_0);
    expect(pol.address).toBe(KNOWN_ADDRESS_0);
    // Seul l'id de chaîne diffère, pas l'adresse.
    expect(new Set([eth.chain, bnb.chain, pol.chain]).size).toBe(3);
  });

  it('refuse une config non-EVM', () => {
    expect(
      () => new EvmChainAdapter({ ...ETHEREUM, family: 'bitcoin', evmChainId: undefined }),
    ).toThrow();
  });

  it('buildTransfer valide l’adresse et convertit le montant en wei', () => {
    const adapter = new EvmChainAdapter(SEPOLIA);
    const intent = adapter.buildTransfer({ to: KNOWN_ADDRESS_0, amount: '0.5' });
    expect(intent.to).toBe(KNOWN_ADDRESS_0);
    expect(intent.value).toBe(5n * 10n ** 17n);
    expect(intent.evmChainId).toBe(11155111);
  });

  it('buildTransfer rejette une adresse ou un montant invalides', () => {
    const adapter = new EvmChainAdapter(SEPOLIA);
    try {
      adapter.buildTransfer({ to: '0xnope', amount: '1' });
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('INVALID_ADDRESS');
    }
    try {
      adapter.buildTransfer({ to: KNOWN_ADDRESS_0, amount: '0' });
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('AMOUNT_TOO_SMALL');
    }
  });

  it('signTransaction produit une tx dont l’émetteur récupéré = compte, sur le bon réseau', async () => {
    const adapter = new EvmChainAdapter(SEPOLIA);
    const acct = deriveEvmAccount(seed, 0);
    const raw = await adapter.signTransaction(
      {
        to: KNOWN_ADDRESS_0,
        value: 10n ** 16n, // 0.01 ETH
        evmChainId: SEPOLIA.evmChainId!,
        nonce: 0,
        gasLimit: 21_000n,
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      },
      acct.privateKey,
    );

    const parsed = Transaction.from(raw);
    expect(parsed.from).toBe(acct.address); // signature valide -> émetteur récupéré
    expect(parsed.to).toBe(KNOWN_ADDRESS_0);
    expect(parsed.value).toBe(10n ** 16n);
    expect(parsed.chainId).toBe(BigInt(SEPOLIA.evmChainId!));
    expect(parsed.type).toBe(2); // EIP-1559
  });

  it('une tx signée pour Ethereum n’est pas rejouable sur BNB (chainId différent)', async () => {
    const acct = deriveEvmAccount(seed, 0);
    const base = {
      to: KNOWN_ADDRESS_0,
      value: 1n,
      nonce: 0,
      gasLimit: 21_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    };
    const onEth = await new EvmChainAdapter(ETHEREUM).signTransaction(
      { ...base, evmChainId: 1 },
      acct.privateKey,
    );
    expect(Transaction.from(onEth).chainId).toBe(1n);
  });
});

describe('EvmChainAdapter — frais legacy et 1559', () => {
  const seed = mnemonicToSeedSync(PHRASE);

  /** Adapter dont les appels provider sont fournis par le test, sans réseau. */
  function stub(adapter: EvmChainAdapter, provider: Record<string, unknown>) {
    (adapter as unknown as { call: unknown }).call = async (fn: (p: unknown) => unknown) => fn(provider);
    return adapter;
  }

  const base = {
    getTransactionCount: async () => 7,
    estimateGas: async () => 21_000n,
  };

  it('signe en type 0 quand la tx porte un gasPrice', async () => {
    // Signer en type 2 sur une chaîne sans EIP-1559 la fait rejeter à la
    // diffusion, avec un message de RPC illisible pour l'utilisateur.
    const adapter = new EvmChainAdapter(BNB);
    const acct = deriveEvmAccount(seed, 0);
    const raw = await adapter.signTransaction(
      {
        to: KNOWN_ADDRESS_0,
        value: 1n,
        evmChainId: BNB.evmChainId!,
        nonce: 0,
        gasLimit: 21_000n,
        gasPrice: 3_000_000_000n,
      },
      acct.privateKey,
    );
    const parsed = Transaction.from(raw);
    expect(parsed.type).toBe(0);
    expect(parsed.gasPrice).toBe(3_000_000_000n);
    expect(parsed.from).toBe(acct.address);
  });

  it('refuse de signer une tx sans aucun frais', async () => {
    const adapter = new EvmChainAdapter(ETHEREUM);
    const acct = deriveEvmAccount(seed, 0);
    await expect(
      adapter.signTransaction(
        { to: KNOWN_ADDRESS_0, value: 1n, evmChainId: 1, nonce: 0, gasLimit: 21_000n },
        acct.privateKey,
      ),
    ).rejects.toThrow(/frais/i);
  });

  it('prepareTransfer : chaîne 1559 → maxFeePerGas, pas de gasPrice', async () => {
    const adapter = stub(new EvmChainAdapter(ETHEREUM), {
      ...base,
      getFeeData: async () => ({
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        gasPrice: 29_000_000_000n,
      }),
    });
    const tx = await adapter.prepareTransfer(KNOWN_ADDRESS_0, { to: KNOWN_ADDRESS_0, amount: '0.01' });
    expect(tx.maxFeePerGas).toBe(30_000_000_000n);
    expect(tx.gasPrice).toBeUndefined();
    expect(tx.nonce).toBe(7);
  });

  it('prepareTransfer : chaîne LEGACY → gasPrice, et plus d\'exception', async () => {
    /*
     * Avant, cette branche levait « Frais réseau indisponibles (EIP-1559) » :
     * l'envoi de la pièce native était donc impossible sur toute chaîne sans
     * 1559, alors que l'envoi de TOKEN passait (autre chemin, qui gère le
     * type 0). On pouvait envoyer de l'USDC mais pas la pièce native.
     */
    const adapter = stub(new EvmChainAdapter(BNB), {
      ...base,
      getFeeData: async () => ({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: 3_000_000_000n }),
    });
    const tx = await adapter.prepareTransfer(KNOWN_ADDRESS_0, { to: KNOWN_ADDRESS_0, amount: '0.01' });
    expect(tx.gasPrice).toBe(3_000_000_000n);
    expect(tx.maxFeePerGas).toBeUndefined();
  });

  it('prepareTransfer legacy : le palier choisi par l\'utilisateur est honoré', async () => {
    // `computeFeeTiers` met le gasPrice modulé dans maxFeePerGas sur cette
    // branche : on le relit là, sinon le choix Lent/Rapide serait ignoré.
    const adapter = stub(new EvmChainAdapter(BNB), {
      ...base,
      getFeeData: async () => ({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: 3_000_000_000n }),
    });
    const tx = await adapter.prepareTransfer(
      KNOWN_ADDRESS_0,
      { to: KNOWN_ADDRESS_0, amount: '0.01' },
      { maxFeePerGas: 9_000_000_000n, maxPriorityFeePerGas: 9_000_000_000n },
    );
    expect(tx.gasPrice).toBe(9_000_000_000n);
  });

  it('prepareTransfer : la limite de gaz est ESTIMÉE, plus figée à 21 000', async () => {
    // Une adresse de contrat avec un `receive()` consomme plus, et les rollups
    // facturent la composante calldata L1. 21 000 en dur = tx qui échoue après
    // diffusion, frais perdus.
    const adapter = stub(new EvmChainAdapter(ETHEREUM), {
      getTransactionCount: async () => 0,
      estimateGas: async () => 50_000n,
      getFeeData: async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gasPrice: 1n }),
    });
    const tx = await adapter.prepareTransfer(KNOWN_ADDRESS_0, { to: KNOWN_ADDRESS_0, amount: '0.01' });
    expect(tx.gasLimit).toBe((50_000n * 125n) / 100n); // marge de 25 %
  });

  it('prepareTransfer : un échec d\'estimation retombe sur le minimum, sans bloquer', async () => {
    // L'estimation échoue pour des raisons bénignes (RPC qui refuse la méthode,
    // solde insuffisant à l'instant de la simulation) : ce n'est pas une raison
    // d'empêcher l'envoi.
    const adapter = stub(new EvmChainAdapter(ETHEREUM), {
      getTransactionCount: async () => 0,
      estimateGas: async () => {
        throw new Error('execution reverted');
      },
      getFeeData: async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gasPrice: 1n }),
    });
    const tx = await adapter.prepareTransfer(KNOWN_ADDRESS_0, { to: KNOWN_ADDRESS_0, amount: '0.01' });
    expect(tx.gasLimit).toBe(21_000n);
  });

  it('prepareTransfer : aucun frais disponible → erreur explicite', async () => {
    const adapter = stub(new EvmChainAdapter(BNB), {
      ...base,
      getFeeData: async () => ({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: null }),
    });
    await expect(
      adapter.prepareTransfer(KNOWN_ADDRESS_0, { to: KNOWN_ADDRESS_0, amount: '0.01' }),
    ).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
  });
});
