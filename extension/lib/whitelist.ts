/**
 * LISTE BLANCHE DES DESTINATAIRES de l'extension. Règles : celles de l'app
 * (src/domain/security/whitelist) — activée, on n'envoie qu'aux adresses de
 * la liste et à ses propres portefeuilles ; ce qui RELÂCHE la protection
 * (ajouter une adresse, désactiver) n'agit qu'après 24 h d'heure de chaîne.
 *
 * Menace visée : quelqu'un devant l'ordinateur qui connaît le mot de passe.
 * L'état est SCELLÉ avec la clé du coffre (AES-GCM, lié au coffre et au nom
 * « whitelist ») : il ne se lit et ne s'écrit que déverrouillé, et un état
 * modifié à la main ne s'ouvre plus — il est alors traité comme ACTIF et vide
 * (on bloque plutôt que d'éteindre la protection en silence).
 *
 * Limite assumée : un logiciel malveillant qui EFFACE l'entrée sur le disque
 * la ramène à « désactivée ». Il aurait de toute façon accès au reste du
 * profil ; la protection vise la personne au clavier, comme sur mobile.
 */
import { parseTonAddress, toRawTonAddress } from '../../src/domain/chains/ton/tonAddress';
import { openSecret, sealSecret, type SealedSecret } from '../../src/domain/backup/cloudBackup';
import {
  addEntry,
  checkRecipient,
  EMPTY_WHITELIST,
  enable,
  hoursUntil,
  isEnforced,
  isEntryActive,
  isTrustedWallet,
  noteWallet,
  parseWhitelist,
  removeEntry,
  requestDisable,
  settle,
  type WhitelistState,
} from '../../src/domain/security/whitelist';
import { WalletError } from '../../src/domain/errors';
import type { Session } from './session';
import type { Store } from './storage';
import type { Wallets } from './wallets';
import type { ChainNow } from './chainTime';

const KEY = 'whitelist';
const NAME = 'whitelist';

/** Comparaison d'adresses : EVM sans casse, Solana (base58) à l'identique. */
/**
 * Clé de comparaison : EVM et Bitcoin bech32 (bc1…) sont insensibles à la
 * casse ; Solana et Bitcoin base58, non. TON : les formes EQ…, UQ… et brute
 * d'un même compte se ramènent à la forme brute (0:…), sinon une adresse de
 * la liste blanche ne reconnaîtrait pas son autre écriture.
 */
export const addressKey = (a: string): string => {
  const s = a.trim();
  if (/^(0x[0-9a-f]{40}|bc1[0-9a-z]{6,87})$/i.test(s)) return s.toLowerCase();
  if (/^(-?\d:[0-9a-f]{64}|[A-Za-z0-9_+/-]{48})$/i.test(s)) {
    const t = parseTonAddress(s);
    if (t) return toRawTonAddress(t).toLowerCase();
  }
  return s;
};

export interface WhitelistView {
  enforced: boolean;
  enabled: boolean;
  disableAt: number | null;
  /** Heure de chaîne connue ? Sans elle, rien ne peut être ajouté sous protection. */
  timeKnown: boolean;
  entries: { address: string; label: string; active: boolean; hoursLeft: number }[];
}

