/**
 * Ce que fait VRAIMENT un PSBT demandé par une dApp.
 *
 * La fenêtre de signature n'en montrait que le nombre d'entrées : « signer une
 * transaction Bitcoin (1 entrée) ». Une dApp malveillante pouvait donc présenter
 * un PSBT qui envoie tout le solde chez elle, et l'utilisateur signait à
 * l'aveugle. On décode ici les sorties (destinataire, montant), ce qui QUITTE
 * le portefeuille (entrées à nous − sorties vers nous), et les frais.
 *
 * Un montant d'entrée absent du PSBT (pas de `witnessUtxo`/`nonWitnessUtxo`) ne
 * permet pas de conclure : on le signale plutôt que d'inventer un chiffre.
 */
import { Transaction, Address, OutScript, NETWORK, TEST_NETWORK } from '@scure/btc-signer';
import { base64, hex } from '@scure/base';

export interface PsbtOutput {
  address: string | null;
  sats: bigint;
  /** Sortie vers le portefeuille lui-même (monnaie rendue). */
  mine: boolean;
}

export interface PsbtSummary {
  outputs: PsbtOutput[];
  /** Somme des entrées appartenant au portefeuille, si toutes sont connues. */
  ownIn: bigint | null;
  /** Ce qui part vers d'autres adresses. */
  sent: bigint;
  /** Frais (total des entrées − total des sorties), si toutes les entrées sont connues. */
  fee: bigint | null;
  /** Au moins une entrée sans montant : impossible de tout chiffrer. */
  unknownInputs: boolean;
}

export function summarizePsbt(psbt: string, ownAddresses: string[], testnet = false): PsbtSummary | null {
  let tx: Transaction;
  try {
    const bytes = psbt.toLowerCase().startsWith('70736274') ? hex.decode(psbt) : base64.decode(psbt);
    tx = Transaction.fromPSBT(bytes, { allowUnknownOutputs: true });
  } catch {
    return null;
  }
  const net = testnet ? TEST_NETWORK : NETWORK;
  const own = new Set(ownAddresses.filter(Boolean).map((a) => a.toLowerCase()));
  const addrOf = (script: Uint8Array): string | null => {
    try {
      return Address(net).encode(OutScript.decode(script));
    } catch {
      return null;
    }
  };

  let inTotal = 0n;
  let ownIn = 0n;
  let unknownInputs = false;
  for (let i = 0; i < tx.inputsLength; i++) {
    const inp = tx.getInput(i);
    let amount: bigint | undefined;
    let script: Uint8Array | undefined;
    if (inp.witnessUtxo) {
      amount = inp.witnessUtxo.amount;
      script = inp.witnessUtxo.script;
    } else if (inp.nonWitnessUtxo && inp.index !== undefined) {
      const prev = inp.nonWitnessUtxo.outputs[inp.index];
      amount = prev?.amount;
      script = prev?.script;
    }
    if (amount === undefined || !script) {
      unknownInputs = true;
      continue;
    }
    inTotal += amount;
    const a = addrOf(script);
    if (a && own.has(a.toLowerCase())) ownIn += amount;
  }

  const outputs: PsbtOutput[] = [];
  let outTotal = 0n;
  let sent = 0n;
  for (let i = 0; i < tx.outputsLength; i++) {
    const o = tx.getOutput(i);
    const sats = o.amount ?? 0n;
    const address = o.script ? addrOf(o.script) : null;
    const mine = !!address && own.has(address.toLowerCase());
    outputs.push({ address, sats, mine });
    outTotal += sats;
    if (!mine) sent += sats;
  }
  return {
    outputs,
    ownIn: unknownInputs ? null : ownIn,
    sent,
    fee: unknownInputs || inTotal < outTotal ? null : inTotal - outTotal,
    unknownInputs,
  };
}
