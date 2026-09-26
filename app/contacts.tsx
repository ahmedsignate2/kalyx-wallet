/**
 * Carnet d'adresses local.
 *
 * L'écran a été REFAIT. Il n'utilisait pas le kit d'interface — donc il ne
 * ressemblait à aucun autre écran —, il supprimait un contact sur une seule
 * pression sans rien demander, il acceptait n'importe quelle chaîne comme
 * adresse, et son formulaire d'édition vivait au FOND de la liste : toucher un
 * contact faisait défiler l'écran loin de la ligne qu'on venait de toucher.
 *
 * Rien de tout cela n'est stocké ailleurs que sur l'appareil : supprimer une
 * fiche ne touche pas la chaîne, et l'écran le dit au moment de confirmer.
 */
import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  Button,
  Surface,
  ListRow,
  Divider,
  Input,
  Sheet,
  IconButton,
  EmptyState,
  AddressGlyph,
  Chip,
  Pressable as KPressable,
} from '../ui/kit';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { useContacts } from '../lib/contactsStore';
import { useT } from '../lib/settingsStore';
import { useEnsName } from '../lib/useEns';
import { toast } from '../lib/toast';
import {
  addressFamilies,
  groupAddress,
  shortAddress,
  listChains,
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidBtcAddress,
  type AddressFamily,
} from '../src';

const CHECKS = { evm: isValidEvmAddress, solana: isValidSolanaAddress, bitcoin: isValidBtcAddress };

/** Nom du premier réseau non-test d'une famille, pour étiqueter une adresse. */
function familyLabel(family: AddressFamily): string {
  return listChains({ includeTestnets: false }).find((c) => c.family === family)?.name ?? family;
}

/**
 * Une ligne de contact, COMPOSANT À PART ENTIÈRE.
 *
 * `useEnsName` est un hook : l'appeler depuis une fonction invoquée dans un
 * `.map()` ferait varier le nombre de hooks avec la longueur de la liste, et
 * React refuserait le rendu suivant dès qu'un contact est ajouté ou supprimé.
 * Un composant par ligne donne à chacune son propre ordre de hooks, stable.
 */
function ContactRow({
  contact,
  pickMode,
  families,
  onPress,
  onDelete,
  t,
}: {
  contact: { id: string; name: string; address: string };
  pickMode: boolean;
  families: AddressFamily[];
  onPress: () => void;
  onDelete: () => void;
  t: (k: 'chooseWord' | 'contactNetworkUnknown' | 'deleteAction') => string;
}) {
  const ensName = useEnsName(contact.address);
  const subtitle = ensName
    ? `${ensName} · ${shortAddress(contact.address)}`
    : groupAddress(contact.address);
  return (
    <ListRow
      left={<AddressGlyph address={contact.address} size={40} />}
      title={contact.name}
      subtitle={subtitle}
      right={
        pickMode ? (
          <Text variant="caption" tone="secondary">{t('chooseWord')} ›</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            {/*
              LE RÉSEAU, visible. Rien ne distinguait une adresse Bitcoin d'une
              adresse EVM dans la liste, et c'est ce qui fait choisir le mauvais
              contact au moment d'envoyer.
            */}
            <Text variant="micro" tone="tertiary">
              {families.length > 0 ? families.map(familyLabel).join(' · ') : t('contactNetworkUnknown')}
            </Text>
            <KPressable onPress={onDelete} hitSlop={10} accessibilityLabel={t('deleteAction')}>
              <Text variant="caption" tone="danger">✕</Text>
            </KPressable>
          </View>
        )
      }
      onPress={onPress}
    />
  );
}

