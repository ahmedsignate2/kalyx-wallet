/**
 * EXPLICATION d'une demande de signature (§4.7) — le cœur de « l'arme » :
 * transforme n'importe quelle requête (SIWE, message, EIP-712/Permit,
 * transaction) en :
 *   - une PHRASE en français normal (« Tu vas échanger 100 USDC contre… »),
 *   - des lignes « Tu perds » / « Tu reçois » (simulation),
 *   - un NIVEAU DE RISQUE (none / warning / danger) avec ses raisons,
 *   - la conduite à tenir (Refuser par défaut + maintenir 2 s en Danger).
 * Pur et testé : aucun réseau ici. Jamais d'hexadécimal dans les phrases.
 */
import { formatDecimalString } from '../validation/format';
import { formatUnits } from 'ethers';
import type { SiweMessage, TypedDataSummary } from './message';
import type { Simulation, AssetChange } from '../tx/simulate';
import type { DecodedTx } from '../tx/decodeTx';
import type { SolanaTxDescription } from './solanaTx';
import type { PsbtSummary } from './psbtSummary';

export type SignRisk = 'none' | 'warning' | 'danger';

export interface SignExplanation {
  /** Titre court : « Connexion », « Signature », « Transaction », « Autorisation ». */
  title: string;
  /** Ce qui va se passer, en une phrase. */
  headline: string;
  /** Détail en une ou deux phrases (peut être vide). */
  detail?: string;
  lose: string[];
  receive: string[];
  risk: SignRisk;
  reasons: string[];
  /** Danger : Refuser devient le bouton par défaut, signer = maintenir 2 s. */
  holdToSign: boolean;
  /** Approbation illimitée : proposer de réduire au montant exact. */
  canReduceApproval: boolean;
}

export interface ExplainInput {
  kind: 'siwe' | 'message' | 'typedData' | 'tx' | 'solanaTx' | 'btcAccounts' | 'btcTransfer' | 'btcPsbt' | 'other';
  method?: string;
  domain?: string; // hôte du site connecté
  siwe?: SiweMessage | null;
  siweMismatch?: boolean;
  typed?: TypedDataSummary | null;
  /** Symbole et décimales du token d'un Permit/Permit2, résolus par l'appelant (registre local ou métadonnées ERC-20). */
  tokenSymbol?: string | null;
  tokenDecimals?: number | null;
  /** Transaction Solana décrite (solana_signTransaction). */
  solana?: SolanaTxDescription | null;
  /** Détails Bitcoin : transfert (destinataire, satoshis) ou PSBT (décodé, diffusion). */
  btc?: { to?: string; sats?: bigint; inputs?: number; broadcast?: boolean; psbt?: PsbtSummary | null } | null;
  /** Texte du message à signer (déjà décodé), pour l'afficher. */
  messageText?: string | null;
  decoded?: DecodedTx | null;
  simulation?: Simulation | null;
  /** Vérification WalletConnect Verify : VALID / INVALID / UNKNOWN, isScam. */
  verify?: { validation?: 'VALID' | 'INVALID' | 'UNKNOWN'; isScam?: boolean } | null;
  /** Analyse GoPlus de la cible. */
  addressRisk?: { level: 'safe' | 'warning' | 'danger' | 'unknown' | string; reasons: string[] } | null;
  phishingSite?: boolean;
  nativeSymbol?: string;
  short?: (a: string) => string;
  /** Traducteur de l'écran appelant (voir `ExplainKey`). */
  t?: ExplainT;
}

function fmtChange(c: AssetChange): string {
  if (c.assetType === 'ERC721' || c.assetType === 'ERC1155') return `1 NFT${c.symbol && c.symbol !== 'NFT' ? ` (${c.symbol})` : ''}`;
  let human = '0';
  try {
    human = formatDecimalString(formatUnits(BigInt(c.rawAmount), c.decimals));
  } catch {
    human = c.rawAmount;
  }
  return `${human} ${c.symbol}`;
}

