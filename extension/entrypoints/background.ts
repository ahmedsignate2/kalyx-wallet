import { coreSelfTest } from '../lib/coreSelfTest';
import { isOwnExtensionPage } from '../lib/internal';
import { lockSessionToExtension } from '../lib/storage';

/**
 * Service worker : le cerveau de l'extension. Au lot 0, il ne fait que prouver
 * que le cœur de Kalyx s'y exécute. Le coffre (lot 1) et le pont vers les
 * dApps (lot 5) viendront ici.
 */
export default defineBackground(() => {
  // La zone session (future clé de session) n'est jamais lisible par une page web.
  void lockSessionToExtension(browser.storage.session as never).catch(() => {});

  browser.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
    if (!isOwnExtensionPage(sender, browser.runtime.id)) return false;
    if ((msg as { type?: string } | null)?.type === 'kalyx:core-self-test') {
      coreSelfTest().then(reply, () => reply({ ok: false, evm: '', solana: '' }));
      return true; // réponse asynchrone
    }
    return false;
  });
});
