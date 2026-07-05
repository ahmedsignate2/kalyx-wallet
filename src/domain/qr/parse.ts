/**
 * Parseur de contenu QR (pur, testable). Classe une chaîne scannée en une
 * intention typée SANS jamais l'exécuter — c'est l'UI qui décide ensuite,
 * après confirmation. Couvre : adresses nues (EVM / Solana / Bitcoin), URIs de
 * paiement (EIP-681 ethereum:, BIP-21 bitcoin:, Solana Pay solana:),
 * WalletConnect (wc:) et URLs web. Tout le reste = invalide.
 */
import { isValidEvmAddress, normalizeEvmAddress } from '../validation/address';
import { isValidBtcAddress } from '../validation/btcAddress';
import { isValidSolanaAddress } from '../../crypto/solana';
import { formatAmount } from '../validation/amount';

export type QrResult =
  | { kind: 'evm-address'; address: string }
  | { kind: 'solana-address'; address: string }
  | { kind: 'bitcoin-address'; address: string }
  | { kind: 'ethereum-uri'; address: string; amount?: string; chainId?: number }
  | { kind: 'bitcoin-uri'; address: string; amount?: string }
  | { kind: 'solana-uri'; address: string; amount?: string; splToken?: string }
  | { kind: 'walletconnect'; uri: string }
  | { kind: 'url'; url: string }
  | { kind: 'invalid'; raw: string };

/** Découpe la query string `a=1&b=2` d'une URI en dictionnaire décodé. */
function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!q) return out;
  for (const pair of q.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = decodeURIComponent(pair.slice(0, eq));
    const v = decodeURIComponent(pair.slice(eq + 1));
    if (k) out[k] = v;
  }
  return out;
}

/** Sépare une URI `scheme:body` en corps + query (après le premier '?'). */
function splitUri(body: string): { path: string; query: Record<string, string> } {
  const qi = body.indexOf('?');
  if (qi < 0) return { path: body, query: {} };
  return { path: body.slice(0, qi), query: parseQuery(body.slice(qi + 1)) };
}

/** Montant décimal valide et strictement positif ? */
function cleanAmount(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  return Number(v) > 0 ? v : undefined;
}

function parseEthereumUri(body: string): QrResult {
  const { path, query } = splitUri(body);
  // path = <address>[@chainId][/function]
  const [target, fn] = path.split('/');
  const [addrRaw, chainRaw] = target.split('@');
  const chainId = chainRaw && /^\d+$/.test(chainRaw) ? Number(chainRaw) : undefined;

  // Transfert de token ERC-20 : le vrai destinataire est dans ?address=…
  // (on ne préremplit pas le montant, décimales du token inconnues ici).
  if (fn === 'transfer' && query.address && isValidEvmAddress(query.address)) {
    return { kind: 'ethereum-uri', address: normalizeEvmAddress(query.address), chainId };
  }
  if (!isValidEvmAddress(addrRaw)) return { kind: 'invalid', raw: `ethereum:${body}` };

  // value = wei (EIP-681). Conversion en ETH décimal si entier.
  let amount: string | undefined;
  if (query.value && /^\d+$/.test(query.value)) {
    const eth = formatAmount(BigInt(query.value), 18);
    amount = cleanAmount(eth);
  }
  return { kind: 'ethereum-uri', address: normalizeEvmAddress(addrRaw), amount, chainId };
}

function parseBitcoinUri(body: string): QrResult {
  const { path, query } = splitUri(body);
  if (!isValidBtcAddress(path)) return { kind: 'invalid', raw: `bitcoin:${body}` };
  return { kind: 'bitcoin-uri', address: path, amount: cleanAmount(query.amount) };
}

function parseSolanaUri(body: string): QrResult {
  const { path, query } = splitUri(body);
  if (!isValidSolanaAddress(path)) return { kind: 'invalid', raw: `solana:${body}` };
  const splToken = query['spl-token'];
  return {
    kind: 'solana-uri',
    address: path,
    amount: cleanAmount(query.amount),
    splToken: splToken && isValidSolanaAddress(splToken) ? splToken : undefined,
  };
}

/** Analyse une chaîne scannée en intention typée. Jamais d'exécution ici. */
export function parseQr(raw: string): QrResult {
  const s = (raw ?? '').trim();
  if (!s) return { kind: 'invalid', raw: '' };

  const lower = s.toLowerCase();

  // WalletConnect (case-sensitive : on garde la chaîne d'origine).
  if (lower.startsWith('wc:')) return { kind: 'walletconnect', uri: s };

  // URIs de paiement par schéma.
  if (lower.startsWith('ethereum:')) return parseEthereumUri(s.slice('ethereum:'.length));
  if (lower.startsWith('bitcoin:')) return parseBitcoinUri(s.slice('bitcoin:'.length));
  if (lower.startsWith('solana:')) return parseSolanaUri(s.slice('solana:'.length));

  // Adresses nues (ordre : EVM sans ambiguïté, puis Bitcoin, puis Solana).
  if (isValidEvmAddress(s)) return { kind: 'evm-address', address: normalizeEvmAddress(s) };
  if (isValidBtcAddress(s)) return { kind: 'bitcoin-address', address: s };
  if (isValidSolanaAddress(s)) return { kind: 'solana-address', address: s };

  // URL web (à confirmer avant ouverture dans le navigateur dApps).
  if (/^https?:\/\/\S+$/i.test(s)) return { kind: 'url', url: s };

  return { kind: 'invalid', raw: s };
}
