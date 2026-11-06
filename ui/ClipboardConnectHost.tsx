/**
 * LIEN DE CONNEXION COPIÉ. Sur un autre appareil ou dans le navigateur du
 * téléphone, une dApp affiche un QR WalletConnect ou TON Connect, avec
 * « copier le lien ». Quand Kalyx revient au premier plan (déverrouillé), un
 * tel lien dans le presse-papiers est PROPOSÉ : « Ignorer » par défaut, rien
 * ne part sans la fenêtre de connexion habituelle (site, réseaux, demandes).
 *
 * Vie privée : le texte lu n'est ni gardé ni envoyé ; seul un lien de
 * connexion déclenche quelque chose, et une seule fois par lien. iOS : lu
 * seulement s'il contient une URL (pas de demande « Autoriser à coller » pour
 * un texte quelconque). Android affiche un message à chaque lecture : la
 * détection se coupe dans Réglages.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { isDecoySession } from '../lib/sessionMode';
import { useTonConnect } from '../lib/tonconnect/store';
import { useWalletConnect, pairErrorKey } from '../lib/walletconnect';
import { toast } from '../lib/toast';
import { offerConnect } from '../lib/connectOffer';
import { clipConnectLink } from '../src/domain/qr/clipConnect';

/** Liens déjà proposés pendant cette ouverture de l'app (acceptés ou ignorés). */
const offered = new Set<string>();

export function ClipboardConnectHost() {
  const t = useT();
  const unlocked = useWallet((s) => s.isUnlocked);
  const enabled = useSettings((s) => s.clipConnect);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current || !unlocked || !enabled || isDecoySession()) return;
    busy.current = true;
    try {
      if (Platform.OS === 'ios' && !(await Clipboard.hasUrlAsync())) return;
      if (!(await Clipboard.hasStringAsync())) return;
      const found = clipConnectLink(await Clipboard.getStringAsync());
      if (!found || offered.has(found.link)) return;
      offered.add(found.link);
      const go = () => {
        if (found.kind === 'tonconnect') {
          void useTonConnect
            .getState()
            .openLink(found.link)
            .then((err) => err && toast.error(t('connectionFailed'), t(err as never)));
        } else {
          void useWalletConnect
            .getState()
            .pair(found.link)
            .catch((e) => toast.error(t('connectionFailed'), t(pairErrorKey(e))));
        }
      };
      offerConnect({ kind: found.kind, onConnect: go });
    } catch {
      /* presse-papiers illisible : rien à proposer */
    } finally {
      busy.current = false;
    }
  }, [unlocked, enabled, t]);

  // Au déverrouillage, puis à chaque retour au premier plan.
  useEffect(() => {
    if (!unlocked) return;
    const first = setTimeout(() => void check(), 800);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTimeout(() => void check(), 800); // laisse l'écran de code se fermer
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [unlocked, check]);

  return null;
}
