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
  /** Détails Bitcoin : transfert (destinataire, satoshis) ou PSBT (entrées, diffusion). */
  btc?: { to?: string; sats?: bigint; inputs?: number; broadcast?: boolean } | null;
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

export function explainRequest(input: ExplainInput): SignExplanation {
  const short = input.short ?? ((a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a));
  const site = input.domain ?? 'ce site';
  let risk: SignRisk = 'none';
  const reasons: string[] = [];
  let canReduceApproval = false;

  // ── Signaux transverses (Verify, phishing, GoPlus) ──
  if (input.verify?.isScam) { risk = 'danger'; reasons.push('Ce site est signalé comme frauduleux par WalletConnect.'); }
  else if (input.verify?.validation === 'INVALID') { risk = worst(risk, 'danger'); reasons.push('Le site qui demande la signature ne correspond pas au domaine déclaré.'); }
  if (input.phishingSite) { risk = 'danger'; reasons.push('Ce site est répertorié comme site de phishing.'); }
  if (input.addressRisk?.level === 'danger') { risk = 'danger'; reasons.push(...(input.addressRisk.reasons.length ? input.addressRisk.reasons : ['Le contrat ciblé est signalé comme malveillant.'])); }
  else if (input.addressRisk?.level === 'warning') { risk = worst(risk, 'warning'); reasons.push(...(input.addressRisk.reasons.length ? input.addressRisk.reasons : ['Le contrat ciblé présente des signaux à surveiller.'])); }

  // ── SIWE ──
  if (input.kind === 'siwe') {
    if (input.siweMismatch) { risk = 'danger'; reasons.push(`Le message demande une connexion à ${input.siwe?.domain ?? '?'} alors que tu es sur ${site}.`); }
    return {
      title: 'Connexion',
      headline: `Connexion à ${input.siwe?.domain ?? site} avec ton adresse.`,
      detail: 'Aucune transaction, aucun frais. Cette signature prouve seulement que tu possèdes l’adresse.',
      lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }

  // ── Message libre ──
  if (input.kind === 'message') {
    const txt = input.messageText?.trim();
    const preview = txt ? (txt.length > 160 ? `${txt.slice(0, 157)}…` : txt) : null;
    return {
      title: 'Signature',
      headline: `${site} te demande de signer un message.`,
      detail: preview ? `« ${preview} » — aucun frais, mais ne signe que si tu fais confiance au site.` : 'Aucun frais, mais ne signe que si tu fais confiance au site : une signature peut valoir engagement.',
      lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }

  // ── EIP-712 (Permit, Permit2, ordres…) ──
  if (input.kind === 'typedData') {
    const t = input.typed;
    const spender = t?.details?.find((d) => /spender|autoris/i.test(d.label))?.value;
    const unlimited = t?.unlimited === true || !!t?.details?.find((d) => /montant|amount/i.test(d.label) && /illimit/i.test(d.value));
    // Montant lisible : formaté avec les décimales si on les connaît, sinon brut.
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
    const via = t?.permit2 ? ' (via Permit2)' : '';
    const noExpiry = !!t?.details?.find((d) => /échéance|deadline/i.test(d.label) && /sans expiration/i.test(d.value));
    const isPermit = /permit/i.test(t?.primaryType ?? '') || !!spender;
    if (isPermit) {
      risk = worst(risk, unlimited || noExpiry ? 'danger' : 'warning');
      if (unlimited) { reasons.push('Autorisation ILLIMITÉE : le bénéficiaire pourrait vider ce token.'); canReduceApproval = true; }
      if (noExpiry) reasons.push('Sans date d’expiration : l’autorisation reste valable pour toujours.');
      if (!unlimited && !noExpiry) reasons.push('Une signature Permit autorise un tiers à dépenser tes tokens, sans frais maintenant.');
      return {
        title: 'Autorisation',
        headline: `Cette signature autorise ${spender ? short(spender) : site} à dépenser ${unlimited ? 'un montant illimité de' : amount ? `jusqu’à ${amount}` : ''} tes ${tokenLabel}${via}.`.replace(/\s+/g, ' '),
        detail: 'Aucun frais maintenant, mais c’est comme donner une clé : le bénéficiaire pourra déplacer ces tokens plus tard.',
        lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval,
      };
    }
    return {
      title: 'Signature',
      headline: `${site} te demande de signer ${t?.primaryType ? `un « ${t.primaryType} »` : 'des données structurées'}${t?.name ? ` pour ${t.name}` : ''}.`,
      detail: 'Vérifie le protocole et les champs avant de signer.',
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
      reasons.push('setApprovalForAll : donne le contrôle de TOUTE la collection de NFT. Technique classique des drainers.');
      return { title: 'Autorisation', headline: `${site} demande le contrôle de tous tes NFT de la collection ${short(d.collection)}.`, detail: 'Refuse sauf si tu mets volontairement cette collection en vente sur une place de marché connue.', lose, receive, risk, reasons, holdToSign: true, canReduceApproval: false };
    }
    if (d?.kind === 'approve') {
      if (d.unlimited) { risk = worst(risk, 'warning'); reasons.push('Autorisation illimitée : tu peux la réduire au montant exact.'); canReduceApproval = true; }
      return { title: 'Autorisation', headline: `Tu autorises ${short(d.spender)} à dépenser ${d.unlimited ? 'un montant illimité de' : ''} tes tokens ${short(d.token)}.`.replace(/\s+/g, ' '), detail: d.unlimited ? 'Préfère une autorisation au montant exact : elle suffit pour cet échange.' : 'Autorisation limitée à ce montant.', lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    if (lose.length && receive.length) {
      return { title: 'Transaction', headline: `Tu vas échanger ${lose.join(' + ')} contre environ ${receive.join(' + ')}.`, lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    if (lose.length) {
      const cp = sim?.changes.find((c) => c.direction === 'out')?.counterparty;
      return { title: 'Transaction', headline: `Tu vas envoyer ${lose.join(' + ')}${cp ? ` à ${short(cp)}` : ''}.`, lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    if (receive.length) {
      return { title: 'Transaction', headline: `Tu vas recevoir ${receive.join(' + ')}.`, lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    if (approvals.length) {
      return { title: 'Autorisation', headline: `Tu autorises ${short(approvals[0].spender)} à utiliser tes tokens.`, lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
    }
    const sim_err = sim?.error ? ` (simulation impossible : ${sim.error})` : '';
    return { title: 'Transaction', headline: `${site} te demande d’exécuter une action sur un contrat${d?.kind === 'contract' && d.to ? ` (${short(d.to)})` : ''}.`, detail: `Aucun mouvement de fonds détecté par la simulation${sim_err}. Vérifie le site avant de confirmer.`, lose, receive, risk, reasons, holdToSign: risk === 'danger', canReduceApproval };
  }

  // ── Bitcoin ──
  if (input.kind === 'btcAccounts') {
    return { title: 'Lecture', headline: `${site} demande à consulter tes adresses Bitcoin.`, detail: 'Aucune signature, aucun frais : le site verra ton adresse de réception, comme n’importe qui sur la blockchain.', lose: [], receive: [], risk, reasons, holdToSign: false, canReduceApproval: false };
  }
  if (input.kind === 'btcTransfer') {
    const b = input.btc;
    const btc = b?.sats != null ? formatDecimalString(formatUnits(b.sats, 8)) : null;
    if (risk === 'none') risk = 'warning';
    reasons.push('Un envoi Bitcoin confirmé est irréversible.');
    return {
      title: 'Envoi Bitcoin',
      headline: btc ? `Tu vas envoyer ${btc} BTC${b?.to ? ` à ${short(b.to)}` : ''}.` : `${site} te demande d’envoyer des bitcoins${b?.to ? ` à ${short(b.to)}` : ''}.`,
      detail: 'Vérifie le destinataire : une fois confirmée, personne ne peut annuler.',
      lose: btc ? [`${btc} BTC`] : [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }
  if (input.kind === 'btcPsbt') {
    const b = input.btc;
    if (risk === 'none') risk = 'warning';
    reasons.push(b?.broadcast ? 'La transaction sera diffusée immédiatement après ta signature.' : 'Une PSBT signée peut être diffusée plus tard par le site.');
    return {
      title: 'Transaction Bitcoin',
      headline: `${site} te demande de signer une transaction Bitcoin (PSBT${b?.inputs ? `, ${b.inputs} entrée${b.inputs > 1 ? 's' : ''} à signer` : ''}).`,
      detail: 'Kalyx ne peut pas simuler une PSBT : signe seulement si tu as lancé cette opération toi-même.',
      lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false,
    };
  }

  // ── Transaction Solana (legacy ou v0) ──
  if (input.kind === 'solanaTx') {
    const s = input.solana;
    if (!s) {
      return { title: 'Transaction Solana', headline: `${site} te demande de signer une transaction Solana que Kalyx n’a pas pu lire.`, detail: 'Par prudence, refuse si tu n’es pas à l’origine de cette action.', lose: [], receive: [], risk: worst(risk, 'warning'), reasons: [...reasons, 'Transaction illisible.'], holdToSign: risk === 'danger', canReduceApproval: false };
    }
    if (s.feePayerMismatch) { risk = 'danger'; reasons.push('Le payeur des frais n’est pas ton compte : cette transaction ne t’appartient pas.'); }
    const where = s.dapp ? ` via ${s.dapp}` : '';
    const headline =
      s.action === 'swap' ? `Tu vas échanger des tokens${where}.`
      : s.action === 'staking' ? `Tu vas déposer ou retirer du staking${where}.`
      : s.action === 'nft' ? `Tu vas signer une opération NFT${where}.`
      : s.action === 'transfer' ? 'Tu vas envoyer des tokens.'
      : `${site} te demande de signer une interaction avec un programme Solana${s.known.length ? ` (${s.known.join(', ')})` : ''}.`;
    const detail = s.action === 'swap'
      ? `${s.instructions} instruction${s.instructions > 1 ? 's' : ''}${s.version === 0 ? ', transaction v0' : ''}. Signe seulement si c’est bien ton échange lancé sur ${site}.`
      : s.action === 'contract'
        ? 'Programme non reconnu par Kalyx : vérifie que tu es bien à l’origine de cette action.'
        : `${s.instructions} instruction${s.instructions > 1 ? 's' : ''}${s.version === 0 ? ', transaction v0' : ''}.`;
    if (s.action === 'contract') risk = worst(risk, 'warning');
    return { title: s.action === 'swap' ? 'Swap' : 'Transaction Solana', headline, detail, lose: [], receive: [], risk, reasons, holdToSign: risk === 'danger', canReduceApproval: false };
  }

  return { title: 'Demande', headline: `${site} envoie une demande (${input.method ?? '?'}) que Kalyx ne sait pas encore expliquer.`, detail: 'Par prudence, refuse.', lose: [], receive: [], risk: worst(risk, 'warning'), reasons: [...reasons, 'Méthode inconnue.'], holdToSign: risk === 'danger', canReduceApproval: false };
}
