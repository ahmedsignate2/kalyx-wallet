jest.mock('./knownTxHashes', () => ({ knownTxHashes: () => [] }));
import { buildDiagnosticExport, technicalLogger } from './technicalLogger';

const ADDR = '0x52908400098527886E0F7030069857D2E4169EE7';
const KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

describe('Export développeur', () => {
  it('assaini : ni adresse complète, ni clé, ni phrase, ni jeton dans une URL', () => {
    const out = buildDiagnosticExport({
      log: [`envoi depuis ${ADDR}`, `clé ${KEY}`, PHRASE],
      rpc: 'https://eth-mainnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUvWxYz012345?apikey=zzz',
    });
    expect(out.blocked).toBe(false);
    expect(out.text).not.toContain(ADDR);
    expect(out.text).toMatch(/0x5290(…|\.\.\.)9EE7/);
    expect(out.text).not.toContain(KEY);
    expect(out.text).not.toContain('abandon ability');
    expect(out.text).not.toContain('AbCdEfGhIjKlMnOpQrStUvWxYz012345');
    expect(out.text).not.toContain('apikey=zzz');
    expect(() => JSON.parse(out.text)).not.toThrow();
  });

  it('technicalLogger.subscribe : notifié à chaque entrée, désabonnement effectif', () => {
    const fn = jest.fn();
    const off = technicalLogger.subscribe(fn);
    technicalLogger.logSys('a');
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    technicalLogger.logSys('b');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
