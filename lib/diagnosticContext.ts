/**
 * Contexte de diagnostic — l'état de l'app au moment d'un problème.
 *
 * POURQUOI. Les logs disaient ce qui s'était PASSÉ, jamais DANS QUEL ÉTAT. Or la
 * plupart des pannes d'un wallet sont contextuelles : un envoi qui échoue sur
 * Arbitrum alors que le réseau actif est Bitcoin, une biométrie qui refuse alors
 * que le réglage est désactivé, un solde vide parce qu'on est hors ligne. Sans
 * cet état, l'agent ne peut que commenter le symptôme.
 *
 * LIMITE DE CONFIDENTIALITÉ, absolue et vérifiée par test. Ce module ne lit
 * JAMAIS :
 *  - une phrase de récupération, une clé privée, un PIN ;
 *  - une adresse, même publique — l'INDICE du compte suffit à corréler les logs,
 *    et une adresse identifie l'utilisateur de façon permanente ;
 *  - un solde, un montant, un nom de compte choisi par l'utilisateur.
 *
 * Il ne lit que des faits techniques : quel réseau, quel indice de compte,
 * combien de wallets, quels réglages, en ligne ou non, quelle version. De quoi
 * reproduire un bug, jamais de quoi reconnaître quelqu'un.
 */
export interface DiagnosticContext {
  appVersion: string;
  platform: string;
  /** Réseau actif au moment du problème. */
  chain: string;
  /** Indice de DÉRIVATION du compte actif — jamais son adresse. */
  accountIndex: number | null;
  /** Combien de wallets et de comptes : un bug peut n'apparaître qu'au-delà d'un. */
  walletCount: number;
  accountCount: number;
  /** Type du wallet actif : une clé privée importée n'a ni BTC ni Solana. */
  walletKind: 'seed' | 'privateKey' | 'unknown';
  online: boolean;
  locked: boolean;
  language: string;
  fiat: string;
  theme: string;
  biometricEnabled: boolean;
  /** Une phrase non vérifiée explique certains bandeaux et blocages. */
  backupVerified: boolean;
  /** Sessions WalletConnect ouvertes : utile sur tout problème de dApp. */
  wcSessions: number;
}

/** Chargement paresseux : ce module est appelé depuis des contextes variés. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function collectDiagnosticContext(): DiagnosticContext {
  const wallet = safe(() => require('./walletStore').useWallet.getState(), null as any);
  const settings = safe(() => require('./settingsStore').useSettings.getState(), null as any);
  const network = safe(() => require('./networkStore').useNetwork.getState(), null as any);
  const wc = safe(() => require('./walletconnect').useWalletConnect.getState(), null as any);

  const activeWallet = safe(
    () => wallet?.wallets?.find((w: { id: string }) => w.id === wallet.activeWalletId),
    null as any,
  );

  return {
    appVersion: safe(() => require('./telegramSupport').getClientEnvironmentInfo(), 'Kalyx (inconnu)'),
    platform: safe(() => String(require('react-native').Platform.OS), 'inconnu'),
    chain: safe(() => String(wallet?.activeChain ?? 'inconnu'), 'inconnu'),
    accountIndex: safe(() => (typeof wallet?.activeAccountIndex === 'number' ? wallet.activeAccountIndex : null), null),
    walletCount: safe(() => wallet?.wallets?.length ?? 0, 0),
    accountCount: safe(() => wallet?.accounts?.length ?? 0, 0),
    walletKind: safe(() => (activeWallet?.type ?? 'seed') as 'seed' | 'privateKey', 'unknown'),
    online: safe(() => network?.online !== false, true),
    locked: safe(() => wallet?.isUnlocked === false, false),
    language: safe(() => String(settings?.language ?? '?'), '?'),
    fiat: safe(() => String(settings?.fiat ?? '?'), '?'),
    theme: safe(() => String(settings?.themePref ?? '?'), '?'),
    biometricEnabled: safe(() => settings?.biometricEnabled === true, false),
    backupVerified: safe(() => settings?.backupVerified === true, false),
    wcSessions: safe(() => Object.keys(wc?.sessions ?? {}).length, 0),
  };
}

/** Rendu compact, une ligne par fait, pour l'agent et les tickets. */
export function formatDiagnosticContext(c: DiagnosticContext = collectDiagnosticContext()): string {
  return [
    `version=${c.appVersion}`,
    `plateforme=${c.platform}`,
    `réseau=${c.chain}`,
    `compte=#${c.accountIndex ?? '?'} (${c.accountCount} compte(s), ${c.walletCount} wallet(s), type ${c.walletKind})`,
    `réseau_disponible=${c.online ? 'oui' : 'NON'}`,
    `verrouillé=${c.locked ? 'oui' : 'non'}`,
    `langue=${c.language}`,
    `devise=${c.fiat}`,
    `thème=${c.theme}`,
    `biométrie=${c.biometricEnabled ? 'activée' : 'désactivée'}`,
    `phrase_vérifiée=${c.backupVerified ? 'oui' : 'NON'}`,
    `sessions_walletconnect=${c.wcSessions}`,
  ].join(' · ');
}
