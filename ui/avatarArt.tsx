/**
 * Rendu des avatars de portefeuille (données : lib/avatars.ts).
 *
 * `WalletAvatar` montre l'avatar d'un portefeuille — l'actif par défaut —, et
 * `AvatarPicker` permet d'en choisir un autre, dans l'un des deux styles.
 */
import React, { memo, useState } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { RocketLaunchIcon } from 'phosphor-react-native/src/icons/RocketLaunch';
import { DiamondIcon } from 'phosphor-react-native/src/icons/Diamond';
import { MoonStarsIcon } from 'phosphor-react-native/src/icons/MoonStars';
import { LightningIcon } from 'phosphor-react-native/src/icons/Lightning';
import { FireIcon } from 'phosphor-react-native/src/icons/Fire';
import { CrownIcon } from 'phosphor-react-native/src/icons/Crown';
import { PlanetIcon } from 'phosphor-react-native/src/icons/Planet';
import { StarIcon } from 'phosphor-react-native/src/icons/Star';
import { GhostIcon } from 'phosphor-react-native/src/icons/Ghost';
import { RobotIcon } from 'phosphor-react-native/src/icons/Robot';
import { AlienIcon } from 'phosphor-react-native/src/icons/Alien';
import { CatIcon } from 'phosphor-react-native/src/icons/Cat';
import { DogIcon } from 'phosphor-react-native/src/icons/Dog';
import { BirdIcon } from 'phosphor-react-native/src/icons/Bird';
import { ButterflyIcon } from 'phosphor-react-native/src/icons/Butterfly';
import { HorseIcon } from 'phosphor-react-native/src/icons/Horse';
import { FishIcon } from 'phosphor-react-native/src/icons/Fish';
import { RabbitIcon } from 'phosphor-react-native/src/icons/Rabbit';
import { CowIcon } from 'phosphor-react-native/src/icons/Cow';
import { PawPrintIcon } from 'phosphor-react-native/src/icons/PawPrint';
import { CactusIcon } from 'phosphor-react-native/src/icons/Cactus';
import { FlowerIcon } from 'phosphor-react-native/src/icons/Flower';
import { SunIcon } from 'phosphor-react-native/src/icons/Sun';
import { SnowflakeIcon } from 'phosphor-react-native/src/icons/Snowflake';
import { AtomIcon } from 'phosphor-react-native/src/icons/Atom';
import { InfinityIcon } from 'phosphor-react-native/src/icons/Infinity';
import { PizzaIcon } from 'phosphor-react-native/src/icons/Pizza';
import { GameControllerIcon } from 'phosphor-react-native/src/icons/GameController';
import { TrophyIcon } from 'phosphor-react-native/src/icons/Trophy';
import { CoinsIcon } from 'phosphor-react-native/src/icons/Coins';
import { Sheet, Text, Button, SegmentedControl, Pressable as KPressable } from './kit';
import { useTheme } from './theme';
import { space, radius } from './tokens';
import { haptic } from '../lib/haptics';
import { useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';
import {
  AVATAR_IDS_3D,
  AVATAR_IDS_FLAT,
  avatarForWallet,
  parseAvatar,
  randomAvatarId,
  type Avatar3dId,
  type AvatarFlatId,
  type AvatarStyle,
  type ParsedAvatar,
} from '../lib/avatars';

const STICKERS: Record<Avatar3dId, ImageSourcePropType> = {
  rocket: require('../assets/avatars/rocket.png'),
  gem_stone: require('../assets/avatars/gem_stone.png'),
  crescent_moon: require('../assets/avatars/crescent_moon.png'),
  spouting_whale: require('../assets/avatars/spouting_whale.png'),
  gorilla: require('../assets/avatars/gorilla.png'),
  frog: require('../assets/avatars/frog.png'),
  bear: require('../assets/avatars/bear.png'),
  dog_face: require('../assets/avatars/dog_face.png'),
  cat_face: require('../assets/avatars/cat_face.png'),
  unicorn: require('../assets/avatars/unicorn.png'),
  fox: require('../assets/avatars/fox.png'),
  fire: require('../assets/avatars/fire.png'),
  high_voltage: require('../assets/avatars/high_voltage.png'),
  money_bag: require('../assets/avatars/money_bag.png'),
  crown: require('../assets/avatars/crown.png'),
  money_mouth_face: require('../assets/avatars/money_mouth_face.png'),
  smiling_face_with_sunglasses: require('../assets/avatars/smiling_face_with_sunglasses.png'),
  robot: require('../assets/avatars/robot.png'),
  alien_monster: require('../assets/avatars/alien_monster.png'),
  alien: require('../assets/avatars/alien.png'),
  penguin: require('../assets/avatars/penguin.png'),
  owl: require('../assets/avatars/owl.png'),
  octopus: require('../assets/avatars/octopus.png'),
  shark: require('../assets/avatars/shark.png'),
  dragon: require('../assets/avatars/dragon.png'),
  panda: require('../assets/avatars/panda.png'),
  lion: require('../assets/avatars/lion.png'),
  tiger_face: require('../assets/avatars/tiger_face.png'),
  ringed_planet: require('../assets/avatars/ringed_planet.png'),
  rainbow: require('../assets/avatars/rainbow.png'),
  glowing_star: require('../assets/avatars/glowing_star.png'),
  ghost: require('../assets/avatars/ghost.png'),
  pizza: require('../assets/avatars/pizza.png'),
  doughnut: require('../assets/avatars/doughnut.png'),
  hamster: require('../assets/avatars/hamster.png'),
  monkey_face: require('../assets/avatars/monkey_face.png'),
  butterfly: require('../assets/avatars/butterfly.png'),
  four_leaf_clover: require('../assets/avatars/four_leaf_clover.png'),
  koala: require('../assets/avatars/koala.png'),
  rabbit_face: require('../assets/avatars/rabbit_face.png'),
};

const GLYPHS: Record<AvatarFlatId, PhosphorIcon> = {
  rocket: RocketLaunchIcon,
  diamond: DiamondIcon,
  moon: MoonStarsIcon,
  lightning: LightningIcon,
  fire: FireIcon,
  crown: CrownIcon,
  planet: PlanetIcon,
  star: StarIcon,
  ghost: GhostIcon,
  robot: RobotIcon,
  alien: AlienIcon,
  cat: CatIcon,
  dog: DogIcon,
  bird: BirdIcon,
  butterfly: ButterflyIcon,
  horse: HorseIcon,
  fish: FishIcon,
  rabbit: RabbitIcon,
  cow: CowIcon,
  paw: PawPrintIcon,
  cactus: CactusIcon,
  flower: FlowerIcon,
  sun: SunIcon,
  snowflake: SnowflakeIcon,
  atom: AtomIcon,
  infinity: InfinityIcon,
  pizza: PizzaIcon,
  game: GameControllerIcon,
  trophy: TrophyIcon,
  coins: CoinsIcon,
};

/** Un avatar déjà résolu, à la taille voulue. */
export const AvatarArt = memo(function AvatarArt({ avatar, size }: { avatar: ParsedAvatar; size: number }) {
  const Glyph = avatar.style === 'flat' ? GLYPHS[avatar.key as AvatarFlatId] : null;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatar.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {Glyph ? (
        <Glyph size={size * 0.56} color="#FFFFFF" weight="fill" />
      ) : (
        <Image source={STICKERS[avatar.key as Avatar3dId]} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" accessibilityIgnoresInvertColors />
      )}
    </View>
  );
});

