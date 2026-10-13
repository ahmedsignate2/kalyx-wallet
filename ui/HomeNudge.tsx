/**
 * CARTE D'ACTION de l'accueil — le point de sécurité le plus important qui
 * reste à régler, et UN seul à la fois (une pile de bannières se lit comme du
 * bruit) : pas de sauvegarde chiffrée (ou une sauvegarde périmée : un
 * portefeuille, un compte ou un nom changé depuis), puis biométrie coupée (seulement si le
 * téléphone en a une). La phrase non vérifiée a déjà sa bannière sur l'accueil :
 * la répéter ici ferait deux alertes pour la même chose. Écartée d'un geste, elle revient au bout de sept jours :
 * un rappel, pas un harcèlement. Rien quand tout est fait.
 */
import { useEffect, useEffectEvent, useState } from 'react';
import { AppState, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, Pressable as KPressable } from './kit';
import { IconDisc } from './nova';
import { Icon, type IconName } from './icon';
import { useTheme, radii } from './theme';
import { fontFamily } from './tokens';
import { useSettings, useT } from '../lib/settingsStore';
import { isBiometricAvailable } from '../lib/biometrics';
import { useBackupStale } from '../lib/walletStore';

const SNOOZE_MS = 7 * 24 * 3600 * 1000;
const key = (id: string) => `kalyx.nudge.${id}`;

type Nudge = { id: string; icon: IconName; title: string; body: string; cta: string; go: () => void };

export function HomeNudge() {
  const { colors } = useTheme();
  const t = useT();
  const encrypted = useSettings((s) => s.encryptedBackupAt !== null);
  /** Sauvegarde qui ne contient plus tous les portefeuilles : à REFAIRE, même rang que « à faire ». */
  const stale = useBackupStale();
  const biometric = useSettings((s) => s.biometricEnabled);
  /** id → écartée ? ; une carte dont l'état n'est pas encore relu n'est pas affichée. */
  const [snoozed, setSnoozed] = useState<Record<string, boolean>>({});
  /** Biométrie disponible sur CE téléphone : sinon, rien à activer (Réglages n'a pas le réglage). */
  const [bioAvailable, setBioAvailable] = useState(false);
  useEffect(() => {
    const check = () => isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
    void check();
    // Empreinte ou visage enregistré dans le système pendant que l'app tourne : revu au retour.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void check();
    });
    return () => sub.remove();
  }, []);

  const all: Nudge[] = [
    ...(!encrypted ? [{ id: 'backup', icon: 'share' as IconName, title: t('encBackup'), body: t('encBackupTodoMsg'), cta: t('createBackupBtn'), go: () => router.push('/cloud-backup') }] : []),
    /*
     * Id DISTINCT de « backup » : avoir écarté le rappel « crée ta sauvegarde »
     * ne doit pas taire celui-ci, qui parle d'un nouveau portefeuille non couvert.
     */
    ...(encrypted && stale ? [{ id: 'backupStale', icon: 'share' as IconName, title: t('encBackupStaleTitle'), body: t('encBackupStaleMsg'), cta: t('updateBackupBtn'), go: () => router.push('/cloud-backup') }] : []),
    ...(!biometric && bioAvailable ? [{ id: 'bio', icon: 'security' as IconName, title: t('biometrics'), body: t('biometricsDisabledMsg'), cta: t('enable'), go: () => router.push('/settings') }] : []),
  ];
  const ids = all.map((n) => n.id).join(',');

  /*
   * Seuls les ids pas encore relus le sont : l'état déjà connu est GARDÉ (le
   * remettre à zéro quand la biométrie se révélait disponible faisait
   * disparaître puis réapparaître la carte — l'accueil sautait).
   */
  const readUnknownSnoozes = useEffectEvent(() =>
    Promise.all(all.filter((n) => snoozed[n.id] === undefined).map(async (n) => [n.id, Number(await AsyncStorage.getItem(key(n.id)).catch(() => null)) || 0] as const)),
  );
  useEffect(() => {
    let alive = true;
    readUnknownSnoozes().then((rows) => {
      if (!alive) return;
      const now = Date.now();
      if (rows.length) setSnoozed((s) => ({ ...s, ...Object.fromEntries(rows.map(([id, at]) => [id, now - at < SNOOZE_MS])) }));
    });
    return () => {
      alive = false;
    };
  }, [ids]);

  // La première carte non écartée ; si une carte plus prioritaire n'est pas encore relue, on attend.
  const n = all.find((x) => snoozed[x.id] !== true);
  if (!n || snoozed[n.id] === undefined) return null;
  const dismiss = () => {
    AsyncStorage.setItem(key(n.id), String(Date.now())).catch(() => {});
    setSnoozed((s) => ({ ...s, [n.id]: true }));
  };
  /*
   * UN BANDEAU D'UNE LIGNE, pas une carte : le rappel reste visible sans casser
   * le rythme de l'accueil. L'explication complète est lue par le lecteur
   * d'écran (indice) et affichée sur l'écran où mène le bandeau.
   */
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, paddingRight: 6, height: 56, borderRadius: radii.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
      <KPressable onPress={n.go} haptic="light" accessibilityRole="button" accessibilityLabel={`${n.title} · ${n.cta}`} accessibilityHint={n.body} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 56 }}>
        <IconDisc name={n.icon} tone="gold" size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" numberOfLines={1} style={{ fontFamily: fontFamily.semibold, color: colors.text }}>{n.title}</Text>
          <Text variant="small" numberOfLines={1} style={{ color: colors.warm, fontFamily: fontFamily.semibold }}>{n.cta}</Text>
        </View>
        <Icon name="chevron" size={14} color={colors.warm} />
      </KPressable>
      <KPressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('close')} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={14} color={colors.textTertiary} />
      </KPressable>
    </View>
  );
}
