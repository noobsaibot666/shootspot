import type { IconProps, IconWeight, Icon as PhosphorIcon } from 'phosphor-react-native';
// One file per icon: only the icons listed here end up in the bundle. require() keeps TypeScript
// from type-checking Phosphor's .tsx sources (they target older React Native typings).
/* eslint-disable @typescript-eslint/no-require-imports */
const ApertureIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Aperture').ApertureIcon;
const BookmarkSimpleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/BookmarkSimple').BookmarkSimpleIcon;
const CameraIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Camera').CameraIcon;
const CameraRotateIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CameraRotate').CameraRotateIcon;
const CaretDownIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CaretDown').CaretDownIcon;
const CaretLeftIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CaretLeft').CaretLeftIcon;
const CaretRightIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon;
const CheckIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Check').CheckIcon;
const CheckCircleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CheckCircle').CheckCircleIcon;
const CircleIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Circle').CircleIcon;
const CloudSlashIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CloudSlash').CloudSlashIcon;
const CompassIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Compass').CompassIcon;
const CrosshairIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Crosshair').CrosshairIcon;
const DeviceRotateIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/DeviceRotate').DeviceRotateIcon;
const DotsThreeIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/DotsThree').DotsThreeIcon;
const DownloadSimpleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/DownloadSimple').DownloadSimpleIcon;
const DroneIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Drone').DroneIcon;
const ExportIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Export').ExportIcon;
const EyeSlashIcon: PhosphorIcon = require('phosphor-react-native/src/icons/EyeSlash').EyeSlashIcon;
const FilmSlateIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/FilmSlate').FilmSlateIcon;
const FilmStripIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/FilmStrip').FilmStripIcon;
const FlagIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Flag').FlagIcon;
const FolderSimpleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/FolderSimple').FolderSimpleIcon;
const GearIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Gear').GearIcon;
const GlobeHemisphereWestIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/GlobeHemisphereWest').GlobeHemisphereWestIcon;
const HeartIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Heart').HeartIcon;
const HouseIcon: PhosphorIcon = require('phosphor-react-native/src/icons/House').HouseIcon;
const ImagesSquareIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ImagesSquare').ImagesSquareIcon;
const ImagesIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Images').ImagesIcon;
const LightningIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Lightning').LightningIcon;
const LightningAIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/LightningA').LightningAIcon;
const LightningSlashIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/LightningSlash').LightningSlashIcon;
const ListIcon: PhosphorIcon = require('phosphor-react-native/src/icons/List').ListIcon;
const LockSimpleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/LockSimple').LockSimpleIcon;
const MagnifyingGlassIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/MagnifyingGlass').MagnifyingGlassIcon;
const MapPinIcon: PhosphorIcon = require('phosphor-react-native/src/icons/MapPin').MapPinIcon;
const MapTrifoldIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/MapTrifold').MapTrifoldIcon;
const MinusCircleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/MinusCircle').MinusCircleIcon;
const NavigationArrowIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/NavigationArrow').NavigationArrowIcon;
const PencilSimpleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/PencilSimple').PencilSimpleIcon;
const PlusIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Plus').PlusIcon;
const SignOutIcon: PhosphorIcon = require('phosphor-react-native/src/icons/SignOut').SignOutIcon;
const SlidersHorizontalIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SlidersHorizontal').SlidersHorizontalIcon;
const SquaresFourIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SquaresFour').SquaresFourIcon;
const SunIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Sun').SunIcon;
const SunHorizonIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SunHorizon').SunHorizonIcon;
const TrashIcon: PhosphorIcon = require('phosphor-react-native/src/icons/Trash').TrashIcon;
const UserIcon: PhosphorIcon = require('phosphor-react-native/src/icons/User').UserIcon;
const UserCircleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/UserCircle').UserCircleIcon;
const VideoCameraIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/VideoCamera').VideoCameraIcon;
const WarningCircleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/WarningCircle').WarningCircleIcon;
const XIcon: PhosphorIcon = require('phosphor-react-native/src/icons/X').XIcon;
const XCircleIcon: PhosphorIcon = require('phosphor-react-native/src/icons/XCircle').XCircleIcon;

/**
 * The app's icon set: Phosphor (modern, six weights, strong photo/video vocabulary). Names are
 * what the icon means here, not what it draws. Append ".fill" for the filled weight (selected
 * tabs, confirmed states).
 */
const ICONS = {
  add: PlusIcon,
  alert: WarningCircleIcon,
  aperture: ApertureIcon,
  back: CaretLeftIcon,
  boards: SquaresFourIcon,
  bookmark: BookmarkSimpleIcon,
  camera: CameraIcon,
  check: CheckIcon,
  circle: CircleIcon,
  close: XIcon,
  compass: CompassIcon,
  done: CheckCircleIcon,
  down: CaretDownIcon,
  download: DownloadSimpleIcon,
  drone: DroneIcon,
  edit: PencilSimpleIcon,
  film: FilmSlateIcon,
  filmStrip: FilmStripIcon,
  feed: ImagesSquareIcon,
  filters: SlidersHorizontalIcon,
  flag: FlagIcon,
  flash: LightningIcon,
  flashAuto: LightningAIcon,
  flashOff: LightningSlashIcon,
  flip: CameraRotateIcon,
  folder: FolderSimpleIcon,
  forward: CaretRightIcon,
  gallery: ImagesIcon,
  globe: GlobeHemisphereWestIcon,
  heart: HeartIcon,
  hidden: EyeSlashIcon,
  home: HouseIcon,
  locate: CrosshairIcon,
  map: MapTrifoldIcon,
  menu: ListIcon,
  more: DotsThreeIcon,
  navigate: NavigationArrowIcon,
  offline: CloudSlashIcon,
  person: UserIcon,
  lock: LockSimpleIcon,
  pin: MapPinIcon,
  profile: UserCircleIcon,
  rejected: XCircleIcon,
  remove: MinusCircleIcon,
  rotate: DeviceRotateIcon,
  search: MagnifyingGlassIcon,
  settings: GearIcon,
  share: ExportIcon,
  signOut: SignOutIcon,
  sun: SunIcon,
  sunset: SunHorizonIcon,
  trash: TrashIcon,
  video: VideoCameraIcon,
} satisfies Record<string, PhosphorIcon>;

type Base = keyof typeof ICONS;
export type IconName = Base | `${Base}.fill`;

export function Icon(props: {
  name: IconName;
  size?: number;
  color?: string;
  weight?: IconWeight;
  style?: IconProps['style'];
}) {
  // Icons are decorative: the button or row around them carries the accessible label.
  const [base, variant] = props.name.split('.') as [Base, string | undefined];
  const C = ICONS[base];
  return (
    <C
      size={props.size ?? 24}
      color={props.color}
      weight={props.weight ?? (variant === 'fill' ? 'fill' : 'regular')}
      style={props.style}
    />
  );
}
