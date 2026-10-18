/**
 * Messages INTERNES (popup, panneau, fenêtre d'approbation → service worker).
 *
 * Seules les pages de l'extension elle-même peuvent parler à ce canal : un
 * script de contenu ou une autre extension est refusé. Les sites web auront
 * leur propre canal, plus restreint (lot 5).
 */
export interface InternalSender {
  id?: string;
  url?: string;
  tab?: unknown;
}

export function isOwnExtensionPage(sender: InternalSender, runtimeId: string): boolean {
  if (sender.id !== runtimeId || !sender.url) return false;
  // Un script de contenu a le même id d'extension, mais l'URL de la page web.
  return sender.url.startsWith(`chrome-extension://${runtimeId}/`);
}