export function makeWhitelist(disk: Store, session: Session, wallets: Wallets, chainNow: ChainNow) {
  /** Lit, règle (délais échus, nouveaux portefeuilles notés), et réécrit si besoin. Dans la file du coffre. */
  async function withState<T>(fn: (s: WhitelistState, now: number | null) => { next?: WhitelistState; result: T } | Promise<{ next?: WhitelistState; result: T }>): Promise<T> {
    const ids = (await wallets.list()).map((w) => w.id);
    return session.withVault(async (vault, key) => {
      const sealed = await disk.get<SealedSecret>(KEY);
      let s: WhitelistState;
      if (!sealed) s = EMPTY_WHITELIST;
      else {
        try {
          s = parseWhitelist(openSecret(key, vault.id, NAME, sealed));
        } catch {
          s = parseWhitelist('{'); // illisible → active et vide (voir parseWhitelist)
        }
      }
      // L'heure de chaîne (réseau) ne sert que si la protection est active.
      const now = s.enabled ? await chainNow() : null;
      let settled = settle(s, now);
      for (const id of ids) settled = noteWallet(settled, id, now);
      const out = await fn(settled, now);
      const next = out.next ?? settled;
      const changed = JSON.stringify(next) !== JSON.stringify(s);
      return { result: out.result, commit: changed ? () => disk.set(KEY, sealSecret(key, vault.id, NAME, JSON.stringify(next))) : undefined };
    });
  }

  /** Adresses des portefeuilles de confiance à `now` (ils reçoivent sans liste). */
  async function ownIndex(s: WhitelistState, now: number | null): Promise<Set<string>> {
    const out = new Set<string>();
    for (const w of await wallets.list()) {
      if (!isTrustedWallet(s, w.id, now)) continue;
      for (const a of w.accounts) for (const x of [a.evm, a.solana, a.bitcoin, a.ton]) if (x) out.add(addressKey(x));
    }
    return out;
  }

  /** VERROU d'envoi : appelé avant toute signature, quel que soit l'écran. */
  async function assertAllowed(to: string): Promise<void> {
    await withState(async (s, now) => {
      if (!isEnforced(s, now)) return { result: undefined };
      const own = await ownIndex(s, now);
      const v = checkRecipient(s, to, now, addressKey, (a) => own.has(addressKey(a)));
      if (v.kind === 'blocked') throw new WalletError('NOT_WHITELISTED', 'Destinataire absent de la liste blanche');
      if (v.kind === 'pending') throw new WalletError('WHITELIST_PENDING', 'Destinataire dans son délai de sûreté', { hours: String(hoursUntil(v.activeAt, now)) });
      return { result: undefined };
    });
  }

  const view = (s: WhitelistState, now: number | null): WhitelistView => ({
    enforced: isEnforced(s, now),
    enabled: s.enabled,
    disableAt: s.disableAt,
    timeKnown: now !== null,
    entries: s.entries.map((e) => ({ address: e.address, label: e.label, active: isEntryActive(e, now), hoursLeft: isEntryActive(e, now) ? 0 : hoursUntil(e.activeAt, now) })),
  });

  return {
    assertAllowed,
    get: () => withState((s, now) => ({ result: view(s, now) })),
    enable: () =>
      withState(async (s, now) => {
        const next = enable(s, (await wallets.list()).map((w) => w.id));
        // Désactivée juste avant : l'heure n'avait pas été demandée, elle sert maintenant.
        return { next, result: view(next, now ?? (await chainNow())) };
      }),
    requestDisable: () =>
      withState((s, now) => {
        if (now === null) throw new WalletError('RPC_UNAVAILABLE', 'Heure de chaîne inconnue');
        const next = requestDisable(s, now);
        return { next, result: view(next, now) };
      }),
    add: (address: string, label: string) =>
      withState((s, now) => {
        let next: WhitelistState;
        try {
          next = addEntry(s, address, label, now, addressKey);
        } catch {
          throw new WalletError('RPC_UNAVAILABLE', 'Heure de chaîne inconnue');
        }
        return { next, result: view(next, now) };
      }),
    remove: (address: string) =>
      withState((s, now) => {
        const next = removeEntry(s, address, addressKey);
        return { next, result: view(next, now) };
      }),
    /** Signatures de dApps permises ? Non tant que la protection est en vigueur (comme sur mobile). */
    dappAllowed: () => withState((s, now) => ({ result: !isEnforced(s, now) })),
    /** Adresses de la liste (pour l'anti-empoisonnement : elles sont « connues »). */
    known: () => withState((s) => ({ result: s.entries.map((e) => e.address) })),
  };
}

export type Whitelist = ReturnType<typeof makeWhitelist>;
