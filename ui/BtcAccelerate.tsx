/**
 * Accélération d'une transaction Bitcoin en attente (remplacement BIP-125).
 *
 * Bitcoin n'a pas d'équivalent du « remplacer par des frais plus élevés »
 * automatique : une transaction diffusée à un taux trop bas peut rester des
 * heures, voire des jours, dans le mempool. Jusqu'ici Kalyx ne marquait même pas
 * ses transactions comme remplaçables — elles étaient donc coincées
 * DÉFINITIVEMENT, sans recours, ni depuis l'app ni par un service tiers.
 *
 * Ce bandeau n'apparaît que quand il y a réellement quelque chose à accélérer :
 * sur le réseau Bitcoin, pour le compte courant, et pour une transaction dont on
 * a gardé les entrées (sans elles, aucun remplacement n'est constructible).
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Text, Button, Surface } from './kit';
import { space } from './tokens';
import { ConfirmUnlock } from './ConfirmUnlock';
import { useWallet } from '../lib/walletStore';
import { usePendingBtc } from '../lib/pendingBtc';
import { toast } from '../lib/toast';
import { useT } from '../lib/settingsStore';
import { getAdapter, formatTokenAmount, shortAddress } from '../src';

export function BtcAccelerate() {
  const t = useT();
  const activeChain = useWallet((s) => s.activeChain);
  const account = useWallet((s) => s.account);
  const bumpBitcoin = useWallet((s) => s.bumpBitcoin);
  const txs = usePendingBtc((s) => s.txs);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const family = getAdapter(activeChain).config.family;
  /*
   * La plus récente seulement : les autres partagent ses entrées — un
   * remplacement dépense les mêmes — ou sont périmées. Proposer plusieurs
   * boutons d'accélération mènerait à des diffusions vouées au rejet.
   *
   * On lit `txs` (souscrit) et non `getState()`, pour que le bandeau disparaisse
   * de lui-même dès que la transaction est remplacée ou oubliée.
   */
  const pending =
    family === 'bitcoin' && account
      ? txs.filter((x) => x.from === account.address && x.inputs.length > 0).sort((a, b) => b.at - a.at)[0]
      : undefined;

  if (!pending) return null;

  /*
   * `perform` DOIT lever en cas d'échec : c'est le contrat de ConfirmUnlock, qui
   * s'en sert pour distinguer un PIN faux d'une erreur d'exécution. On ne
   * rattrape donc rien ici — le message d'erreur est affiché par le parent.
   */
  const perform = async (unlock: Parameters<typeof bumpBitcoin>[1]) => {
    setBusy(true);
    try {
      const txid = await bumpBitcoin(pending.txid, unlock, 'fast');
      toast.success(t('btcBumpSent'), shortAddress(txid));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Surface>
        <View style={{ gap: space[2] }}>
          <Text variant="body">{t('btcPendingTitle')}</Text>
          <Text variant="caption" tone="secondary">
            {`${formatTokenAmount(BigInt(pending.target), 8)} BTC · ${pending.feeRate} sat/vB · ${shortAddress(pending.to)}`}
          </Text>
          <Text variant="micro" tone="tertiary">{t('btcPendingBody')}</Text>
          <Button
            label={t('btcBumpAction')}
            variant="secondary"
            size="md"
            dense
            loading={busy}
            onPress={() => setAsking(true)}
          />
        </View>
      </Surface>
      <ConfirmUnlock
        visible={asking}
        title={t('btcBumpAction')}
        subtitle={t('btcPendingBody')}
        perform={perform}
        onDone={() => setAsking(false)}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
