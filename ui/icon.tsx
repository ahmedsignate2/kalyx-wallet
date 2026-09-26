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
/*
 * UNE IMPORTATION PAR ICÔNE, pas le point d'entrée du paquet.
 *
 * `import { … } from 'phosphor-react-native'` passe par un index qui réexporte
 * les 1 512 icônes dans toutes leurs graisses. Metro ne fait pas de tree-shaking :
 * tout partait dans le bundle. Mesuré sur l'export web avec les source maps —
 * 5,6 Mo, 40 % du JavaScript que télécharge le tableau de bord (et la mini-app
 * Telegram) avant d'afficher quoi que ce soit, pour les 69 icônes utilisées ici.
 * Le paquet expose chaque icône par `./src/icons/*` ; ces modules ne tirent que
 * leur propre tracé et `icon-base`, jamais l'index.
 *
 * Ajouter une icône : une ligne ici, sur le même modèle.
 *
 * Pour tsc, `tsconfig.json` redirige ces chemins vers les déclarations publiées
 * du paquet (`lib/typescript/icons`) : sa source ne passe pas notre
 * configuration stricte. Metro, lui, compile la source — c'est voulu.
 */
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ChartLineUpIcon } from 'phosphor-react-native/src/icons/ChartLineUp';
import { WalletIcon } from 'phosphor-react-native/src/icons/Wallet';
import { ListIcon } from 'phosphor-react-native/src/icons/List';
import { ArrowsLeftRightIcon } from 'phosphor-react-native/src/icons/ArrowsLeftRight';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { PlusCircleIcon } from 'phosphor-react-native/src/icons/PlusCircle';
import { ArrowUpIcon } from 'phosphor-react-native/src/icons/ArrowUp';
import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { ArrowsDownUpIcon } from 'phosphor-react-native/src/icons/ArrowsDownUp';
import { UserIcon } from 'phosphor-react-native/src/icons/User';
import { UsersIcon } from 'phosphor-react-native/src/icons/Users';
import { BriefcaseIcon } from 'phosphor-react-native/src/icons/Briefcase';
import { GraphIcon } from 'phosphor-react-native/src/icons/Graph';
import { GlobeIcon } from 'phosphor-react-native/src/icons/Globe';
import { AddressBookIcon } from 'phosphor-react-native/src/icons/AddressBook';
import { TranslateIcon } from 'phosphor-react-native/src/icons/Translate';
import { CurrencyCircleDollarIcon } from 'phosphor-react-native/src/icons/CurrencyCircleDollar';
import { PaletteIcon } from 'phosphor-react-native/src/icons/Palette';
import { ShieldCheckIcon } from 'phosphor-react-native/src/icons/ShieldCheck';
import { DotsNineIcon } from 'phosphor-react-native/src/icons/DotsNine';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { WrenchIcon } from 'phosphor-react-native/src/icons/Wrench';
import { PuzzlePieceIcon } from 'phosphor-react-native/src/icons/PuzzlePiece';
import { LifebuoyIcon } from 'phosphor-react-native/src/icons/Lifebuoy';
import { QuestionIcon } from 'phosphor-react-native/src/icons/Question';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { LinkIcon } from 'phosphor-react-native/src/icons/Link';
import { CpuIcon } from 'phosphor-react-native/src/icons/Cpu';
import { DownloadSimpleIcon } from 'phosphor-react-native/src/icons/DownloadSimple';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { ClockCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import { ImageIcon } from 'phosphor-react-native/src/icons/Image';
import { ChartPieSliceIcon } from 'phosphor-react-native/src/icons/ChartPieSlice';
import { LeafIcon } from 'phosphor-react-native/src/icons/Leaf';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { GiftIcon } from 'phosphor-react-native/src/icons/Gift';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { StarIcon } from 'phosphor-react-native/src/icons/Star';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { DotsThreeVerticalIcon } from 'phosphor-react-native/src/icons/DotsThreeVertical';
import { ArrowRightIcon } from 'phosphor-react-native/src/icons/ArrowRight';
import { ShareNetworkIcon } from 'phosphor-react-native/src/icons/ShareNetwork';
import { ScanIcon } from 'phosphor-react-native/src/icons/Scan';
import { FlashlightIcon } from 'phosphor-react-native/src/icons/Flashlight';
import { PenNibIcon } from 'phosphor-react-native/src/icons/PenNib';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { LockIcon } from 'phosphor-react-native/src/icons/Lock';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { XCircleIcon } from 'phosphor-react-native/src/icons/XCircle';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { DetectiveIcon } from 'phosphor-react-native/src/icons/Detective';
import { DesktopIcon } from 'phosphor-react-native/src/icons/Desktop';
import { BroomIcon } from 'phosphor-react-native/src/icons/Broom';
import { SquaresFourIcon } from 'phosphor-react-native/src/icons/SquaresFour';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { LightbulbIcon } from 'phosphor-react-native/src/icons/Lightbulb';
import { XLogoIcon } from 'phosphor-react-native/src/icons/XLogo';
import { TelegramLogoIcon } from 'phosphor-react-native/src/icons/TelegramLogo';
import { GithubLogoIcon } from 'phosphor-react-native/src/icons/GithubLogo';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
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
  | 'xLogo' | 'telegramLogo' | 'githubLogo' | 'gear'
  | 'image';

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
  githubLogo: { icon: GithubLogoIcon },
  gear: { icon: GearSixIcon },
  // Même glyphe que `nft` : c'est une image dans les deux cas, et « nft »
  // ne veut rien dire sur un bouton « lire une image ».
  image: { icon: ImageIcon },
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
