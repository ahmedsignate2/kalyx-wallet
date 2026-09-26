/**
 * TON pour l'interface v1 — LECTURE SEULE, par l'adaptateur v2.
 *
 * Pourquoi il existe : le registre v1 instancie un adaptateur pour CHAQUE
 * configuration au chargement, et une bonne partie de l'app (portefeuille,
 * historique) lit encore les soldes par `getAdapter`. Sans lui, ajouter une
 * configuration TON faisait planter l'app au démarrage.
 *
 * Ce qu'il ne fait PAS : envoyer. L'envoi TON passe par l'interface v2
 * (`sendDraft` : préparer → signer → diffuser → suivre). Les méthodes d'envoi v1
 * refusent explicitement — un chemin d'envoi à moitié écrit est plus dangereux
 * qu'un refus.
 */
import type { Account, Balance, ChainAdapter, ChainConfig, TransferIntent, TxSummary, UnsignedTx } from './types';
import { WalletError } from '../errors';
import { TonAdapterV2 } from './v2/TonAdapterV2';

function v2Only(what: string): never {
  throw new WalletError('NOT_SUPPORTED', `TON : ${what} passe par l'interface v2 (sendDraft).`);
}

export class TonChainAdapter implements ChainAdapter {
  readonly config: ChainConfig;
  private readonly v2: TonAdapterV2;

  constructor(config: ChainConfig) {
    this.config = config;
    this.v2 = new TonAdapterV2(config);
  }

  deriveAccount(): Account {
    return this.v2.deriveAccount();
  }

  getBalance(address: string): Promise<Balance> {
    return this.v2.getBalance(address);
  }

  getHistory(address: string): Promise<TxSummary[]> {
    return this.v2.getHistory(address);
  }

  buildTransfer(): TransferIntent {
    return v2Only('la construction d’un transfert');
  }

  async prepareTransfer(): Promise<UnsignedTx> {
    return v2Only('la préparation d’un transfert');
  }

  async signTransaction(): Promise<string> {
    return v2Only('la signature');
  }

  async broadcast(): Promise<string> {
    return v2Only('la diffusion');
  }
}