const worst = (a: SignRisk, b: SignRisk): SignRisk => (a === 'danger' || b === 'danger' ? 'danger' : a === 'warning' || b === 'warning' ? 'warning' : 'none');

/** Clés des phrases de la fenêtre de signature (traduites par l'appelant). */
export type ExplainKey =
  | 'exThisSite' | 'exVerifyScam' | 'exVerifyInvalid' | 'exPhishingSite' | 'exContractMalicious' | 'exContractWatch'
  | 'exSiweMismatch' | 'exTitleConnect' | 'exSiweHeadline' | 'exSiweDetail'
  | 'exTitleSignature' | 'exMessageHeadline' | 'exMessageDetailQuoted' | 'exMessageDetail'
  | 'exPermitUnlimited' | 'exPermitNoExpiry' | 'exPermitGeneric' | 'exTitleApproval'
  | 'exPermitHeadlineUnlimited' | 'exPermitHeadlineAmount' | 'exPermitHeadline' | 'exPermitDetail'
  | 'exTypedHeadlineType' | 'exTypedHeadlineGeneric' | 'exTypedDetail'
  | 'exApproveAllReason' | 'exApproveAllHeadline' | 'exApproveAllDetail'
  | 'exApproveUnlimitedReason' | 'exApproveHeadlineUnlimited' | 'exApproveHeadline' | 'exApproveDetailUnlimited' | 'exApproveDetailLimited'
  | 'exTitleTx' | 'exSwapHeadline' | 'exSendHeadline' | 'exSendHeadlineTo' | 'exReceiveHeadline' | 'exApprovalsHeadline'
  | 'exContractHeadline' | 'exContractHeadlineTo' | 'exContractDetail' | 'exContractDetailErr'
  | 'exTitleRead' | 'exBtcAccountsHeadline' | 'exBtcAccountsDetail'
  | 'exBtcIrreversible' | 'exTitleBtcSend' | 'exBtcSendHeadline' | 'exBtcSendHeadlineTo' | 'exBtcSendAsk' | 'exBtcSendDetail'
  | 'exTitleBtcTx' | 'exPsbtBroadcastNow' | 'exPsbtLater' | 'exPsbtHeadlineTo' | 'exPsbtHeadlineMany' | 'exPsbtHeadline'
  | 'exPsbtFee' | 'exPsbtUnknownInputs' | 'exPsbtUnreadable' | 'exPsbtDetail'
  | 'exTitleSolTx' | 'exSolUnreadableHeadline' | 'exSolUnreadableDetail' | 'exSolUnreadable' | 'exSolSponsored'
  | 'exSolSwap' | 'exSolStaking' | 'exSolNft' | 'exSolTransfer' | 'exSolProgram' | 'exSolProgramKnown'
  | 'exSolInstructions' | 'exSolSwapDetail' | 'exSolUnknownProgram' | 'exTitleSwap'
  | 'exTitleRequest' | 'exOtherHeadline' | 'exOtherDetail' | 'exUnknownMethod';

export type ExplainT = (key: ExplainKey, params?: Record<string, string>) => string;

/**
 * LES PHRASES NE SONT PAS ÉCRITES ICI. Elles l'étaient, en français, si bien
 * que la fenêtre la plus sensible de l'app — celle qui dit ce qu'on signe et
 * pourquoi c'est dangereux — restait française dans les quatorze autres langues.
 * Sans traducteur, on rend la clé : jamais une phrase dans une langue que
 * l'utilisateur n'a pas choisie.
 */
