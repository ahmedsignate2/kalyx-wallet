import { sanitizeLog } from './sanitizeLog';

const SEED12 = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

describe('phrase de récupération — la faille corrigée', () => {
  it('masque une seed en texte libre', () => {
    const out = sanitizeLog(`Erreur de dérivation : ${SEED12}`);
    expect(out).not.toContain('abandon');
    expect(out).not.toContain('accident');
    expect(out).toContain('[PHRASE_RÉCUPÉRATION_MASQUÉE]');
  });

  it('masque une seed dans du JSON, y compris sous une clé non surveillée', () => {
    // `phrase` n'était PAS dans la liste des clés sensibles : seuls `mnemonic`
    // et `seed` l'étaient. C'est par là que ça passait.
    const out = sanitizeLog(JSON.stringify({ phrase: SEED12 }));
    expect(out).not.toContain('abandon');
  });

  it('masque une seed séparée par des virgules ou des retours à la ligne', () => {
    for (const sep of [', ', '\n', '","']) {
      const out = sanitizeLog(SEED12.split(' ').join(sep));
      expect(out).not.toContain('abandon');
    }
  });

  it('masque même une seed TRONQUÉE (8 mots suffisent)', () => {
    const out = sanitizeLog(SEED12.split(' ').slice(0, 8).join(' '));
    expect(out).toContain('[PHRASE_RÉCUPÉRATION_MASQUÉE]');
  });

  it('ne sur-réagit pas sur une phrase anglaise ordinaire', () => {
    // Plusieurs de ces mots sont dans la wordlist BIP-39, mais jamais huit
    // d'affilée : un message technique normal doit rester lisible.
    const msg = 'Unable to access the network above the usual limit, try again';
    expect(sanitizeLog(msg)).toBe(msg);
  });

  it('laisse intact un message technique français', () => {
    const msg = 'RPC error on eth_getBalance: status 500 (aucun serveur ne répond)';
    expect(sanitizeLog(msg)).toBe(msg);
  });
});

describe('autres secrets', () => {
  it('masque une clé étendue BIP-32, qui dérive tout le wallet', () => {
    const xprv = 'xprv' + 'A'.repeat(90);
    expect(sanitizeLog(`key=${xprv}`)).not.toContain(xprv);
  });

  it('masque une clé hexadécimale de 64 caractères', () => {
    const k = 'a'.repeat(64);
    expect(sanitizeLog(`priv ${k}`)).toContain('[CLÉ_PRIVÉE_MASQUÉE]');
  });

  it('masque un PIN nommé', () => {
    expect(sanitizeLog('{"pin":"481922"}')).not.toContain('481922');
  });

  it('RACCOURCIT une adresse au lieu de la masquer : elle est publique et utile', () => {
    const addr = '0x' + 'b'.repeat(40);
    const out = sanitizeLog(`to=${addr}`);
    expect(out).not.toContain(addr);
    expect(out).toContain('0xbbbb...bbbb');
  });
});
