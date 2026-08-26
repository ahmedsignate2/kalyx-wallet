/**
 * Icônes cohérentes (Ionicons, style outline « fintech »), via un jeu de noms
 * sémantiques Nova → on peut changer de set plus tard sans toucher les écrans.
 * @expo/vector-icons = polices JS bundlées (aucun module natif, aucun rebuild).
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

export type IconName =
  | 'home' | 'market' | 'wallet' | 'menu' | 'exchange'
  | 'search' | 'bell' | 'buy' | 'send' | 'receive' | 'convert'
  | 'profile' | 'accounts' | 'wallets' | 'networks' | 'dapps' | 'contacts'
  | 'language' | 'currency' | 'appearance' | 'notifications' | 'security'
  | 'pin' | 'phrase' | 'developer' | 'extensions' | 'support' | 'faq' | 'about'
  | 'reset' | 'walletconnect' | 'ledger' | 'trezor' | 'import' | 'create'
  | 'eye' | 'eyeOff' | 'chevron' | 'add' | 'history' | 'nft' | 'defi' | 'staking'
  | 'warning' | 'refresh' | 'gift' | 'copy' | 'star' | 'starFilled'
  | 'check' | 'info' | 'close' | 'more' | 'forward' | 'share' | 'scan' | 'flash' | 'flashOff' | 'sparkles';

const MAP: Record<IconName, keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  market: 'stats-chart-outline',
  wallet: 'wallet-outline',
  menu: 'menu-outline',
  exchange: 'swap-horizontal-outline',
  search: 'search-outline',
  bell: 'notifications-outline',
  buy: 'add-circle-outline',
  send: 'arrow-up-outline',
  receive: 'arrow-down-outline',
  convert: 'swap-vertical-outline',
  profile: 'person-outline',
  accounts: 'people-outline',
  wallets: 'briefcase-outline',
  networks: 'git-network-outline',
  dapps: 'globe-outline',
  contacts: 'book-outline',
  language: 'language-outline',
  currency: 'cash-outline',
  appearance: 'color-palette-outline',
  notifications: 'notifications-outline',
  security: 'shield-checkmark-outline',
  pin: 'keypad-outline',
  phrase: 'document-text-outline',
  developer: 'construct-outline',
  extensions: 'extension-puzzle-outline',
  support: 'help-buoy-outline',
  faq: 'help-circle-outline',
  about: 'information-circle-outline',
  reset: 'trash-outline',
  walletconnect: 'link-outline',
  ledger: 'hardware-chip-outline',
  trezor: 'hardware-chip-outline',
  import: 'download-outline',
  create: 'sparkles-outline',
  eye: 'eye-outline',
  eyeOff: 'eye-off-outline',
  chevron: 'chevron-forward',
  add: 'add',
  history: 'time-outline',
  nft: 'image-outline',
  defi: 'pie-chart-outline',
  staking: 'leaf-outline',
  warning: 'warning-outline',
  refresh: 'refresh-outline',
  gift: 'gift-outline',
  copy: 'copy-outline',
  star: 'star-outline',
  starFilled: 'star',
  check: 'checkmark-circle',
  info: 'information-circle',
  close: 'close',
  more: 'ellipsis-vertical',
  forward: 'arrow-forward',
  share: 'share-social-outline',
  scan: 'scan-outline',
  flash: 'flashlight',
  flashOff: 'flashlight-outline',
  sparkles: 'sparkles-outline',
};

export function Icon({
  name,
  size = 20,
  color,
  tone = 'text',
}: {
  name: IconName;
  size?: number;
  /** Couleur explicite ; sinon `tone` est résolu sur le thème actif. */
  color?: string;
  tone?: 'text' | 'muted' | 'faint';
}) {
  const { colors } = useTheme();
  const toneColor = tone === 'muted' ? colors.textMuted : tone === 'faint' ? colors.textFaint : colors.text;
  return <Ionicons name={MAP[name]} size={size} color={color ?? toneColor} />;
}
