/**
 * Identifiant ALÉATOIRE de cette installation, pour la sauvegarde Drive.
 *
 * Il ne sert qu'à une chose : savoir si la sauvegarde en ligne a été écrite par
 * CE téléphone ou par un autre, avant de la remplacer (src/domain/backup/drive.ts).
 * Ce n'est ni un identifiant matériel ni un traceur : 16 octets du CSPRNG,
 * tirés au premier besoin, conservés dans AsyncStorage, perdus à la
 * désinstallation (un téléphone réinstallé est alors « un autre appareil »,
 * ce qui demande une confirmation de plus — jamais une perte).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bytesToHex } from '@noble/hashes/utils';
import { getRandomBytes } from '../src/crypto/random';

const KEY = 'kalyx.deviceId';
let cached: Promise<string> | null = null;

async function loadOrCreate(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
  const id = bytesToHex(getRandomBytes(16));
  await AsyncStorage.setItem(KEY, id);
  return id;
}

/** L'identifiant de l'installation (créé au premier appel). */
export function getDeviceId(): Promise<string> {
  if (!cached) {
    cached = loadOrCreate().catch((e) => {
      cached = null; // stockage indisponible : on retentera, sans figer un identifiant non persisté
      throw e;
    });
  }
  return cached;
}