/** Avatar d'un portefeuille (l'actif si `walletId` est omis). */
export function WalletAvatar({ walletId, size = 32 }: { walletId?: string; size?: number }) {
  const wallet = useWallet((s) => s.wallets.find((w) => w.id === (walletId ?? s.activeWalletId)));
  if (!wallet) return <View style={{ width: size, height: size }} />;
  return <AvatarArt avatar={avatarForWallet(wallet)} size={size} />;
}

/** Feuille de choix de l'avatar d'un portefeuille. */
export function AvatarPicker({ walletId, visible, onClose }: { walletId: string; visible: boolean; onClose: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const wallet = useWallet((s) => s.wallets.find((w) => w.id === walletId));
  const setWalletAvatar = useWallet((s) => s.setWalletAvatar);
  const current = wallet ? avatarForWallet(wallet) : undefined;
  const [style, setStyle] = useState<AvatarStyle>(current?.style ?? '3d');
  const ids = style === '3d' ? AVATAR_IDS_3D : AVATAR_IDS_FLAT;
  const currentId = current ? `${current.style}:${current.key}` : undefined;

  const choose = (id: string) => {
    haptic.selection();
    void setWalletAvatar(walletId, id);
  };
  const shuffle = () => {
    let next: string = randomAvatarId();
    if (style === 'flat') next = AVATAR_IDS_FLAT[Math.floor(Math.random() * AVATAR_IDS_FLAT.length)];
    if (next === currentId) next = ids[(ids.indexOf(next as never) + 1) % ids.length];
    choose(next);
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', gap: space[3] }}>
        {current ? <AvatarArt avatar={current} size={88} /> : null}
        <Text variant="title2">{t('avatarTitle')}</Text>
      </View>
      <SegmentedControl
        items={[{ key: '3d', label: t('avatarStyle3d') }, { key: 'flat', label: t('avatarStyleFlat') }]}
        value={style}
        onChange={(k) => setStyle(k as AvatarStyle)}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[3] }}>
        {ids.map((id) => {
          const avatar = parseAvatar(id)!;
          const on = id === currentId;
          return (
            <KPressable
              key={id}
              onPress={() => choose(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={avatar.key.replace(/_/g, ' ')}
              style={{ padding: 3, borderRadius: radius.round, borderWidth: 2, borderColor: on ? colors.primary : 'transparent' }}
            >
              <AvatarArt avatar={avatar} size={52} />
            </KPressable>
          );
        })}
      </View>
      <Button label={t('avatarShuffle')} variant="secondary" onPress={shuffle} />
    </Sheet>
  );
}
