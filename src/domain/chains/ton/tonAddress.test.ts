import {
  crc16Xmodem,
  parseTonAddress,
  formatTonAddress,
  toRawTonAddress,
  parseRawTonAddress,
  isValidTonAddress,
} from './tonAddress';

const HASH = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));

describe('crc16Xmodem', () => {
  /*
   * Vecteurs standards du CRC16-XMODEM. TON n'utilise PAS le CRC16 « classique »
   * (polynôme 0xA001 réfléchi) : les confondre produit un contrôle qui échoue sur
   * toutes les adresses réelles, ce qui les ferait toutes refuser.
   */
  it('donne les valeurs de référence', () => {
    expect(crc16Xmodem(new TextEncoder().encode('123456789'))).toBe(0x31c3);
    expect(crc16Xmodem(new Uint8Array())).toBe(0x0000);
    expect(crc16Xmodem(Uint8Array.from([0x41]))).toBe(0x58e5);
  });
});

describe('formatTonAddress / parseTonAddress', () => {
  /*
   * LE DRAPEAU DE REBOND est ce qui distingue `EQ…` de `UQ…`, et c'est lui qui
   * décide si des fonds reviennent ou restent quand le compte destinataire n'est
   * pas déployé. Le préfixe n'est pas décoratif : il découle du marqueur.
   */
  it('une adresse rebondissante commence par EQ, une non rebondissante par UQ', () => {
    expect(formatTonAddress({ workchain: 0, hash: HASH }, { bounceable: true }).startsWith('EQ')).toBe(true);
    expect(formatTonAddress({ workchain: 0, hash: HASH }, { bounceable: false }).startsWith('UQ')).toBe(true);
  });

  it('l’aller-retour conserve tout', () => {
    for (const bounceable of [true, false]) {
      for (const testnet of [false, true]) {
        const s = formatTonAddress({ workchain: 0, hash: HASH }, { bounceable, testnet });
        const back = parseTonAddress(s)!;
        expect(back).not.toBeNull();
        expect(back.workchain).toBe(0);
        expect(back.bounceable).toBe(bounceable);
        expect(back.testnet).toBe(testnet);
        expect([...back.hash]).toEqual([...HASH]);
      }
    }
  });

  /*
   * Le workchain est un entier SIGNÉ sur un octet : la masterchain vaut -1, écrit
   * 0xFF. Le lire comme non signé donnerait 255 — un workchain inexistant — et
   * ferait refuser une adresse masterchain valide.
   */
  it('la masterchain (-1) survit à l’aller-retour', () => {
    const s = formatTonAddress({ workchain: -1, hash: HASH }, { bounceable: true });
    expect(parseTonAddress(s)!.workchain).toBe(-1);
  });

  /** Les deux alphabets base64 circulent : refuser l'un ferait échouer des adresses valides. */
  it('accepte la forme non url-safe', () => {
    const urlSafe = formatTonAddress({ workchain: 0, hash: HASH }, { bounceable: true });
    const plain = formatTonAddress({ workchain: 0, hash: HASH }, { bounceable: true, urlSafe: false });
    expect(parseTonAddress(plain)).not.toBeNull();
    expect([...parseTonAddress(plain)!.hash]).toEqual([...parseTonAddress(urlSafe)!.hash]);
  });

  it('refuse un hachage qui n’a pas 32 octets', () => {
    expect(() => formatTonAddress({ workchain: 0, hash: new Uint8Array(31) }, { bounceable: true })).toThrow();
  });
});

describe('parseTonAddress — refus', () => {
  /** Un CRC faux est une faute de frappe, pas une adresse. */
  it('REFUSE une somme de contrôle invalide', () => {
    const good = formatTonAddress({ workchain: 0, hash: HASH }, { bounceable: true });
    const broken = good.slice(0, 44) + (good[44] === 'A' ? 'B' : 'A') + good.slice(45);
    expect(parseTonAddress(broken)).toBeNull();
  });

  it('REFUSE une longueur inattendue, une adresse vide ou du n’importe quoi', () => {
    expect(parseTonAddress('')).toBeNull();
    expect(parseTonAddress('   ')).toBeNull();
    expect(parseTonAddress('pas une adresse')).toBeNull();
    expect(parseTonAddress('EQ' + 'A'.repeat(10))).toBeNull();
  });

  /** Un marqueur inconnu n'est ni rebondissant ni non rebondissant : on refuse. */
  it('REFUSE un marqueur hors spécification', () => {
    const body = Uint8Array.from([0x23, 0x00, ...HASH]);
    const crc = crc16Xmodem(body);
    const full = Uint8Array.from([...body, (crc >> 8) & 0xff, crc & 0xff]);
    const b64 = Buffer.from(full).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    expect(parseTonAddress(b64)).toBeNull();
  });
});

describe('forme brute', () => {
  it('aller-retour workchain:hachage', () => {
    const raw = toRawTonAddress({ workchain: 0, hash: HASH });
    expect(raw).toMatch(/^0:[0-9a-f]{64}$/);
    expect([...parseRawTonAddress(raw)!.hash]).toEqual([...HASH]);
    expect(parseRawTonAddress(toRawTonAddress({ workchain: -1, hash: HASH }))!.workchain).toBe(-1);
  });

  it('refuse un workchain inexistant ou un hachage tronqué', () => {
    expect(parseRawTonAddress('2:' + '00'.repeat(32))).toBeNull();
    expect(parseRawTonAddress('0:' + '00'.repeat(31))).toBeNull();
  });
});

describe('isValidTonAddress', () => {
  /*
   * Comme pour Bitcoin, une adresse de TEST doit être refusée sur le réseau
   * principal : elle y désigne un compte qui n'existe pas, et les fonds seraient
   * perdus sans que rien ne l'annonce.
   */
  it('refuse une adresse de test sur le réseau principal, et l’inverse', () => {
    const main = formatTonAddress({ workchain: 0, hash: HASH }, { bounceable: true });
    const test = formatTonAddress({ workchain: 0, hash: HASH }, { bounceable: true, testnet: true });
    expect(isValidTonAddress(main)).toBe(true);
    expect(isValidTonAddress(test)).toBe(false);
    expect(isValidTonAddress(test, { testnet: true })).toBe(true);
    expect(isValidTonAddress(main, { testnet: true })).toBe(false);
  });

  it('accepte la forme brute', () => {
    expect(isValidTonAddress(toRawTonAddress({ workchain: 0, hash: HASH }))).toBe(true);
  });

  it('refuse ce qui n’est pas une adresse', () => {
    expect(isValidTonAddress('0x28C6c06298d514Db089934071355E5743bf21d60')).toBe(false);
    expect(isValidTonAddress('')).toBe(false);
  });
});
