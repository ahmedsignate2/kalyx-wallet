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
