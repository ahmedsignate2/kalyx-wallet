/**
 * Icônes Kalyx — un seul set : Phosphor (§2.8). Graisse « regular » partout,
 * « fill » réservé à l'onglet actif (`weight="fill"`). Zéro emoji.
 *
 * L'API `<Icon name="send" />` est conservée : les écrans existants n'ont rien
 * à changer. Les 4 icônes maison (Envoyer, Recevoir, Swap, Signer) viendront
 * remplacer `send`/`receive`/`exchange`/`sign` quand elles seront dessinées.
 */
import React from 'react';
import type { Icon as PhosphorIcon, IconWeight } from 'phosphor-react-native';
import {
  HouseIcon, ChartLineUpIcon, WalletIcon, ListIcon, ArrowsLeftRightIcon, MagnifyingGlassIcon, BellIcon,
  PlusCircleIcon, ArrowUpIcon, ArrowDownIcon, ArrowsDownUpIcon, UserIcon, UsersIcon, BriefcaseIcon, GraphIcon,
  GlobeIcon, AddressBookIcon, TranslateIcon, CurrencyCircleDollarIcon, PaletteIcon, ShieldCheckIcon, DotsNineIcon,
  FileTextIcon, WrenchIcon, PuzzlePieceIcon, LifebuoyIcon, QuestionIcon, InfoIcon, TrashIcon, LinkIcon, CpuIcon,
  DownloadSimpleIcon, SparkleIcon, EyeIcon, EyeSlashIcon, CaretRightIcon, PlusIcon, ClockCounterClockwiseIcon,
  ImageIcon, ChartPieSliceIcon, LeafIcon, WarningIcon, ArrowsClockwiseIcon, GiftIcon, CopyIcon, StarIcon,
  CheckCircleIcon, XIcon, DotsThreeVerticalIcon, ArrowRightIcon, ShareNetworkIcon, ScanIcon, FlashlightIcon,
  PenNibIcon, ArrowLeftIcon, CaretDownIcon, CheckIcon, LockIcon, WarningCircleIcon, XCircleIcon, ClockIcon,
  DetectiveIcon, DesktopIcon, BroomIcon, SquaresFourIcon, CaretLeftIcon, LightbulbIcon,
  XLogoIcon, TelegramLogoIcon,
} from 'phosphor-react-native';
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
  | 'check' | 'info' | 'close' | 'more' | 'forward' | 'share' | 'scan' | 'flash' | 'flashOff' | 'sparkles'
  // Nouveaux (bible)
  | 'sign' | 'back' | 'caretDown' | 'checkmark' | 'lock' | 'alert' | 'errorCircle' | 'clock'
  | 'incognito' | 'desktop' | 'broom' | 'tabs' | 'caretLeft' | 'bulb'
  | 'xLogo' | 'telegramLogo';

const MAP: Record<IconName, { icon: PhosphorIcon; weight?: IconWeight }> = {
  home: { icon: HouseIcon },
  market: { icon: ChartLineUpIcon },
  wallet: { icon: WalletIcon },
  menu: { icon: ListIcon },
  exchange: { icon: ArrowsLeftRightIcon },
  search: { icon: MagnifyingGlassIcon },
  bell: { icon: BellIcon },
  buy: { icon: PlusCircleIcon },
  send: { icon: ArrowUpIcon },
  receive: { icon: ArrowDownIcon },
  convert: { icon: ArrowsDownUpIcon },
  profile: { icon: UserIcon },
  accounts: { icon: UsersIcon },
  wallets: { icon: BriefcaseIcon },
  networks: { icon: GraphIcon },
  dapps: { icon: GlobeIcon },
  contacts: { icon: AddressBookIcon },
  language: { icon: TranslateIcon },
  currency: { icon: CurrencyCircleDollarIcon },
  appearance: { icon: PaletteIcon },
  notifications: { icon: BellIcon },
  security: { icon: ShieldCheckIcon },
  pin: { icon: DotsNineIcon },
  phrase: { icon: FileTextIcon },
  developer: { icon: WrenchIcon },
  extensions: { icon: PuzzlePieceIcon },
  support: { icon: LifebuoyIcon },
  faq: { icon: QuestionIcon },
  about: { icon: InfoIcon },
  reset: { icon: TrashIcon },
  walletconnect: { icon: LinkIcon },
  ledger: { icon: CpuIcon },
  trezor: { icon: CpuIcon },
  import: { icon: DownloadSimpleIcon },
  create: { icon: SparkleIcon },
  eye: { icon: EyeIcon },
  eyeOff: { icon: EyeSlashIcon },
  chevron: { icon: CaretRightIcon },
  add: { icon: PlusIcon },
  history: { icon: ClockCounterClockwiseIcon },
  nft: { icon: ImageIcon },
  defi: { icon: ChartPieSliceIcon },
  staking: { icon: LeafIcon },
  warning: { icon: WarningIcon },
  refresh: { icon: ArrowsClockwiseIcon },
  gift: { icon: GiftIcon },
  copy: { icon: CopyIcon },
  star: { icon: StarIcon },
  starFilled: { icon: StarIcon, weight: 'fill' },
  check: { icon: CheckCircleIcon, weight: 'fill' },
  info: { icon: InfoIcon, weight: 'fill' },
  close: { icon: XIcon },
  more: { icon: DotsThreeVerticalIcon },
  forward: { icon: ArrowRightIcon },
  share: { icon: ShareNetworkIcon },
  scan: { icon: ScanIcon },
  flash: { icon: FlashlightIcon, weight: 'fill' },
  flashOff: { icon: FlashlightIcon },
  sparkles: { icon: SparkleIcon },
  sign: { icon: PenNibIcon },
  back: { icon: ArrowLeftIcon },
  caretDown: { icon: CaretDownIcon },
  checkmark: { icon: CheckIcon },
  lock: { icon: LockIcon },
  alert: { icon: WarningCircleIcon },
  errorCircle: { icon: XCircleIcon },
  clock: { icon: ClockIcon },
  incognito: { icon: DetectiveIcon },
  desktop: { icon: DesktopIcon },
  broom: { icon: BroomIcon },
  tabs: { icon: SquaresFourIcon },
  caretLeft: { icon: CaretLeftIcon },
  bulb: { icon: LightbulbIcon },
  xLogo: { icon: XLogoIcon },
  telegramLogo: { icon: TelegramLogoIcon },
};

export function Icon({
  name,
  size = 20,
  color,
  tone = 'text',
  weight,
}: {
  name: IconName;
  size?: number;
  /** Couleur explicite ; sinon `tone` est résolu sur le thème actif. */
  color?: string;
  tone?: 'text' | 'muted' | 'faint';
  /** « fill » uniquement pour l'onglet actif (§2.8). */
  weight?: IconWeight;
}) {
  const { colors } = useTheme();
  const toneColor = tone === 'muted' ? colors.textSecondary : tone === 'faint' ? colors.textTertiary : colors.text;
  const entry = MAP[name];
  const Cmp = entry.icon;
  return <Cmp size={size} color={color ?? toneColor} weight={weight ?? entry.weight ?? 'regular'} />;
}
