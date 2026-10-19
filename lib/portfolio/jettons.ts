/**
 * Jettons TON du portefeuille (partie TON de lib/portfolio/holdings), à part :
 * le registre des adaptateurs v2 tire des modules de l'app, que l'extension
 * navigateur (EVM + Solana) n'embarque pas.
 */
import { TonAdapterV2 } from '../../src/domain/chains/v2/TonAdapterV2';
import { findAdapterV2 } from '../../src/domain/chains/v2/registry';
import { formatAmount } from '../../src/domain/validation/amount';
import { addressForChain } from '../accountAddress';
import { safeNum } from '../num';
import type { JettonLoader, Holding } from './holdings';

export const loadJettons: JettonLoader = (acct, chains, fiat, failed, diag) => {
  const note = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);
  /*
   * Jettons TON. Prix et vérification viennent de TonAPI (CoinGecko ne cote pas
   * la plupart) : seul un jetton en liste blanche est « vérifié » et compté.
   * Le SYMBOLE ne prouve rien — de faux « USD₮ » circulent.
   */
  return Promise.all(
    chains
      .filter((c) => c.family === 'ton')
      .map(async (chain): Promise<Holding[]> => {
        const address = addressForChain(acct, chain);
        const a = address ? findAdapterV2(chain.id) : undefined;
        if (!address || !(a instanceof TonAdapterV2) || !a.capabilities.tokens) return [];
        try {
          const js = await a.jettons(address, fiat);
          if (diag) diag.jettons = { ...(diag.jettons ?? {}), [chain.id]: js.length };
          return js.map((j) => {
            const amount = safeNum(Number(formatAmount(j.raw, j.decimals)));
            const verified = j.verification === 'whitelist';
            return {
              id: `${chain.id}:${j.master}`,
              chainId: chain.id,
              kind: 'jetton' as const,
              contract: j.master,
              symbol: j.symbol,
              name: j.name,
              decimals: j.decimals,
              raw: j.raw,
              amount,
              logo: j.image,
              price: verified ? safeNum(j.price) : 0,
              fiat: verified ? safeNum(amount * j.price) : 0,
              change24h: verified ? j.change24h : null,
              verified,
            };
          });
        } catch (e) {
          if (diag) diag.jettons = { ...(diag.jettons ?? {}), [chain.id]: `ÉCHEC ${note(e)}` };
          failed.add(`${chain.id}:tokens`);
          return [];
        }
      }),
  ).then((l) => l.flat());
};
