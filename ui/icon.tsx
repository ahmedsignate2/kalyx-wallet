/**
 * Icônes Kalyx — un seul set : Phosphor (§2.8). Graisse « regular » partout,
 * « fill » réservé à l'onglet actif (`weight="fill"`). Zéro emoji.
 *
 * L'API `<Icon name="send" />` est conservée : les écrans existants n'ont rien
 * à changer. Les 4 icônes maison (Envoyer, Recevoir, Swap, Signer) viendront
 * remplacer `send`/`receive`/`exchange`/`sign` quand elles seront dessinées.
 */
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
import { BankIcon } from 'phosphor-react-native/src/icons/Bank';
import { CreditCardIcon } from 'phosphor-react-native/src/icons/CreditCard';
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
import { SquareIcon } from 'phosphor-react-native/src/icons/Square';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { LightbulbIcon } from 'phosphor-react-native/src/icons/Lightbulb';
import { XLogoIcon } from 'phosphor-react-native/src/icons/XLogo';
import { TelegramLogoIcon } from 'phosphor-react-native/src/icons/TelegramLogo';
import { GithubLogoIcon } from 'phosphor-react-native/src/icons/GithubLogo';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
import { TrendUpIcon } from 'phosphor-react-native/src/icons/TrendUp';
import { TrendDownIcon } from 'phosphor-react-native/src/icons/TrendDown';
import { ArrowUpRightIcon } from 'phosphor-react-native/src/icons/ArrowUpRight';
import { BackspaceIcon } from 'phosphor-react-native/src/icons/Backspace';
import type { ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
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
  | 'image'
  // Glyphes texte remplacés (↑/↓ des variations, ↗ lien externe, ⇅ bascule, ✗ refus)
  | 'trendUp' | 'trendDown' | 'arrowUpRight' | 'arrowsDownUp' | 'cross' | 'backspace'
  // Cadre du compteur d'onglets (le nombre est posé dessus)
  | 'tabFrame'
  | 'card' | 'bank'
  // Onglets de la barre du bas (glyphes maison, voir LINE)
  | 'tabHome' | 'tabExplore' | 'tabActivity' | 'tabSettings';

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
  bank: { icon: BankIcon },
  card: { icon: CreditCardIcon },
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
  // Dessinés dans LINE ; l'entrée Phosphor ne sert que de repli typé.
  tabHome: { icon: HouseIcon },
  tabExplore: { icon: GlobeIcon },
  tabActivity: { icon: ListIcon },
  tabSettings: { icon: GearSixIcon },
  // Même glyphe que `nft` : c'est une image dans les deux cas, et « nft »
  // ne veut rien dire sur un bouton « lire une image ».
  image: { icon: ImageIcon },
  trendUp: { icon: TrendUpIcon },
  trendDown: { icon: TrendDownIcon },
  arrowUpRight: { icon: ArrowUpRightIcon },
  arrowsDownUp: { icon: ArrowsDownUpIcon },
  cross: { icon: XIcon },
  backspace: { icon: BackspaceIcon },
  tabFrame: { icon: SquareIcon },
};

/*
 * GLYPHES DE NAVIGATION — dessinés pour Kalyx, pas tirés d'un set.
 *
 * Ce sont les icônes qu'on touche sans les lire : retour, fermer, partager,
 * chercher, la cloche, le scanner, et les quatre onglets. Un seul trait
 * (1,75 sur une grille de 24, bouts et angles ARRONDIS), un peu plus présent
 * que le « regular » de Phosphor : elles tiennent l'en-tête sans disque autour,
 * comme sur la maquette, et restent nettes posées sur le paysage.
 */
const STROKE = 1.75;
const LINE: Partial<Record<IconName, (c: string) => ReactNode>> = {
  back: () => <Path d="M14.5 5.5 8 12l6.5 6.5" />,
  close: () => <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  share: () => <Path d="M12 14.5V3.5M8 7.25 12 3.5l4 3.75M8.5 10.5H7A2 2 0 0 0 5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5" />,
  search: () => <><Circle cx={10.75} cy={10.75} r={6.25} /><Path d="M15.5 15.5 20 20" /></>,
  bell: () => <Path d="M6 16.75V11a6 6 0 0 1 12 0v5.75l1.5 1.75h-15L6 16.75ZM10 21h4" />,
  scan: () => <Path d="M4 8.5v-2A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2M7.5 12h9" />,
  more: (c) => <><Circle cx={12} cy={5.5} r={1.4} fill={c} stroke="none" /><Circle cx={12} cy={12} r={1.4} fill={c} stroke="none" /><Circle cx={12} cy={18.5} r={1.4} fill={c} stroke="none" /></>,
  tabHome: () => <Path d="M4 10.25 12 3.75l8 6.5v8.75a1.5 1.5 0 0 1-1.5 1.5H15v-5.25a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.25H5.5A1.5 1.5 0 0 1 4 19v-8.75Z" />,
  tabExplore: () => <><Circle cx={12} cy={12} r={8.75} /><Path d="M15.6 8.4 13.5 13.5 8.4 15.6l2.1-5.1 5.1-2.1Z" /></>,
  tabActivity: (c) => <><Path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" /><Circle cx={5} cy={6.5} r={1.25} fill={c} stroke="none" /><Circle cx={5} cy={12} r={1.25} fill={c} stroke="none" /><Circle cx={5} cy={17.5} r={1.25} fill={c} stroke="none" /></>,
  tabSettings: () => <><Path d="M18.86 10.61L21.13 10.9V13.1L18.86 13.39L17.83 15.87L19.24 17.68L17.68 19.24L15.87 17.83L13.39 18.86L13.1 21.13H10.9L10.61 18.86L8.13 17.83L6.32 19.24L4.76 17.68L6.17 15.87L5.14 13.39L2.87 13.1V10.9L5.14 10.61L6.17 8.13L4.76 6.32L6.32 4.76L8.13 6.17L10.61 5.14L10.9 2.87H13.1L13.39 5.14L15.87 6.17L17.68 4.76L19.24 6.32L17.83 8.13Z" /><Circle cx={12} cy={12} r={3} /></>,
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
  const c = color ?? toneColor;
  const line = LINE[name];
  if (line) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        {line(c)}
      </Svg>
    );
  }
  const entry = MAP[name];
  const Cmp = entry.icon;
  return <Cmp size={size} color={color ?? toneColor} weight={weight ?? entry.weight ?? 'regular'} />;
}
