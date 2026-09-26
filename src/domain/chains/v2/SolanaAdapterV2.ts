/**
 * Solana sur l'interface v2 — deuxième chaîne migrée.
 *
 * Comme pour l'EVM, DÉLÈGUE à `SolanaChainAdapter` (v1) pour tout ce qui touche
 * au réseau : frais de priorité, blockhash, programme d'un mint, frais de
 * transfert Token-2022, confirmation. La forme change, le comportement réseau
 * non.
 *
 * Ce que la v2 apporte ici, et que la v1 ne pouvait pas exprimer : les envois
 * Solana passaient par `sendSolana` et `sendSplToken`, deux méthodes hors
 * interface qui construisaient, signaient, diffusaient ET attendaient la
 * confirmation d'un bloc. Impossible de montrer à l'utilisateur ce qu'il allait
 * signer avant de le signer. Le brouillon sépare enfin les quatre temps.
 */
import { base58 } from '@scure/base';
import type { Account, Balance, ChainConfig, TxSummary } from '../types';
import { SolanaChainAdapter } from '../SolanaChainAdapter';
import { isValidSolanaAddress, isWalletAddress } from '../../../crypto/solana';
import { getAssociatedTokenAddress } from '../../../crypto/solPda';
import { buildTransferMessage, signAndSerialize } from '../solTx';
import { buildSplTransferMessage } from '../solSpl';
import {
  priorityInstructions,
  pickPriorityFee,
  SPEED_PERCENTILES,
  CU_SOL_TRANSFER,
  CU_SPL_TRANSFER,
} from '../solPriority';
import { amountAfterTransferFee, transferFeeFor } from '../../tokens/token2022';
import { WalletError } from '../../errors';
import { capabilities, type ChainCapabilities } from './capabilities';
import { assertCurve, type ChainSigner, type SignerCurve } from './signer';
import type {
  BroadcastOutcome,
  ChainAdapterV2,
  DraftWarning,
  FeeQuotes,
  SendDraft,
  SendRequest,
  SendSpeed,
  SignedSend,
  TokenHolding,
  TxState,
  TxWaitHint,
} from './types';

/** Charge utile Solana : le message signable et sa fenêtre de validité. */
export interface SolanaPayload {
  /** Octets exactement signés. */
  message: Uint8Array;
  blockhash: string;
  /** Hauteur au-delà de laquelle le blockhash périme. */
  lastValidBlockHeight?: number;
  /** Programme du jeton transféré, quand il y en a un. */
  tokenProgram?: string;
}

/** Frais de base par signature (lamports). Fixes sur Solana. */
const BASE_FEE = 5_000n;

/**
 * Location d'un compte de jeton associé (ATA), en lamports.
 *
 * Ouvrir le compte de jeton du DESTINATAIRE coûte cette somme, et c'est le
 * payeur qui l'avance. Elle vaut environ 0,00204 SOL, soit quatre cents fois les
 * frais de base : l'omettre du devis ne faisait pas qu'afficher un chiffre
 * approximatif, elle rendait le contrôle de solde faux. Un envoi de jeton à une
 * adresse qui n'en détient pas encore passait la vérification puis échouait
 * on-chain faute de lamports.
 *
 * Valeur fixe du programme SPL Token (165 octets de données), la même que celle
 * dont `lib/earn/earnEngine` tient déjà compte.
 */
const ATA_RENT = 2_039_280n;

/**
 * Validité approximative d'un blockhash, en millisecondes.
 *
 * Le réseau raisonne en HAUTEUR DE BLOC, pas en horloge : 150 blocs, soit à peu
 * près une minute. On garde la hauteur exacte dans la charge utile pour la
 * confirmation, et cette estimation ne sert qu'à ce qu'un écran ne propose pas
 * de signer un brouillon manifestement mort.
 */
const BLOCKHASH_TTL_MS = 60_000;

