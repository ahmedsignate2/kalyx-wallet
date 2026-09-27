import V from '../tonconnect/connect-link-vectors.json';
import { parseQr } from './parse';
import { describeQr } from './route';

describe('QR TON Connect', () => {
  it.each([['Tonkeeper', V.tonkeeper], ['Telegram Wallet', V.telegram], ['tc://', V.tc]])('%s : reconnu, jamais ouvert dans le navigateur', (_n, link) => {
    expect(parseQr(link)).toEqual({ kind: 'tonconnect', link });
  });

  it('un lien https ordinaire reste une URL', () => {
    expect(parseQr('https://app.ston.fi/swap').kind).toBe('url');
  });

  it('décrit la demande', () => {
    expect(describeQr(parseQr(V.tonkeeper), (k) => k)).toMatchObject({ title: 'qrTcTitle', cta: 'connect', danger: false });
  });
});
