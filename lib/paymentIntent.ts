/**
 * Exécution d'une intention de paiement — chemin UNIQUE pour le scanner QR et
 * les liens profonds.
 *
 * Pourquoi ici et pas dans l'écran : le scanner faisait ce travail à la main
 * dans `app/scan.tsx`, et les liens profonds ne le faisaient pas du tout. Deux
 * conséquences, toutes deux en production :
 *
 * 1. Le scanner ne transmettait que `to` et `amount`. Une facture en USDC
 *    (`solana:…?spl-token=…` ou `ethereum:<contrat>/transfer?address=…`)
 *    arrivait donc sur l'écran d'envoi de la PIÈCE NATIVE, avec le bon
 *    destinataire et le mauvais actif — la pire forme d'erreur, celle qui a
 *    l'air correcte.
 * 2. `ethereum:` est déclaré côté natif (app.config) mais n'était routé nulle
 *    part : l'OS proposait Kalyx pour un lien de paiement, l'app s'ouvrait, et
 *    il ne se passait rien.
 *
 * RÈGLE : on ne devine JAMAIS les décimales d'un jeton. Un lien de paiement
 * n'en porte pas ; l'écran d'envoi retombe sinon sur celles de la pièce native
 * (18), ce qui transforme une facture d'1 USDC en 10^12. On les résout — d'abord
 * dans le portefeuille, puis sur le réseau — ou on n'envoie pas le jeton.
 */
import { router } from 'expo-router';
import { toast } from './toast';
import { translate } from './i18n';
import { useSettings } from './settingsStore';
import { useWallet } from './walletStore';
import { useWalletConnect } from './walletconnect';
import { usePortfolioStore } from './portfolio/portfolioStore';
import {
  parseQr,
  qrTargetFamily,
  kalyxChainIdForEvm,
  sendIntentFor,
  getAdapter,
  listChains,
  formatAmount,
  getTokenMetadata,
  type QrResult,
  type SendIntent,
} from '../src';

/** Au-delà, on préfère envoyer l'utilisateur sur l'écran sans le jeton. */
const META_TIMEOUT_MS = 6000;

const t = () => (k: Parameters<typeof translate>[1]) => translate(useSettings.getState().language, k);

/** Symbole + décimales d'un jeton, ou null si on ne peut pas les établir. */
async function resolveToken(
  chainId: string,
  token: string,
  kind: 'erc20' | 'spl',
): Promise<{ symbol: string; decimals: number } | null> {
  // 1. Le portefeuille : instantané, hors ligne, et c'est le cas courant.
  const held = usePortfolioStore
    .getState()
    .holdings.find(
      (h) =>
        h.chainId === chainId &&
        h.kind === kind &&
        (h.contract ?? '').toLowerCase() === token.toLowerCase(),
    );
  if (held) return { symbol: held.symbol, decimals: held.decimals };

  // 2. Le réseau : un jeton qu'on ne détient pas encore reste payable.
  const adapter = getAdapter(chainId);
  const withTimeout = <T,>(p: Promise<T>): Promise<T | null> =>
    Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), META_TIMEOUT_MS))]);

  try {
    if (kind === 'erc20') {
      const meta = await withTimeout(getTokenMetadata(adapter.config, token));
      if (meta && Number.isInteger(meta.decimals)) {
        return { symbol: meta.symbol || 'TOKEN', decimals: meta.decimals };
      }
      return null;
    }
    // SPL : les décimales font autorité sur le mint lui-même, pas dans un index.
    const supply = await withTimeout(
      (adapter as unknown as { rpc<T>(m: string, p: unknown[]): Promise<T> }).rpc<{
        value?: { decimals?: number };
      }>('getTokenSupply', [token]),
    );
    const decimals = supply?.value?.decimals;
    return Number.isInteger(decimals) ? { symbol: 'TOKEN', decimals: decimals as number } : null;
  } catch {
    return null;
  }
}

/** Chaîne Kalyx sur laquelle ce contenu doit être traité. */
function targetChainFor(result: QrResult): string {
  const activeChain = useWallet.getState().activeChain;
  const fam = qrTargetFamily(result);
  if (fam === 'bitcoin') return 'bitcoin';
  if (fam === 'solana') return 'solana';
  if (fam !== 'evm') return activeChain;
  const currentIsEvm = getAdapter(activeChain).config.family === 'evm';
  if (result.kind === 'ethereum-uri' && result.chainId) {
    return kalyxChainIdForEvm(result.chainId, listChains()) ?? (currentIsEvm ? activeChain : 'ethereum');
  }
  return currentIsEvm ? activeChain : 'ethereum';
}