export class SolanaAdapterV2 implements ChainAdapterV2<SolanaPayload> {
  readonly config: ChainConfig;
  readonly signerCurve: SignerCurve = 'ed25519';
  readonly capabilities: ChainCapabilities = capabilities({
    tokens: true,
    tokenSend: true,
    feeTiers: true,
    /*
     * PAS d'accélération ni d'annulation, et ce n'est pas un manque : une
     * transaction Solana non incluse expire d'elle-même sans rien débiter.
     * Il n'y a rien à accélérer, et rien à annuler.
     */
    accelerate: false,
    cancel: false,
    simulation: true,
    messageSigning: 'ed25519',
    customNetworks: true,
    // Le programme Memo existe sur Solana, mais n'est pas câblé ici.
    // Solana Pay porte un `memo` inscrit on-chain (programme SPL Memo).
    memo: true,
    // Un transfert de jeton crée le compte associé du destinataire, à nos frais.
    activatesDestination: true,
  });

  private readonly v1: SolanaChainAdapter;

  constructor(config: ChainConfig, v1?: SolanaChainAdapter) {
    this.config = config;
    this.v1 = v1 ?? new SolanaChainAdapter(config);
  }

  // ── Lecture ────────────────────────────────────────────────────────────────

  deriveAccount(seed: Uint8Array, index = 0): Account {
    return this.v1.deriveAccount(seed, index);
  }

  validateAddress(address: string): boolean {
    return isValidSolanaAddress(address);
  }

  getBalance(address: string): Promise<Balance> {
    return this.v1.getBalance(address);
  }

  getHistory(address: string): Promise<TxSummary[]> {
    return this.v1.getHistory(address);
  }

  async listTokens(address: string): Promise<TokenHolding[]> {
    const tokens = await this.v1.getSplTokens(address);
    return tokens.map((t) => ({
      id: t.mint,
      symbol: t.symbol,
      decimals: t.decimals,
      raw: t.raw,
      name: t.name,
      logo: t.logo,
    }));
  }

  // ── Frais ──────────────────────────────────────────────────────────────────

  /**
   * Trois paliers, par CENTILE des frais de priorité récemment observés.
   *
   * Des centiles et non des multiplicateurs : « rapide » doit vouloir dire
   * « au-dessus de 95 % de ce que le réseau a vu », ce qui reste vrai quand le
   * réseau change d'échelle. Doubler un prix ne veut rien dire.
   */
  async quoteFees(from: string, request: SendRequest): Promise<FeeQuotes> {
    void from;
    const cu = BigInt(request.token ? CU_SPL_TRANSFER : CU_SOL_TRANSFER);
    /*
     * La location de l'ATA entre dans le devis quand le destinataire n'a pas
     * encore de compte pour ce jeton. Elle s'ajoute aux trois paliers à
     * l'identique — elle ne dépend pas de la vitesse — mais elle doit y être :
     * c'est le coût réel de l'opération, et c'est ce montant que l'écran compare
     * au solde en SOL.
     */
    const rent = await this.rentForDestination(request);
    let samples: unknown = null;
    try {
      samples = await this.v1.rpc<unknown>('getRecentPrioritizationFees', [[]]);
    } catch {
      // Un RPC muet retombe sur le plancher, il n'empêche pas de proposer.
    }
    const quote = (speed: SendSpeed) => {
      const price = pickPriorityFee(samples, SPEED_PERCENTILES[speed]);
      return { cost: BASE_FEE + (price * cu) / 1_000_000n + rent, opaque: price };
    };
    return { slow: quote('slow'), normal: quote('normal'), fast: quote('fast') };
  }

  /**
   * Location à avancer pour ouvrir le compte de jeton du destinataire, ou zéro.
   *
   * Zéro pour un envoi de SOL, zéro si le compte existe déjà, et zéro si on ne
   * peut pas le savoir : un RPC muet ne doit pas faire surestimer les frais et
   * bloquer un envoi parfaitement finançable. Le risque assumé dans ce dernier
   * cas est une sous-estimation, celui qu'on avait tout le temps auparavant.
   */
  private async rentForDestination(request: SendRequest): Promise<bigint> {
    if (!request.token || !this.validateAddress(request.to)) return 0n;
    try {
      const tokenProgram = await this.v1.getMintProgram(request.token.id);
      const destAta = getAssociatedTokenAddress(request.token.id, request.to, tokenProgram);
      return (await this.accountExists(destAta)) ? 0n : ATA_RENT;
    } catch {
      return 0n;
    }
  }

