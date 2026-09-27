import { AVATARS_3D, AVATAR_IDS_3D, AVATAR_IDS_FLAT, avatarForWallet, parseAvatar, randomAvatarId } from './avatars';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('avatars', () => {
  it('chaque sticker 3D a son image', () => {
    for (const key of Object.keys(AVATARS_3D)) {
      expect(existsSync(join(__dirname, '..', 'assets', 'avatars', `${key}.png`))).toBe(true);
    }
  });

  it('lit les deux styles et refuse l’inconnu', () => {
    expect(parseAvatar('3d:rocket')).toMatchObject({ style: '3d', key: 'rocket' });
    expect(parseAvatar('flat:diamond')).toMatchObject({ style: 'flat', key: 'diamond' });
    expect(parseAvatar('3d:inconnu')).toBeUndefined();
    expect(parseAvatar('flat:rocket:x')).toMatchObject({ key: 'rocket' });
    expect(parseAvatar('rocket')).toBeUndefined();
    expect(parseAvatar(undefined)).toBeUndefined();
  });

  it('tire toujours un sticker 3D valide, bornes comprises', () => {
    expect(randomAvatarId(() => 0)).toBe(AVATAR_IDS_3D[0]);
    expect(randomAvatarId(() => 0.999999)).toBe(AVATAR_IDS_3D[AVATAR_IDS_3D.length - 1]);
    expect(randomAvatarId(() => 1)).toBe(AVATAR_IDS_3D[0]);
    for (let i = 0; i < 50; i++) expect(parseAvatar(randomAvatarId())).toBeDefined();
  });

  it('garde l’avatar choisi, sinon un avatar stable tiré de l’identifiant', () => {
    expect(avatarForWallet({ id: 'w1', avatar: 'flat:sun' }).key).toBe('sun');
    const a = avatarForWallet({ id: 'wabc123' });
    expect(avatarForWallet({ id: 'wabc123' })).toEqual(a);
    expect(avatarForWallet({ id: 'wabc123', avatar: '3d:disparu' })).toEqual(a);
  });

  it('les identifiants plats sont tous lisibles', () => {
    for (const id of AVATAR_IDS_FLAT) expect(parseAvatar(id)).toBeDefined();
  });
});