export function explainRequest(input: ExplainInput): SignExplanation {
  const tr: ExplainT = input.t ?? ((k, p) => (p ? `${k} ${JSON.stringify(p)}` : k));
  const short = input.short ?? ((a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a));
  const site = input.domain ?? tr('exThisSite');
  let risk: SignRisk = 'none';
  const reasons: string[] = [];
  let canReduceApproval = false;
  /** Raisons GoPlus : des clés (`gp…`), traduites ici aussi. */
  const reasonText = (r: string) => (/^gp[A-Z]/.test(r) ? tr(r as ExplainKey) : r);

  // ── Signaux transverses (Verify, phishing, GoPlus) ──
  if (input.verify?.isScam) { risk = 'danger'; reasons.push(tr('exVerifyScam')); }
  else if (input.verify?.validation === 'INVALID') { risk = worst(risk, 'danger'); reasons.push(tr('exVerifyInvalid')); }
  if (input.phishingSite) { risk = 'danger'; reasons.push(tr('exPhishingSite')); }
  if (input.addressRisk?.level === 'danger') { risk = 'danger'; reasons.push(...(input.addressRisk.reasons.length ? input.addressRisk.reasons.map(reasonText) : [tr('exContractMalicious')])); }
  else if (input.addressRisk?.level === 'warning') { risk = worst(risk, 'warning'); reasons.push(...(input.addressRisk.reasons.length ? input.addressRisk.reasons.map(reasonText) : [tr('exContractWatch')])); }

  // ── SIWE ──
  if (input.kind === 'siwe') {
    if (input.siweMismatch) { risk = 'danger'; reasons.push(tr('exSiweMismatch', { asked: input.siwe?.domain ?? '?', site })); }
    return {
      title: tr('exTitleConnect'),
      headline: tr('exSiweHeadline', { domain: input.siwe?.domain ?? site }),
      detail: tr('exSiweDetail'),
      lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }

  // ── Message libre ──
  if (input.kind === 'message') {
    const txt = input.messageText?.trim();
    const preview = txt ? (txt.length > 160 ? `${txt.slice(0, 157)}…` : txt) : null;
    return {
      title: tr('exTitleSignature'),
      headline: tr('exMessageHeadline', { site }),
      detail: preview ? tr('exMessageDetailQuoted', { preview }) : tr('exMessageDetail'),
      lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }

  // ── EIP-712 (Permit, Permit2, ordres…) ──
  if (input.kind === 'typedData') {
    const t = input.typed;
    const spender = t?.details?.find((d) => /spender|autoris/i.test(d.label))?.value;
    const unlimited = t?.unlimited === true || !!t?.details?.find((d) => /montant|amount/i.test(d.label) && /illimit/i.test(d.value));
    let amount: string | undefined;
    if (!unlimited && t?.amountRaw) {
      try {
        amount = input.tokenDecimals != null ? formatDecimalString(formatUnits(BigInt(t.amountRaw), input.tokenDecimals)) : t.amountRaw;
      } catch {
        amount = t.amountRaw;
      }
    }
    // Le token : symbole résolu > nom du domaine pour un Permit EIP-2612 (le domaine EST le token) > adresse courte. Jamais « Permit2 ».
    const tokenLabel = input.tokenSymbol
      ? input.tokenSymbol
      : t?.token
        ? t.permit2 || /permit2/i.test(t?.name ?? '') ? short(t.token) : (t?.name ?? short(t.token))
        : t?.name && !/permit2/i.test(t.name) ? t.name : 'tokens';
    const via = t?.permit2 ? ' (Permit2)' : '';
    const noExpiry = !!t?.details?.find((d) => /échéance|deadline/i.test(d.label) && /sans expiration/i.test(d.value));
    const isPermit = /permit/i.test(t?.primaryType ?? '') || !!spender;
    if (isPermit) {
      risk = worst(risk, unlimited || noExpiry ? 'danger' : 'warning');
      if (unlimited) { reasons.push(tr('exPermitUnlimited')); canReduceApproval = true; }
      if (noExpiry) reasons.push(tr('exPermitNoExpiry'));
      if (!unlimited && !noExpiry) reasons.push(tr('exPermitGeneric'));
      const who = spender ? short(spender) : site;
      return {
        title: tr('exTitleApproval'),
        headline: unlimited
          ? tr('exPermitHeadlineUnlimited', { spender: who, token: tokenLabel, via })
          : amount
            ? tr('exPermitHeadlineAmount', { spender: who, amount, token: tokenLabel, via })
            : tr('exPermitHeadline', { spender: who, token: tokenLabel, via }),
        detail: tr('exPermitDetail'),
        lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval,
      };
    }
    const forName = t?.name ? ` (${t.name})` : '';
    return {
      title: tr('exTitleSignature'),
      headline: t?.primaryType ? tr('exTypedHeadlineType', { site, type: `${t.primaryType}${forName}` }) : tr('exTypedHeadlineGeneric', { site }),
      detail: tr('exTypedDetail'),
      lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }

  // ── Transaction ──
  if (input.kind === 'tx') {
    const d = input.decoded;
    const sim = input.simulation;
    const lose = (sim?.changes ?? []).filter((c) => c.direction === 'out').map(fmtChange);
    const receive = (sim?.changes ?? []).filter((c) => c.direction === 'in').map(fmtChange);
    const approvals = sim?.approvals ?? [];

    if (d?.kind === 'approveAll' && d.approved) {
      risk = 'danger';
      reasons.push(tr('exApproveAllReason'));
      return { title: tr('exTitleApproval'), headline: tr('exApproveAllHeadline', { site, collection: short(d.collection) }), detail: tr('exApproveAllDetail'), lose, receive, risk, reasons, holdToSign: true, canReduceApproval: false };
    }
    if (d?.kind === 'approve') {
      if (d.unlimited) { risk = worst(risk, 'warning'); reasons.push(tr('exApproveUnlimitedReason')); canReduceApproval = true; }
      return {
        title: tr('exTitleApproval'),
        headline: d.unlimited ? tr('exApproveHeadlineUnlimited', { spender: short(d.spender), token: short(d.token) }) : tr('exApproveHeadline', { spender: short(d.spender), token: short(d.token) }),
        detail: d.unlimited ? tr('exApproveDetailUnlimited') : tr('exApproveDetailLimited'),
        lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval,
      };
    }
    if (lose.length && receive.length) {
      return { title: tr('exTitleTx'), headline: tr('exSwapHeadline', { lose: lose.join(' + '), receive: receive.join(' + ') }), lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    if (lose.length) {
      const cp = sim?.changes.find((c) => c.direction === 'out')?.counterparty;
      return { title: tr('exTitleTx'), headline: cp ? tr('exSendHeadlineTo', { lose: lose.join(' + '), to: short(cp) }) : tr('exSendHeadline', { lose: lose.join(' + ') }), lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    if (receive.length) {
      return { title: tr('exTitleTx'), headline: tr('exReceiveHeadline', { receive: receive.join(' + ') }), lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    if (approvals.length) {
      return { title: tr('exTitleApproval'), headline: tr('exApprovalsHeadline', { spender: short(approvals[0].spender) }), lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    return {
      title: tr('exTitleTx'),
      headline: d?.kind === 'contract' && d.to ? tr('exContractHeadlineTo', { site, to: short(d.to) }) : tr('exContractHeadline', { site }),
      detail: sim?.error ? tr('exContractDetailErr', { error: sim.error }) : tr('exContractDetail'),
      lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval,
    };
  }

  // ── Bitcoin ──
  if (input.kind === 'btcAccounts') {
    return { title: tr('exTitleRead'), headline: tr('exBtcAccountsHeadline', { site }), detail: tr('exBtcAccountsDetail'), lose: [], receive: [], risk, reasons, holdToSign: false, canReduceApproval: false };
  }
  if (input.kind === 'btcTransfer') {
    const b = input.btc;
    const btc = b?.sats != null ? formatDecimalString(formatUnits(b.sats, 8)) : null;
    if (risk === 'none') risk = 'warning';
    reasons.push(tr('exBtcIrreversible'));
    return {
      title: tr('exTitleBtcSend'),
      headline: btc
        ? b?.to ? tr('exBtcSendHeadlineTo', { amount: btc, to: short(b.to) }) : tr('exBtcSendHeadline', { amount: btc })
        : tr('exBtcSendAsk', { site }),
      detail: tr('exBtcSendDetail'),
      lose: btc ? [`${btc} BTC`] : [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }
  if (input.kind === 'btcPsbt') {
    const b = input.btc;
    const s = b?.psbt;
    if (risk === 'none') risk = 'warning';
    reasons.push(b?.broadcast ? tr('exPsbtBroadcastNow') : tr('exPsbtLater'));
    if (!s) {
      risk = worst(risk, 'warning');
      reasons.push(tr('exPsbtUnreadable'));
      return { title: tr('exTitleBtcTx'), headline: tr('exPsbtHeadline', { site }), detail: tr('exPsbtDetail'), lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false };
    }
    if (s.unknownInputs) { risk = worst(risk, 'warning'); reasons.push(tr('exPsbtUnknownInputs')); }
    const fmt = (v: bigint) => formatDecimalString(formatUnits(v, 8));
    const outs = s.outputs.filter((o) => !o.mine);
    const headline = outs.length === 0
      ? tr('exPsbtHeadline', { site })
      : outs.length === 1
        ? tr('exPsbtHeadlineTo', { amount: fmt(s.sent), to: outs[0].address ? short(outs[0].address) : '?' })
        : tr('exPsbtHeadlineMany', { amount: fmt(s.sent), n: String(outs.length) });
    return {
      title: tr('exTitleBtcTx'),
      headline,
      detail: s.fee !== null ? tr('exPsbtFee', { fee: fmt(s.fee) }) : tr('exPsbtDetail'),
      lose: s.sent > 0n ? [`${fmt(s.sent)} BTC`] : [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }

  // ── Transaction Solana (legacy ou v0) ──
  if (input.kind === 'solanaTx') {
    const s = input.solana;
    if (!s) {
      return { title: tr('exTitleSolTx'), headline: tr('exSolUnreadableHeadline', { site }), detail: tr('exSolUnreadableDetail'), lose: [], receive: [], risk: worst(risk, 'warning'), reasons: [...reasons, tr('exSolUnreadable')], holdToSign: risk === 'danger', canReduceApproval: false };
    }
    // Frais payés par un autre compte (relayer de la dApp) : information, pas alerte.
    const sponsored = s.feePayerMismatch ? ` ${tr('exSolSponsored', { payer: short(s.feePayer) })}` : '';
    const via = s.dapp ? ` (${s.dapp})` : '';
    const headline =
      s.action === 'swap' ? tr('exSolSwap', { via })
      : s.action === 'staking' ? tr('exSolStaking', { via })
      : s.action === 'nft' ? tr('exSolNft', { via })
      : s.action === 'transfer' ? tr('exSolTransfer')
      : s.known.length ? tr('exSolProgramKnown', { site, programs: s.known.join(', ') }) : tr('exSolProgram', { site });
    const ins = `${tr('exSolInstructions', { n: String(s.instructions) })}${s.version === 0 ? ' · v0' : ''}.`;
    const detail = s.action === 'swap'
      ? `${ins}${sponsored} ${tr('exSolSwapDetail', { site })}`
      : s.action === 'contract'
        ? `${tr('exSolUnknownProgram')}${sponsored}`
        : `${ins}${sponsored}`;
    if (s.action === 'contract') risk = worst(risk, 'warning');
    return { title: s.action === 'swap' ? tr('exTitleSwap') : tr('exTitleSolTx'), headline, detail, lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false };
  }

  return { title: tr('exTitleRequest'), headline: tr('exOtherHeadline', { site, method: input.method ?? '?' }), detail: tr('exOtherDetail'), lose: [], receive: [], risk: worst(risk, 'warning'), reasons: [...reasons, tr('exUnknownMethod')], holdToSign: risk === 'danger', canReduceApproval: false };
}