  // ── Envoi ──────────────────────────────────────────────────────────────────

  async prepareSend(from: string, request: SendRequest): Promise<SendDraft<SolanaPayload>> {
    if (!this.validateAddress(request.to)) {
      throw new WalletError('INVALID_ADDRESS', 'Adresse Solana invalide');
    }
    if (request.amount <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant invalide');

    const quotes = await this.quoteFees(from, request);
    const tier = quotes[request.speed ?? 'normal'];
    const price = tier.opaque as bigint;

    const warnings: DraftWarning[] = [];
    /*
     * Destinataire HORS COURBE : c'est une PDA — compte de jeton, compte de
     * programme — que personne ne peut signer. Y envoyer des fonds, c'est les
     * perdre, et l'adresse d'un compte de jeton se copie aussi facilement que
     * celle d'un portefeuille.
     */
    if (!isWalletAddress(request.to)) {
      warnings.push({ code: 'DESTINATION_NOT_WALLET', severity: 'danger' });
    }

    const latest = await this.v1.rpc<{
      value?: { blockhash?: string; lastValidBlockHeight?: number };
    }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    const blockhash = latest?.value?.blockhash;
    if (!blockhash) throw new WalletError('RPC_UNAVAILABLE', 'Blockhash Solana indisponible');

    const common = {
      chainId: this.config.id,
      from,
      to: request.to,
      amount: request.amount,
      fee: tier.cost,
      expiresAt: Date.now() + BLOCKHASH_TTL_MS,
      warnings,
    };

    if (!request.token) {
      const message = buildTransferMessage({
        from,
        to: request.to,
        lamports: request.amount,
        recentBlockhash: blockhash,
        prefix: priorityInstructions(CU_SOL_TRANSFER, price),
        references: request.references,
        memo: request.memo,
      });
      return {
        ...common,
        token: null,
        payload: { message, blockhash, lastValidBlockHeight: latest?.value?.lastValidBlockHeight },
      };
    }

    // Le programme du mint fait autorité on-chain : il entre dans les seeds de
    // l'ATA et dans l'instruction. On ne le devine pas.
    const tokenProgram = await this.v1.getMintProgram(request.token.id);

    /*
     * Le jeton peut prélever au passage (extension Token-2022). Sans le dire,
     * l'app annonce un montant et un autre arrive, et l'utilisateur en conclut
     * que le portefeuille a perdu la différence.
     */
    const feeConfig = await this.v1.getTransferFeeConfig(request.token.id);
    const withheld = transferFeeFor(request.amount, feeConfig);
    if (withheld > 0n) {
      warnings.push({
        code: 'TOKEN_TRANSFER_FEE',
        severity: 'warning',
        params: { withheld: withheld.toString() },
      });
    }

    // Le compte de jeton du destinataire sera créé s'il manque — à nos frais.
    const destAta = getAssociatedTokenAddress(request.token.id, request.to, tokenProgram);
    const exists = await this.accountExists(destAta);
    /*
     * Le montant accompagne l'avertissement : « tu vas activer le compte du
     * destinataire » sans dire ce que cela coûte laisse croire à une formalité.
     * Le devis l'inclut déjà (cf. `rentForDestination`), l'écran peut donc
     * l'annoncer.
     */
    if (!exists) {
      warnings.push({
        code: 'ACTIVATES_DESTINATION',
        severity: 'info',
        params: { rent: ATA_RENT.toString() },
      });
    }

    const message = buildSplTransferMessage({
      from,
      to: request.to,
      mint: request.token.id,
      amount: request.amount,
      decimals: request.token.decimals,
      recentBlockhash: blockhash,
      prefix: priorityInstructions(CU_SPL_TRANSFER, price),
      tokenProgram,
      references: request.references,
      memo: request.memo,
    });

    return {
      ...common,
      token: request.token,
      amountReceived: amountAfterTransferFee(request.amount, feeConfig),
      payload: {
        message,
        blockhash,
        lastValidBlockHeight: latest?.value?.lastValidBlockHeight,
        tokenProgram,
      },
    };
  }

  /** Le compte existe-t-il déjà on-chain ? Ne lève jamais. */
  private async accountExists(address: string): Promise<boolean> {
    try {
      const res = await this.v1.rpc<{ value?: unknown }>('getAccountInfo', [address, { encoding: 'base64' }]);
      return res?.value != null;
    } catch {
      // Dans le doute, on n'annonce PAS une création de compte : mieux vaut
      // taire un coût possible que d'en inventer un qui n'existe pas.
      return true;
    }
  }

  async signSend(draft: SendDraft<SolanaPayload>, signer: ChainSigner): Promise<SignedSend<SolanaPayload>> {
    assertCurve(signer, 'ed25519');
    const raw = signAndSerialize(draft.payload.message, signer.secretKey);
    return { chainId: draft.chainId, raw, draft };
  }

  async broadcastSend(signed: SignedSend<SolanaPayload>): Promise<BroadcastOutcome> {
    const txid = await this.v1.rpc<string>('sendTransaction', [
      signed.raw,
      { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 3 },
    ]);
    if (!txid) throw new WalletError('BROADCAST_FAILED', 'Diffusion refusée par le réseau Solana');
    // La HAUTEUR de bloc, pas seulement l'horloge : c'est la seule preuve
    // qu'une transaction non vue ne passera plus.
    return { txid, expiresAt: signed.draft.expiresAt, opaque: signed.draft.payload.lastValidBlockHeight };
  }

  /**
   * Attend l'issue réelle.
   *
   * Une transaction acceptée par un RPC n'est PAS une transaction incluse :
   * elle peut être abandonnée faute de priorité. C'est l'hypothèse inverse qui
   * faisait afficher « envoyé » sur une transaction qui n'avait jamais eu lieu.
   */
  async waitForTx(txid: string, hint?: TxWaitHint): Promise<TxState> {
    /*
     * Sans la hauteur de bloc, `confirmSignature` ne peut pas conclure à une
     * expiration : il sonde jusqu'au délai maximal, et l'utilisateur reste une
     * minute devant un écran qui ne sait rien lui dire. C'est ce que faisait
     * cette méthode avant que le repère opaque existe.
     */
    const lastValidBlockHeight = typeof hint?.opaque === 'number' ? hint.opaque : undefined;
    try {
      await this.v1.confirmSignature(txid, lastValidBlockHeight);
      return { status: 'confirmed' };
    } catch (e) {
      const code = e instanceof WalletError ? e.code : null;
      if (code === 'TX_EXPIRED') return { status: 'expired' };
      if (code === 'TX_FAILED') return { status: 'failed', reason: e instanceof Error ? e.message : undefined };
      return { status: 'pending' };
    }
  }

  /**
   * Simule la transaction sur le RPC standard.
   *
   * `simulateTransaction` et non la simulation Helius de la v1 : celle-ci exige
   * une clé d'API, et une capacité déclarée doit fonctionner partout, y compris
   * sur le RPC personnel de l'utilisateur.
   */
  async simulate(draft: SendDraft<SolanaPayload>): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await this.v1.rpc<{ value?: { err?: unknown } }>('simulateTransaction', [
        signAndSerialize(draft.payload.message, new Uint8Array(64)),
        { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true },
      ]);
      const err = res?.value?.err;
      return err ? { ok: false, reason: JSON.stringify(err).slice(0, 120) } : { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : undefined };
    }
  }

  async signMessage(message: string, signer: ChainSigner): Promise<string> {
    assertCurve(signer, 'ed25519');
    const { ed25519 } = await import('@noble/curves/ed25519');
    const bytes = new TextEncoder().encode(message);
    return base58.encode(ed25519.sign(bytes, signer.secretKey));
  }
}
