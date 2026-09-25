/**
 * Transactions Bitcoin en attente, mémorisées pour pouvoir les ACCÉLÉRER.
 *
 * Pourquoi un magasin persisté plutôt qu'un simple état d'écran : un
 * remplacement BIP-125 doit reprendre EXACTEMENT les mêmes entrées que la
 * transaction d'origine. Or les UTXO qu'elle dépense disparaissent aussitôt de
 * l'ensemble des UTXO disponibles renvoyé par l'API — on ne peut donc pas les
 * retrouver après coup. Sans cet enregistrement, une transaction coincée à taux
 * trop faible le reste pour toujours, quoi qu'on fasse.
 *
 * Contenu NON sensible : identifiants de transaction, montants et adresses, tous
 * publics et déjà on-chain. Aucune clé, aucune phrase.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BitcoinPendingContext } from '../src';

const KEY = 'nova.pendingBtc';

/**
 * Durée au-delà de laquelle on oublie une transaction.
 *
 * Une transaction vieille de trois jours est soit confirmée, soit tombée du
 * mempool (les nœuds l'évincent après ~14 jours, la plupart bien avant). Dans
 * les deux cas il n'y a plus rien à accélérer, et garder l'entrée ferait
 * proposer un bouton qui ne peut qu'échouer.
 */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface PendingBtcTx {
  txid: string;
  /** Adresse émettrice : une entrée n'est utilisable que pour son compte. */
  from: string;
  to: string;
  /** Montant envoyé, en satoshis (sérialisé en chaîne). */
  target: string;
  /** Frais payés, en satoshis (sérialisé en chaîne). */
  fee: string;
  /** Taux payé (sat/vB) : le remplacement doit faire strictement mieux. */
  feeRate: number;
  inputs: { txid: string; vout: number; value: number }[];
  at: number;
}

interface PendingBtcState {
  txs: PendingBtcTx[];
  load: () => Promise<void>;
  /** Enregistre un envoi tout juste diffusé. */
  remember: (from: string, txid: string, context: BitcoinPendingContext) => void;
  /** Oublie une transaction (confirmée, remplacée, ou abandonnée). */
  forget: (txid: string) => void;
  /** Transactions encore accélérables pour cette adresse, les plus récentes d'abord. */
  bumpable: (from: string) => PendingBtcTx[];
}

function persist(txs: PendingBtcTx[]) {
  void AsyncStorage.setItem(KEY, JSON.stringify(txs)).catch(() => {});
}

/** Retire les entrées périmées : elles ne peuvent plus être remplacées. */
function fresh(txs: PendingBtcTx[], now = Date.now()): PendingBtcTx[] {
  return txs.filter((t) => now - t.at < MAX_AGE_MS);
}

export const usePendingBtc = create<PendingBtcState>((set, get) => ({
  txs: [],

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const txs = fresh(raw ? (JSON.parse(raw) as PendingBtcTx[]) : []);
      set({ txs });
    } catch {
      /* silencieux : l'absence d'historique n'est pas une erreur */
    }
  },

  remember: (from, txid, context) => {
    const entry: PendingBtcTx = {
      txid,
      from,
      to: context.dest,
      target: context.target.toString(),
      fee: context.fee.toString(),
      feeRate: context.feeRate,
      inputs: context.inputs,
      at: Date.now(),
    };
    /*
     * Un remplacement dépense les MÊMES entrées que l'original : garder les deux
     * ferait proposer d'accélérer une transaction déjà remplacée, dont la
     * diffusion échouerait. On évince donc toute entrée partageant une entrée.
     */
    const spent = new Set(context.inputs.map((i) => `${i.txid}:${i.vout}`));
    const kept = fresh(get().txs).filter(
      (t) => t.txid !== entry.txid && !t.inputs.some((i) => spent.has(`${i.txid}:${i.vout}`)),
    );
    const txs = [entry, ...kept];
    set({ txs });
    persist(txs);
  },

  forget: (txid) => {
    const txs = get().txs.filter((t) => t.txid !== txid);
    set({ txs });
    persist(txs);
  },

  bumpable: (from) =>
    fresh(get().txs)
      .filter((t) => t.from === from && t.inputs.length > 0)
      .sort((a, b) => b.at - a.at),
}));