export default function Contacts() {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const pickMode = pick === '1';
  const { contacts, add, update, remove } = useContacts();

  const [query, setQuery] = useState('');
  const [form, setForm] = useState<null | { id?: string; name: string; address: string }>(null);
  /** Contact dont la suppression est en attente de confirmation. */
  const [confirmDelete, setConfirmDelete] = useState<null | { id: string; name: string }>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
  }, [contacts, query]);

  /*
   * VALIDATION DE L'ADRESSE. On enregistrait n'importe quelle chaîne : une faute
   * de frappe devenait un contact, et l'erreur ne se découvrait qu'au moment
   * d'envoyer — trop tard pour se souvenir de l'adresse qu'on voulait.
   */
  const formFamilies = useMemo(
    () => (form?.address.trim() ? addressFamilies(form.address, CHECKS) : []),
    [form?.address],
  );
  const canSave = !!form?.name.trim() && formFamilies.length > 0;

  const save = () => {
    if (!form || !canSave) return;
    const name = form.name.trim();
    const address = form.address.trim();
    if (form.id) update(form.id, name, address);
    else add(name, address);
    setForm(null);
  };

  const onTap = (c: { id: string; name: string; address: string }) => {
    if (pickMode) router.navigate({ pathname: '/send', params: { to: c.address } });
    else setForm({ id: c.id, name: c.name, address: c.address });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: SCREEN_MARGIN,
          height: insets.top + 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
        }}
      >
        <IconButton
          icon="back"
          label={t('back')}
          tone="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        />
        <View style={{ flex: 1 }}>
          <Text variant="title2">{t('contacts')}</Text>
          <Text variant="micro" tone="tertiary">{pickMode ? t('chooseRecipient') : t('localAddressBook')}</Text>
        </View>
        <IconButton icon="add" label={t('contactNew')} tone="ghost" onPress={() => setForm({ name: '', address: '' })} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SCREEN_MARGIN, gap: space[4], paddingBottom: insets.bottom + space[6] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* La recherche n'apparaît qu'au-delà de quelques fiches : en dessous,
            elle occuperait la place de ce qu'elle sert à trouver. */}
        {contacts.length > 5 ? (
          <Input value={query} onChangeText={setQuery} placeholder={t('contactSearch')} autoCorrect={false} autoCapitalize="none" />
        ) : null}

        {contacts.length === 0 ? (
          <Surface>
            <EmptyState
              icon="contacts"
              title={t('noContactsYet')}
              body={t('localAddressBook')}
              actionLabel={t('contactNew')}
              onAction={() => setForm({ name: '', address: '' })}
            />
          </Surface>
        ) : shown.length === 0 ? (
          <Surface>
            <EmptyState icon="contacts" title={t('nothingForFilter')} />
          </Surface>
        ) : (
          <Surface padded={false}>
            {shown.map((c, i) => (
              <React.Fragment key={c.id}>
                <ContactRow
                  contact={c}
                  pickMode={pickMode}
                  families={addressFamilies(c.address, CHECKS)}
                  onPress={() => onTap(c)}
                  onDelete={() => setConfirmDelete({ id: c.id, name: c.name })}
                  t={t}
                />
                {i < shown.length - 1 ? <Divider inset={68} /> : null}
              </React.Fragment>
            ))}
          </Surface>
        )}
      </ScrollView>

      {/*
        LE FORMULAIRE EST UNE FEUILLE, plus le fond de la liste. Toucher un
        contact faisait défiler l'écran jusqu'en bas, loin de la ligne touchée.
      */}
      <Sheet visible={!!form} onClose={() => setForm(null)}>
        <Text variant="title2">{form?.id ? t('contactEdit') : t('contactNew')}</Text>
        <View style={{ gap: space[3] }}>
          <View style={{ gap: space[1] }}>
            <Text variant="caption" tone="secondary">{t('name')}</Text>
            <Input
              value={form?.name ?? ''}
              onChangeText={(v) => setForm((f) => (f ? { ...f, name: v } : f))}
              placeholder={t('contactNameExample')}
            />
          </View>
          <View style={{ gap: space[1] }}>
            <Text variant="caption" tone="secondary">{t('addressLabel')}</Text>
            <Input
              value={form?.address ?? ''}
              onChangeText={(v) => setForm((f) => (f ? { ...f, address: v } : f))}
              placeholder={t('contactAddressHint')}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/*
              On DIT sur quel réseau l'adresse est reconnue, et on refuse
              d'enregistrer ce qui ne l'est nulle part : une faute de frappe ne
              doit pas devenir un contact qu'on découvrira au moment d'envoyer.
            */}
            {form?.address.trim() ? (
              formFamilies.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                  {formFamilies.map((f) => (
                    <Chip key={f} label={familyLabel(f)} selected onPress={() => {}} />
                  ))}
                </View>
              ) : (
                <Text variant="caption" tone="danger">{t('contactInvalidAddress')}</Text>
              )
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <Button label={t('cancel')} variant="ghost" onPress={() => setForm(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('saveAction')} disabled={!canSave} onPress={save} />
            </View>
          </View>
        </View>
      </Sheet>

      {/*
        CONFIRMATION AVANT SUPPRESSION. Une seule pression sur la croix effaçait
        la fiche, sans recours. On précise aussi ce qui est supprimé : seule
        l'entrée locale, rien sur la chaîne — sinon la question fait peur pour de
        mauvaises raisons.
      */}
      <Sheet visible={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <Text variant="title2">{t('contactDeleteTitle')}</Text>
        <Text variant="body" tone="secondary">{confirmDelete?.name}</Text>
        <Text variant="caption" tone="tertiary">{t('contactDeleteBody')}</Text>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Button label={t('cancel')} variant="ghost" onPress={() => setConfirmDelete(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('deleteAction')}
              onPress={() => {
                if (confirmDelete) {
                  remove(confirmDelete.id);
                  toast.success(t('deleteAction'), confirmDelete.name);
                }
                setConfirmDelete(null);
              }}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
