import { create } from 'zustand';
import { getAdapter } from '../src';

export interface Tok {
  symbol: string;
  address: string;
  decimals: number;
  name?: string;
  logo?: string;
  priceUSD?: string;
}

interface TokenState {
  tokensByChain: Record<string, Tok[]>; // indexé par l'identifiant interne de la chaîne (ex: 'ethereum')
  loading: Record<string, boolean>;
  fetchTokens: (chainId: string) => Promise<void>;
}

export const useTokenStore = create<TokenState>((set, get) => ({
  tokensByChain: {},
  loading: {},
  fetchTokens: async (chainId: string) => {
    const { tokensByChain, loading } = get();
    // Si déjà chargé ou en cours de chargement, on ne fait rien.
    if ((tokensByChain[chainId] && tokensByChain[chainId].length > 0) || loading[chainId]) {
      return;
    }

    set((state) => ({ loading: { ...state.loading, [chainId]: true } }));

    try {
      const adapter = getAdapter(chainId);
      const chain = adapter.config;
      let url = '';

      if (chain.family === 'ton') {
        /*
         * TON : liste CHOISIE (jetons à forte liquidité chez STON.fi, ni
         * blacklistés, ni obsolètes, ni taxés — src/domain/swap/stonfi-tokens.json),
         * TON natif en tête. La liste complète de STON.fi (≈ 40 000 entrées) est
         * trop lourde pour un téléphone ; les jetons détenus s'ajoutent à l'écran.
         */
        const list = require('../src/domain/swap/stonfi-tokens.json') as Tok[];
        const ton: Tok = { address: '0x0000000000000000000000000000000000000000', symbol: 'TON', decimals: 9, name: 'Toncoin' };
        set((state) => ({ tokensByChain: { ...state.tokensByChain, [chainId]: [ton, ...list] }, loading: { ...state.loading, [chainId]: false } }));
        return;
      }
      if (chain.family === 'evm' && chain.evmChainId) {
        url = `https://li.quest/v1/tokens?chains=${chain.evmChainId}`;
      } else if (chain.family === 'solana') {
        url = `https://li.quest/v1/tokens?chains=SOL&chainTypes=SVM`;
      } else {
        // Famille non supportée pour le moment pour ce swap (ex: Bitcoin)
        set((state) => ({ loading: { ...state.loading, [chainId]: false } }));
        return;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      let fetchedTokens: Tok[] = [];
      const tokensData = data.tokens;
      if (tokensData) {
        // LI.FI retourne { tokens: { "<chainId>": [ ... ] } }
        const keys = Object.keys(tokensData);
        if (keys.length > 0) {
          // On limite à 50 tokens pour éviter de surcharger l'UI
          fetchedTokens = tokensData[keys[0]].slice(0, 50).map((t: any) => ({
            address: t.address,
            symbol: t.symbol,
            decimals: t.decimals,
            name: t.name,
            logo: t.logoURI,
          priceUSD: t.priceUSD,
          }));
        }
      }

      set((state) => ({
        tokensByChain: { ...state.tokensByChain, [chainId]: fetchedTokens },
        loading: { ...state.loading, [chainId]: false },
      }));
    } catch (e) {
      console.error('Failed to fetch tokens for', chainId, e);
      set((state) => ({ loading: { ...state.loading, [chainId]: false } }));
    }
  },
}));
