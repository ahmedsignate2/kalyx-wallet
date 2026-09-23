/**
 * Frais du réseau Ethereum — DONNÉES RÉELLES.
 *
 * Ce store renvoyait du `Math.random()` (15 à 65 gwei tirés au hasard) et un
 * prix ETH codé à 2500 $, et ces chiffres inventés étaient AFFICHÉS à
 * l'utilisateur. Dans un wallet, annoncer des frais fabriqués n'est pas une
 * approximation : c'est un chiffre faux sur lequel quelqu'un peut décider
 * d'envoyer de l'argent maintenant plutôt que dans une heure.
 *
 * Tout vient désormais de sources existantes et éprouvées :
 *  - le prix du gas, de `EvmChainAdapter.getFeeData()` (ethers + bascule RPC) ;
 *  - le prix de l'ETH, de `getPrices()` (cache + repli sur la valeur périmée),
 *    dans la devise choisie par l'utilisateur et non en dollars d'office.
 *
 * Et quand une donnée manque, elle vaut `null`. L'affichage se tait — il
 * n'invente pas (docs/08 §2.6).
 */
import { create } from 'zustand';
import { getAdapter } from '../src/domain/chains/registry';
import { getPrices, type CoinPrice } from '../src/domain/prices/coingecko';
import { SWAP_GAS_UNITS } from '../src/domain/chains/gasReserve';

/** Constante du protocole Ethereum, pas une estimation. */
const NATIVE_TRANSFER_GAS = 21_000n;

export type GasLevel = 'low' | 'normal' | 'high' | 'surge';

/**
 * Seuils en gwei. À CALIBRER sur des données réelles (docs/08 §19 rejette les
 * constantes posées sur le papier) : depuis Dencun, le base fee du mainnet est
 * souvent à un chiffre, et ces bornes viennent d'une époque plus chère.
 * Elles sont ici pour être corrigées, pas pour faire autorité.
 */
const THRESHOLDS = { low: 10, normal: 30, high: 80 } as const;

/**
 * Classement d'un prix de gas. Fonction pure et exportée : la version
 * précédente testait `> 40` avant `> 80`, si bien que « surge » était
 * INATTEIGNABLE — un bug qu'aucun type ne pouvait attraper, et qui tenait
 * uniquement à l'ordre des branches. D'où le test.
 */
export function gasLevel(gwei: number): GasLevel {
  if (gwei >= THRESHOLDS.high) return 'surge';
  if (gwei >= THRESHOLDS.normal) return 'high';
  if (gwei < THRESHOLDS.low) return 'low';
  return 'normal';
}

export interface GasInfo {
  gwei: number;
  level: GasLevel;
  /** Devise dans laquelle les coûts sont exprimés. */
  fiat: string;
  /** Coût d'un transfert natif. `null` si le prix de l'ETH est inconnu. */
  fiatTransfer: number | null;
  /** Coût d'un swap (250 000 unités, cf. SWAP_GAS_UNITS). */
  fiatSwap: number | null;
}

interface GasTrackerState {
  ethGas: GasInfo | null;
  lastUpdated: number;
  loading: boolean;
  /** Renseigné quand la mesure a échoué : l'écran peut le dire au lieu d'inventer. */
  error: string | null;
  fetchGas: (fiat?: string) => Promise<void>;
}

/** Évite de rappeler le RPC à chaque montage d'écran. */
const STALE_MS = 30_000;

export const useGasTracker = create<GasTrackerState>((set, get) => ({
  ethGas: null,
  lastUpdated: 0,
  loading: false,
  error: null,

  fetchGas: async (fiat = 'usd') => {
    const s = get();
    if (s.loading) return;
    if (s.ethGas && s.ethGas.fiat === fiat && Date.now() - s.lastUpdated < STALE_MS) return;
    set({ loading: true, error: null });
    try {
      // Le prix de l'ETH est facultatif : sans lui on affiche les gwei, qui
      // restent une information juste, plutôt que rien du tout.
      // `getFeeData` est facultatif sur l'interface ChainAdapter : on ne
      // suppose pas qu'il existe, on le vérifie.
      const adapter = getAdapter('ethereum');
      if (typeof adapter.getFeeData !== 'function') throw new Error('no fee source');

      const [fee, prices] = await Promise.all([
        adapter.getFeeData() as Promise<{ maxFeePerGas: bigint | null; gasPrice: bigint | null }>,
        getPrices(['ethereum'], fiat).catch(() => ({}) as Record<string, CoinPrice>),
      ]);

      const wei = fee.maxFeePerGas ?? fee.gasPrice;
      if (wei == null) throw new Error('fee unavailable');

      const gwei = Number(wei) / 1e9;
      const ethPrice = prices.ethereum?.price ?? null;
      const cost = (units: bigint) =>
        ethPrice == null ? null : +((Number(wei) * Number(units)) / 1e18 * ethPrice).toFixed(2);

      set({
        ethGas: {
          gwei: +gwei.toFixed(2),
          level: gasLevel(gwei),
          fiat,
          fiatTransfer: cost(NATIVE_TRANSFER_GAS),
          fiatSwap: cost(SWAP_GAS_UNITS),
        },
        lastUpdated: Date.now(),
        loading: false,
      });
    } catch (e) {
      // On conserve la dernière mesure réelle : périmée vaut mieux qu'inventée.
      set({ loading: false, error: e instanceof Error ? e.message : 'unavailable' });
    }
  },
}));
