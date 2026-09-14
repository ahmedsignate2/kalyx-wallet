import { withTimeout, tryInOrder } from './net';
import { isWalletError } from '../errors';

const delay = <T>(ms: number, value: T): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), ms));
const never = (): Promise<never> => new Promise(() => {});

describe('withTimeout', () => {
  it('résout si la promesse répond à temps', async () => {
    await expect(withTimeout(delay(5, 'ok'), 100, () => new Error('t'))).resolves.toBe('ok');
  });

  it('rejette avec l’erreur de timeout si trop lent', async () => {
    await expect(withTimeout(never(), 20, () => new Error('timeout'))).rejects.toThrow('timeout');
  });

  it('propage l’erreur d’origine si la promesse rejette avant le timeout', async () => {
    const p = Promise.reject(new Error('boom'));
    await expect(withTimeout(p, 100, () => new Error('timeout'))).rejects.toThrow('boom');
  });
});

describe('tryInOrder (fallback)', () => {
  it('renvoie le premier item qui réussit (fallback sur erreur transitoire)', async () => {
    const tried: string[] = [];
    const res = await tryInOrder(
      ['a', 'b', 'c'],
      async (x) => {
        tried.push(x);
        if (x === 'b') return `ok:${x}`;
        throw new Error('timeout'); // transitoire → on passe au suivant
      },
      { timeoutMs: 100 },
    );
    expect(res).toBe('ok:b');
    expect(tried).toEqual(['a', 'b']); // s'arrête dès le succès
  });

  it('saute un endpoint qui traîne (timeout) et passe au suivant', async () => {
    const res = await tryInOrder(
      ['lent', 'rapide'],
      async (x) => (x === 'lent' ? never() : `ok:${x}`),
      { timeoutMs: 30 },
    );
    expect(res).toBe('ok:rapide');
  });

  it('lève RPC_UNAVAILABLE si tous échouent de façon transitoire', async () => {
    try {
      await tryInOrder(['a', 'b'], async () => {
        throw new Error('network error'); // transitoire
      }, { timeoutMs: 30 });
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('RPC_UNAVAILABLE');
    }
  });

  it('relance immédiatement une erreur déterministe (revert) sans essayer les autres RPC', async () => {
    const tried: string[] = [];
    await expect(
      tryInOrder(['a', 'b'], async (x) => {
        tried.push(x);
        throw new Error('execution reverted: insufficient allowance');
      }, { timeoutMs: 30 }),
    ).rejects.toThrow('execution reverted');
    expect(tried).toEqual(['a']); // pas de rotation : le 2e RPC n'est pas essayé
  });
});

describe('tryInOrder (mémoire de santé)', () => {
  it('met en tête le dernier RPC qui a répondu et évite celui en panne', async () => {
    const { resetRpcHealth } = await import('./net');
    resetRpcHealth();
    const calls: string[] = [];
    const op = async (u: string) => {
      calls.push(u);
      if (u === 'a') throw new Error('timeout');
      return u;
    };
    expect(await tryInOrder(['a', 'b'], op, { timeoutMs: 100, key: 'k' })).toBe('b');
    // Deuxième appel : « a » est en pénalité, « b » est tenté en premier.
    expect(await tryInOrder(['a', 'b'], op, { timeoutMs: 100, key: 'k' })).toBe('b');
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
