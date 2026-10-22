/**
 * CARNET D'ADRESSES de l'extension : un nom pour une adresse EVM ou Solana.
 *
 * Il dit à qui l'on paie : il est SCELLÉ avec la clé du coffre (AES-GCM, lié
 * au coffre et au nom « contacts »), comme la liste blanche. Verrouillée,
 * l'extension ne le lit ni ne l'écrit.
 *
 * Ce n'est PAS une protection (c'est la liste blanche) : un contact ne
 * dispense d'aucune vérification à l'envoi. Mais le carnet refuse les
 * pièges connus :
 *  - une adresse SOSIE d'un contact (mêmes 4 premiers et 4 derniers
 *    caractères) est signalée avant d'être enregistrée ;
 *  - changer l'adresse d'un contact demande une confirmation explicite, et le
 *    contact porte ensuite la date du changement (affichée 30 jours) : une
 *    adresse remplacée à l'insu se voit.
 */
import { openSecret, sealSecret, type SealedSecret } from '../../src/domain/backup/cloudBackup';
import { detectPoisoning } from '../../src/domain/validation/poisoning';
import { isValidEvmAddress, normalizeEvmAddress } from '../../src/domain/validation/address';
import { isValidSolanaAddress } from '../../src/crypto/solana';
import { getRandomBytes } from '../../src/crypto/random';
import { bytesToHex } from '@noble/hashes/utils';
import { WalletError } from './wallets';
import type { Session } from './session';
import type { Store } from './storage';

/** Erreur du carnet, avec le nom du contact concerné (affiché, jamais d'adresse). */
export class ContactError extends WalletError {
  constructor(code: string, readonly params?: Record<string, string>) {
    super(code);
  }
}

const KEY = 'contacts';
const NAME = 'contacts';
export const MAX_CONTACTS = 200;
/** Durée pendant laquelle un changement d'adresse reste signalé. */
export const CHANGE_NOTICE_MS = 30 * 24 * 3600_000;

export interface Contact {
  id: string;
  name: string;
  address: string;
  family: 'evm' | 'solana';
  createdAt: number;
  /** Dernier changement d'adresse, et l'adresse d'avant. */
  changedAt?: number;
  previous?: string;
}

export interface ContactView extends Contact {
  /** Adresse changée il y a moins de 30 jours : à signaler partout où le contact apparaît. */
  recentlyChanged: boolean;
}

/** Nom : ni contrôle, ni bidi, espaces réduits, 40 caractères. */
export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  if (!s) throw new WalletError('BAD_LABEL');
  return s;
}

/** Adresse normalisée et sa famille ; EVM avec sa somme de contrôle. */
export function parseAddress(v: unknown): { address: string; family: 'evm' | 'solana' } {
  const s = typeof v === 'string' ? v.trim() : '';
  if (isValidEvmAddress(s)) return { address: normalizeEvmAddress(s), family: 'evm' };
  if (isValidSolanaAddress(s)) return { address: s, family: 'solana' };
  throw new WalletError('INVALID_ADDRESS');
}

const same = (a: string, b: string) => (a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b);

function parse(json: string): Contact[] {
  const list = JSON.parse(json) as unknown;
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is Contact => !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.address === 'string' && (c.family === 'evm' || c.family === 'solana'));
}

export function makeContacts(disk: Store, session: Session, now: () => number = Date.now) {
  /** Lit, applique `fn`, réécrit si la liste a changé. Dans la file du coffre. */
  function withList<T>(fn: (list: Contact[]) => { next?: Contact[]; result: T }): Promise<T> {
    return session.withVault(async (vault, key) => {
      const sealed = await disk.get<SealedSecret>(KEY);
      let list: Contact[] = [];
      if (sealed) {
        try {
          list = parse(openSecret(key, vault.id, NAME, sealed));
        } catch {
          // Illisible (modifié à la main, autre coffre) : on ne l'écrase pas en silence.
          throw new WalletError('CONTACTS_UNREADABLE');
        }
      }
      const out = fn(list);
      return { result: out.result, commit: out.next ? () => disk.set(KEY, sealSecret(key, vault.id, NAME, JSON.stringify(out.next))) : undefined };
    });
  }

  const view = (c: Contact): ContactView => ({ ...c, recentlyChanged: !!c.changedAt && now() - c.changedAt < CHANGE_NOTICE_MS });
  const sorted = (list: Contact[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

  /** Sosie d'un AUTRE contact (même début, même fin, adresse différente). */
  function lookalike(list: Contact[], address: string, except?: string) {
    const others = list.filter((c) => c.id !== except);
    const hit = detectPoisoning(address, others.map((c) => c.address));
    return hit ? others.find((c) => c.address === hit.lookalike) : undefined;
  }

  return {
    list: () => withList((list) => ({ result: sorted(list).map(view) })),

    /** `confirmLookalike` : l'utilisateur a vu l'avertissement et confirme. */
    add: (name: unknown, address: unknown, confirmLookalike = false) =>
      withList((list) => {
        const n = cleanName(name);
        const a = parseAddress(address);
        const dup = list.find((c) => same(c.address, a.address));
        if (dup) throw new ContactError('CONTACT_EXISTS', { name: dup.name });
        const twin = lookalike(list, a.address);
        if (twin && !confirmLookalike) throw new ContactError('CONTACT_LOOKALIKE', { name: twin.name });
        if (list.length >= MAX_CONTACTS) throw new WalletError('TOO_MANY_CONTACTS');
        const c: Contact = { id: `c-${bytesToHex(getRandomBytes(6))}`, name: n, ...a, createdAt: now() };
        return { next: [...list, c], result: view(c) };
      }),

    /** Changer l'adresse demande `confirmChange` ; le changement reste visible 30 jours. */
    update: (id: unknown, name: unknown, address: unknown, opts: { confirmChange?: boolean; confirmLookalike?: boolean } = {}) =>
      withList((list) => {
        const cur = list.find((c) => c.id === id);
        if (!cur) throw new WalletError('UNKNOWN_CONTACT');
        const n = cleanName(name);
        const a = parseAddress(address);
        let next: Contact = { ...cur, name: n };
        if (!same(a.address, cur.address)) {
          if (!opts.confirmChange) throw new WalletError('CONTACT_ADDRESS_CHANGE');
          const dup = list.find((c) => c.id !== cur.id && same(c.address, a.address));
          if (dup) throw new ContactError('CONTACT_EXISTS', { name: dup.name });
          const twin = lookalike(list, a.address, cur.id);
          if (twin && !opts.confirmLookalike) throw new ContactError('CONTACT_LOOKALIKE', { name: twin.name });
          next = { ...next, ...a, changedAt: now(), previous: cur.address };
        }
        return { next: list.map((c) => (c.id === cur.id ? next : c)), result: view(next) };
      }),

    remove: (id: unknown) =>
      withList((list) => {
        if (!list.some((c) => c.id === id)) throw new WalletError('UNKNOWN_CONTACT');
        return { next: list.filter((c) => c.id !== id), result: undefined };
      }),
  };
}

export type Contacts = ReturnType<typeof makeContacts>;
