/**
 * Choix d'un contact SANS quitter l'écran en cours.
 *
 * Le bouton « Contacts » de l'envoi menait à l'écran des contacts, donc hors du
 * tunnel : on perdait le montant saisi, le réseau choisi, et il fallait revenir.
 * Une feuille règle le problème sans déplacer l'utilisateur.
 *
 * Les contacts sont FILTRÉS sur la famille de la chaîne active. Proposer un
 * contact Bitcoin pendant un envoi Solana ne peut produire qu'un refus, et
 * l'utilisateur n'a aucun moyen de comprendre pourquoi le nom qu'il vient de
 * choisir est rejeté.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Sheet } from './kit/Sheet';
import { Text } from './kit/Text';
import { Input } from './kit/Input';
import { ListRow } from './kit/ListRow';
import { Divider } from './kit/index';
import { Button } from './kit/Button';
import { AddressGlyph } from './kit/AddressGlyph';
import { EmptyState } from './kit/EmptyState';
import { space } from './tokens';
import { useContacts } from '../lib/contactsStore';
import { useT } from '../lib/settingsStore';
import {
  addressFamilies,
  groupAddress,
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidBtcAddress,
  type AddressFamily,
} from '../src';

const CHECKS = {
  evm: isValidEvmAddress,
  solana: isValidSolanaAddress,
  bitcoin: isValidBtcAddress,
};

export function ContactPicker({
  visible,
  family,
  onClose,
  onPick,
}: {
  visible: boolean;
  /** Famille de la chaîne active : seuls les contacts utilisables sont montrés. */
  family: AddressFamily;
  onClose: () => void;
  onPick: (address: string) => void;
}) {
  const t = useT();
  const contacts = useContacts((s) => s.contacts);
  const [query, setQuery] = useState('');

  const usable = useMemo(
    () => contacts.filter((c) => addressFamilies(c.address, CHECKS).includes(family)),
    [contacts, family],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return usable;
    return usable.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
  }, [usable, query]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text variant="title2">{t('chipContacts')}</Text>

      {/* La recherche n'apparaît qu'au-delà de quelques contacts : en dessous,
          elle occuperait la place de ce qu'elle sert à trouver. */}
      {usable.length > 5 ? (
        <Input value={query} onChangeText={setQuery} placeholder={t('contactSearch')} autoCorrect={false} autoCapitalize="none" />
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          icon="contacts"
          title={usable.length === 0 ? t('contactsNoneForChain') : t('nothingForFilter')}
          body={usable.length === 0 ? t('contactsNoneForChainBody') : undefined}
        />
      ) : (
        <View style={{ gap: 0 }}>
          {shown.map((c, i) => (
            <React.Fragment key={c.id}>
              <ListRow
                left={<AddressGlyph address={c.address} size={36} />}
                title={c.name}
                subtitle={groupAddress(c.address)}
                onPress={() => {
                  onPick(c.address);
                  onClose();
                }}
              />
              {i < shown.length - 1 ? <Divider inset={64} /> : null}
            </React.Fragment>
          ))}
        </View>
      )}

      <View style={{ gap: space[2] }}>
        <Button
          label={t('contactsManage')}
          variant="ghost"
          onPress={() => {
            onClose();
            router.push('/contacts');
          }}
        />
      </View>
    </Sheet>
  );
}