/** Paramètres de route `/send`, jeton résolu (ou volontairement absent). */
async function sendParamsFor(
  intent: SendIntent,
  chainId: string,
): Promise<Record<string, string>> {
  /*
   * Pas de `chain` dans les paramètres : `setActiveChain` a déjà été appelé, et
   * `app/send.tsx` déduit `presetToken` de `contract || mint || chain`. Le
   * passer systématiquement ferait donc SAUTER l'étape « quoi envoyer » sur un
   * simple scan d'adresse, en imposant la pièce native — alors que c'est
   * précisément là que l'utilisateur doit choisir son jeton.
   */
  const params: Record<string, string> = { to: intent.to };
  /*
   * REPÈRES ET MÉMO transportés jusqu'à l'écran d'envoi, puis jusqu'à la
   * transaction. Les perdre ici reviendrait à payer un marchand qui ne verra
   * jamais le paiement : `reference` est le seul lien entre sa demande et la
   * transaction qui arrive sur son adresse.
   */
  if (intent.references?.length) params.references = intent.references.join(',');
  if (intent.memo) params.memo = intent.memo;
  const token = intent.contract ?? intent.mint;
  const kind = intent.contract ? 'erc20' : 'spl';

  if (!token) {
    if (intent.amount) params.amount = intent.amount;
    return params;
  }

  const meta = await resolveToken(chainId, token, kind);
  if (!meta) {
    /*
     * Jeton non identifiable : on garde le destinataire mais on ne prétend pas
     * connaître l'actif. Pas de montant non plus — préremplir un chiffre sur le
     * mauvais jeton, c'est fabriquer l'erreur qu'on cherche à éviter.
     */
    toast.error(t()('payTokenUnknown'), token);
    return params;
  }

  if (intent.contract) params.contract = intent.contract;
  else params.mint = intent.mint!;
  params.symbol = meta.symbol;
  params.decimals = String(meta.decimals);

  // `amount` est déjà en unités utilisateur ; `amountRaw` (EIP-681 `uint256`)
  // est en unités de base et n'est convertible qu'ici, décimales en main.
  if (intent.amount) params.amount = intent.amount;
  else if (intent.amountRaw) params.amount = formatAmount(BigInt(intent.amountRaw), meta.decimals);

  return params;
}

/**
 * Agit sur un contenu analysé. Rien n'est signé ni envoyé : on amène toujours
 * l'utilisateur sur un écran de confirmation, prérempli.
 */
export async function runQrIntent(result: QrResult, opts?: { replace?: boolean }): Promise<void> {
  const tr = t();
  /*
   * `replace` depuis le scanner : revenir en arrière doit ramener à l'écran
   * d'où l'on vient, pas rouvrir la caméra sur un QR déjà traité.
   */
  const go = opts?.replace ? router.replace : router.push;

  if (result.kind === 'walletconnect') {
    useWalletConnect
      .getState()
      .pair(result.uri)
      .catch((e) => toast.error(tr('connectionFailed'), e instanceof Error ? e.message : undefined));
    go('/walletconnect');
    return;
  }
  if (result.kind === 'url') {
    go({ pathname: '/browser', params: { url: result.url } });
    return;
  }
  /*
   * Paiement marchand : une DEMANDE, pas une adresse. Le service la résout en
   * options payables d'après les soldes réels — d'où un écran à part, et non
   * l'écran d'envoi.
   */
  if (result.kind === 'wc-pay') {
    go({ pathname: '/pay', params: { link: result.link } });
    return;
  }
  /*
   * Requête de transaction Solana Pay : la transaction sera CONSTRUITE PAR UN
   * SERVEUR. Écran dédié, où elle est décodée et montrée avant signature —
   * l'écran d'envoi ne conviendrait pas, il suppose qu'on sait déjà ce qu'on
   * envoie et à qui.
   */
  if (result.kind === 'solana-tx-request') {
    go({ pathname: '/solana-request', params: { url: result.url } });
    return;
  }
  const intent = sendIntentFor(result);
  if (!intent) {
    toast.error(tr('qrNotRecognized'));
    return;
  }

  const chainId = targetChainFor(result);
  if (chainId !== useWallet.getState().activeChain) useWallet.getState().setActiveChain(chainId);

  // Bénéficiaire annoncé par le lien (BIP-21) : affiché, jamais vérifié — une
  // étiquette est écrite par l'émetteur du lien, elle ne prouve rien.
  if (intent.payee) toast.info(tr('payRequestFrom'), intent.payee);

  const params = await sendParamsFor(intent, chainId);
  go({ pathname: '/send', params });
}

/*
 * ── Intention en attente de déverrouillage ───────────────────────────────────
 *
 * Elle ne peut pas se rejouer sur la bascule de `isUnlocked` : `goHome()` dans
 * `app/unlock.tsx` enchaîne un fondu de 240 ms PUIS `router.replace('/home')`.
 * Un `push('/send')` déclenché à la bascule serait donc effacé 240 ms plus tard,
 * et l'utilisateur, qui vient de déverrouiller exprès pour payer, se retrouverait
 * sur l'accueil sans explication. On adopte la mécanique déjà en place pour le
 * retour de Google Drive (`useDriveFlow.returnTo`) : l'écran de déverrouillage
 * rejoue l'intention lui-même, APRÈS avoir atteint l'accueil.
 */
let pendingIntent: QrResult | null = null;

/** Met une intention de côté jusqu'au déverrouillage (la dernière gagne). */
export function setPendingIntent(result: QrResult): void {
  pendingIntent = result;
}

/** Oublie l'intention en attente (plus de portefeuille, ou plus de contexte). */
export function clearPendingIntent(): void {
  pendingIntent = null;
}

/** Rejoue l'intention mise de côté, s'il y en a une. Appelé après l'accueil. */
export function flushPendingIntent(): void {
  const queued = pendingIntent;
  if (!queued) return;
  pendingIntent = null;
  void runQrIntent(queued);
}

/** Analyse puis exécute une chaîne brute (QR scanné, lien profond, collage). */
export async function runPaymentUri(raw: string, opts?: { replace?: boolean }): Promise<void> {
  await runQrIntent(parseQr(raw), opts);
}
