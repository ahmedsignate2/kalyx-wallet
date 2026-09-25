import { findAdapterV2, getAdapterV2, forgetAdapterV2, resetAdaptersV2 } from './registry';
import { registerChain, unregisterChain } from '../registry';
import { EvmAdapterV2 } from './EvmAdapterV2';
import { BitcoinAdapterV2 } from './BitcoinAdapterV2';
import { SolanaAdapterV2 } from './SolanaAdapterV2';
import type { ChainConfig } from '../types';

beforeEach(() => resetAdaptersV2());

describe('registre v2', () => {
  it('fabrique le bon adapter par famille', () => {
    expect(getAdapterV2('ethereum')).toBeInstanceOf(EvmAdapterV2);
    expect(getAdapterV2('bitcoin')).toBeInstanceOf(BitcoinAdapterV2);
    expect(getAdapterV2('solana')).toBeInstanceOf(SolanaAdapterV2);
  });

  it('met en cache : deux appels rendent la MÊME instance', () => {
    // Reconstruire à chaque appel rouvrirait un provider par accès, et
    // perdrait tout état interne de bascule entre RPC.
    expect(getAdapterV2('ethereum')).toBe(getAdapterV2('ethereum'));
  });

  it('lève sur une chaîne inconnue, et `find` rend null', () => {
    expect(findAdapterV2('pas-une-chaine')).toBeNull();
    expect(() => getAdapterV2('pas-une-chaine')).toThrow(/inconnue/);
  });

  it('voit les réseaux PERSONNALISÉS sans inscription séparée', () => {
    /*
     * Les deux registres se construisent sur la même liste de configurations.
     * Deux listes séparées auraient divergé : un réseau ajouté par
     * l'utilisateur n'apparaîtrait que d'un côté.
     */
    const custom: ChainConfig = {
      id: 'custom-424242',
      name: 'MaChaine',
      family: 'evm',
      evmChainId: 424242,
      nativeSymbol: 'MAC',
      nativeDecimals: 18,
      rpcUrls: ['https://rpc.machaine.test'],
    };
    registerChain(custom);
    try {
      const a = getAdapterV2('custom-424242');
      expect(a).toBeInstanceOf(EvmAdapterV2);
      expect(a.config.evmChainId).toBe(424242);
    } finally {
      unregisterChain('custom-424242');
    }
  });

  it('oublie l\'adapter d\'un réseau retiré', () => {
    // Sinon un adapter construit sur une configuration supprimée continuerait
    // de parler à un RPC que l'utilisateur vient d'effacer.
    const custom: ChainConfig = {
      id: 'custom-515151',
      name: 'Temp',
      family: 'evm',
      evmChainId: 515151,
      nativeSymbol: 'TMP',
      nativeDecimals: 18,
      rpcUrls: ['https://rpc.temp.test'],
    };
    registerChain(custom);
    expect(findAdapterV2('custom-515151')).not.toBeNull();
    unregisterChain('custom-515151');
    forgetAdapterV2('custom-515151');
    expect(findAdapterV2('custom-515151')).toBeNull();
  });

  it('la courbe déclarée correspond à la famille', () => {
    // C'est ce que `walletStore` lit pour savoir quoi dériver.
    expect(getAdapterV2('ethereum').signerCurve).toBe('secp256k1');
    expect(getAdapterV2('bitcoin').signerCurve).toBe('secp256k1');
    expect(getAdapterV2('solana').signerCurve).toBe('ed25519');
  });
});
