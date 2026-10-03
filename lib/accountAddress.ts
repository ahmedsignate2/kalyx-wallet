/**
 * Adresse d'un compte sur un réseau — la SEULE façon de la lire.
 *
 * Le même ternaire était recopié une dizaine de fois dans l'app :
 * `solana ? solAddress : bitcoin ? btcAddress : evmAddress`. Avec TON, chacun de
 * ces exemplaires retombait SANS RIEN DIRE sur l'adresse EVM : l'écran d'envoi
 * aurait pris l'adresse EVM pour expéditeur, le portefeuille aurait interrogé
 * TON Center avec elle, l'écran Recevoir l'aurait affichée comme adresse TON.
 *
 * Ici le `switch` n'a PAS de cas par défaut : une famille ajoutée sans y être
 * traitée ne compile pas, au lieu de retomber sur l'EVM.
 *
 * TON est la seule famille dont l'adresse se CALCULE : elle dépend de la version
 * du contrat et du réseau (la W5 du réseau de test est une autre adresse), d'où
 * la clé publique stockée plutôt qu'une adresse figée.
 */
import { hexToBytes } from '@noble/hashes/utils';
import { formatTonAddress, tonWalletAddress, TON_DEFAULT_WALLET_VERSION, type ChainConfig, type TonWalletVersion } from '../src';

/** Ce qu'il faut d'un compte pour connaître ses adresses — sans rien de secret. */
export interface AccountAddresses {
  evmAddress?: string;
  btcAddress?: string;
  solAddress?: string;
  /** Clé publique TON (hex), compte 0 seulement. */
  tonPublicKey?: string;
  tonVersion?: TonWalletVersion;
}

export function addressForChain(account: AccountAddresses | null | undefined, chain: Pick<ChainConfig, 'family' | 'testnet'>): string {
  if (!account) return '';
  switch (chain.family) {
    case 'evm':
      return account.evmAddress ?? '';
    case 'bitcoin':
      return account.btcAddress ?? '';
    case 'solana':
      return account.solAddress ?? '';
    case 'ton': {
      if (!account.tonPublicKey) return '';
      const testnet = !!chain.testnet;
      const addr = tonWalletAddress(hexToBytes(account.tonPublicKey), account.tonVersion ?? TON_DEFAULT_WALLET_VERSION, { testnet });
      return formatTonAddress(addr, { bounceable: false, testnet });
    }
  }
}
