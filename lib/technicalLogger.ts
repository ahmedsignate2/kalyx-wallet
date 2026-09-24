import { sanitizeLog } from './sanitizeLog';

export interface LogEntry {
  timestamp: string;
  category: 'RPC' | 'TX' | 'WALLET' | 'DAPP' | 'SYS';
  message: string;
  chain?: string;
  details?: Record<string, any>;
  isError?: boolean;
}

export type TechnicalLogEntry = {
  timestamp: string;
  category: string;
  message: string;
  chain?: string;
  details?: string;
};

/**
 * Compare deux identifiants ou noms de réseau (ex: "sepolia", "Sepolia", "eth-sepolia").
 */
export function matchesChain(logChain?: string, targetChain?: string): boolean {
  if (!logChain || !targetChain) return false;
  const lc = logChain.trim().toLowerCase();
  const tc = targetChain.trim().toLowerCase();
  if (lc === tc) return true;
  if (tc.includes(lc) || lc.includes(tc)) return true;
  if ((lc === 'sepolia' || lc === 'eth-sepolia') && (tc === 'sepolia' || tc === 'eth-sepolia')) return true;
  if ((lc === 'eth' || lc === 'ethereum') && (tc === 'eth' || tc === 'ethereum')) return true;
  if ((lc === 'sol' || lc === 'solana') && (tc === 'sol' || tc === 'solana')) return true;
  if ((lc === 'btc' || lc === 'bitcoin') && (tc === 'btc' || tc === 'bitcoin')) return true;
  return false;
}

/**
 * Formate une entrée de log en une ligne condensée, lisible et propre :
 * ex: [21:34:12] [RPC] Swellchain: eth_getBalance -> 500 (Réseau indisponible)
 */
export function formatCondensedLog(l: LogEntry): string {
  const chainName = l.chain || l.details?.chain || l.details?.chainId || '';
  const chainPrefix = chainName ? `${chainName}: ` : '';

  if (l.category === 'RPC') {
    const method = l.details?.method || l.message.match(/RPC\s+(?:error\s+on\s+)?([a-zA-Z0-9_]+)/i)?.[1] || 'rpc';
    const status = l.details?.status !== undefined ? l.details.status : (l.isError ? 500 : 200);
    const errorMsg = l.details?.error
      ? ` (${l.details.error})`
      : (l.isError && typeof status === 'number' && status >= 400 ? ' (Erreur serveur)' : '');
    return `[${l.timestamp}] [RPC] ${chainPrefix}${method} -> ${status}${errorMsg}`;
  }

  if (l.category === 'TX') {
    const step = l.details?.step || l.message.replace(/^Step:\s*/i, '');
    const err = l.details?.error ? ` -> Échec (${l.details.error})` : (l.isError ? ' -> Échec' : '');
    const hash = l.details?.txHash ? ` [${l.details.txHash.slice(0, 10)}...]` : '';
    return `[${l.timestamp}] [TX] ${chainPrefix}${step}${hash}${err}`;
  }

  if (l.category === 'DAPP') {
    const err = l.details?.error ? ` -> (${l.details.error})` : '';
    return `[${l.timestamp}] [DAPP] ${l.message}${err}`;
  }

  // SYS & WALLET
  const detailError = l.details?.error ? ` -> (${l.details.error})` : '';
  return `[${l.timestamp}] [${l.category}] ${chainPrefix}${l.message}${detailError}`;
}

class TechnicalLogger {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 60;

  public log(
    category: LogEntry['category'],
    message: string,
    details?: Record<string, any>,
    isError = false,
    chain?: string
  ) {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const cleanMessage = sanitizeLog(String(message || ''));

    let cleanDetails: Record<string, any> | undefined;
    if (details !== undefined && details !== null) {
      try {
        cleanDetails = JSON.parse(sanitizeLog(JSON.stringify(details)));
      } catch {
        cleanDetails = { info: sanitizeLog(String(details)) };
      }
    }

    const detectedChain = chain || cleanDetails?.chain || cleanDetails?.network || cleanDetails?.chainId;

    const entry: LogEntry = {
      timestamp,
      category,
      message: cleanMessage,
      chain: detectedChain ? String(detectedChain) : undefined,
      details: cleanDetails,
      isError: isError || /error|échec|fail|rejet|revert|timeout|4\d\d|5\d\d/i.test(cleanMessage),
    };

    this.logs.push(entry);

    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }
  }

  public logRpc(method: string, status?: number | string, error?: string, details?: Record<string, any>) {
    const isErr = !!error || (typeof status === 'number' && status >= 400);
    const msg = isErr
      ? `RPC error on ${method}: ${error || `status ${status}`}`
      : `RPC ${method} OK (status ${status ?? 200})`;
    this.log('RPC', msg, { method, status, error, ...details }, isErr, details?.chain ? String(details.chain) : undefined);
  }

  public logTx(step: string, details?: Record<string, any>, isError = false) {
    this.log('TX', `Step: ${step}`, details, isError, details?.chain ? String(details.chain) : undefined);
  }

  /**
   * `details.chain` est propagé au log. Sans ça, TOUS les événements dApp
   * portaient `chain: undefined` et se trouvaient écartés des tickets ciblés
   * sur un réseau : `matchesChain(undefined, 'bitcoin')` est faux. Un ticket
   * « problème WalletConnect sur Bitcoin » excluait donc précisément les lignes
   * WalletConnect, et concluait « aucune erreur dans les logs ».
   */
  public logDapp(event: string, url?: string, details?: Record<string, any>, isError = false) {
    this.log('DAPP', `${event}${url ? ` [${url}]` : ''}`, details, isError, details?.chain ? String(details.chain) : undefined);
  }

  public logWallet(event: string, details?: Record<string, any>, isError = false) {
    this.log('WALLET', event, details, isError);
  }

  public logSys(event: string, details?: Record<string, any>, isError = false) {
    this.log('SYS', event, details, isError);
  }

  public getFormattedLogs(limit = 40): string {
    if (this.logs.length === 0) return 'Aucun log technique enregistré.';
    const slice = this.logs.slice(-limit);
    return slice
      .map((l) => `[${l.timestamp}] [${l.category}] ${l.message}${l.details ? ' ' + JSON.stringify(l.details) : ''}`)
      .join('\n');
  }

  /**
   * Retourne les logs au format condensé lisible (sans dump JSON).
   */
  public getCondensedLogs(limit = 40, targetChain?: string): string {
    if (this.logs.length === 0) return 'Aucun log technique enregistré.';
    if (!targetChain) {
      return this.logs.slice(-limit).map(formatCondensedLog).join('\n');
    }
    const chainLogs = this.logs.filter((l) => matchesChain(l.chain, targetChain));
    const otherLogs = this.logs.filter((l) => !matchesChain(l.chain, targetChain));
    const result: string[] = [];
    if (chainLogs.length > 0) {
      result.push(...chainLogs.slice(-limit).map(formatCondensedLog));
    }
    if (otherLogs.length > 0 && result.length < limit) {
      const remaining = limit - result.length;
      result.push(...otherLogs.slice(-remaining).map(formatCondensedLog));
    }
    return result.length > 0 ? result.join('\n') : 'Aucun log technique enregistré pour ce réseau.';
  }

  /**
   * Retourne les logs spécifiquement formatés pour un ticket support :
   * Priorise la chaîne ciblée, et isole les erreurs multi-chaînes d'arrière-plan.
   */
  public getCondensedTicketLogs(targetChain?: string, limit = 5): string {
    if (this.logs.length === 0) return 'Aucun log technique récent.';

    if (!targetChain || /^(?:Non spécifié|Non déterminée|Inconnu)$/i.test(targetChain)) {
      const errors = this.logs.filter((l) => l.isError);
      const chosen = errors.length > 0 ? errors.slice(-limit) : this.logs.slice(-limit);
      return chosen.map(formatCondensedLog).join('\n');
    }

    const chainLogs = this.logs.filter((l) => matchesChain(l.chain, targetChain));
    const chainErrors = chainLogs.filter((l) => l.isError);
    const otherErrors = this.logs.filter((l) => l.isError && !matchesChain(l.chain, targetChain));

    const lines: string[] = [];

    if (chainErrors.length > 0) {
      lines.push(...chainErrors.slice(-limit).map(formatCondensedLog));
    } else if (chainLogs.length > 0) {
      lines.push(...chainLogs.slice(-Math.min(limit, 3)).map(formatCondensedLog));
    } else {
      lines.push(`[${targetChain}] Aucun log d'exécution direct enregistré pour cette chaîne.`);
    }

    /*
     * Bruit d'arrière-plan RÉSUMÉ, pas listé. Le sondage de solde interroge des
     * dizaines de réseaux EVM en permanence ; trois de ces échecs, choisis au
     * hasard et collés sous le vrai problème, faisaient croire à un rapport
     * entre « Moonbeam ne répond pas » et « ma signature Bitcoin est refusée ».
     * Une ligne de synthèse suffit et n'induit personne en erreur.
     */
    if (otherErrors.length > 0) {
      const chains = [...new Set(otherErrors.map((l) => l.chain || 'inconnu'))];
      const methods = [...new Set(otherErrors.map((l) => String(l.details?.method ?? '')).filter(Boolean))];
      const what = methods.length === 1 ? methods[0] : 'appels RPC';
      lines.push(
        `(Arrière-plan, sans rapport probable : ${otherErrors.length} échec(s) ${what} sur ${chains.length} réseau(x) — ${chains.slice(0, 4).join(', ')}${chains.length > 4 ? '…' : ''})`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Extrait et corrèle une description textuelle précise de la dernière erreur survenue.
   * Si une chaîne est ciblée, recherche d'abord sur cette chaîne.
   */
  public getDetectedError(targetChain?: string): string | null {
    const isTarget = (l: LogEntry) => !targetChain || matchesChain(l.chain, targetChain);

    // 1. Cherche une erreur spécifique au réseau ciblé
    const specificErrors = this.logs.filter((l) => l.isError && isTarget(l));
    if (specificErrors.length > 0) {
      const last = specificErrors[specificErrors.length - 1];
      if (last.category === 'RPC') {
        const method = last.details?.method || last.message.match(/RPC\s+(?:error\s+on\s+)?([a-zA-Z0-9_]+)/i)?.[1] || 'RPC';
        const status = last.details?.status ?? 500;
        const err = last.details?.error ? ` (${last.details.error})` : '';
        return `RPC ${status}${err} sur ${method}`;
      }
      if (last.category === 'TX') {
        const step = last.details?.step || last.message;
        const err = last.details?.error ? ` (${last.details.error})` : '';
        return `Échec de transaction sur ${step}${err}`;
      }
      if (last.details?.error) return `${last.category} : ${last.details.error}`;
      return `${last.category} : ${last.message}`;
    }

    /*
     * 2. Opération PERTINENTE mais sans erreur côté wallet.
     *
     * Une action peut réussir ici et être refusée ailleurs — une signature
     * produite correctement puis rejetée par la dApp, par exemple. Elle ne
     * porte donc aucun `isError`, et l'ancien code concluait « aucune erreur
     * dans les logs » : la ligne la plus utile du diagnostic était passée sous
     * silence, alors qu'elle contient exactement ce qu'il faut savoir.
     */
    const relevant = this.logs.filter((l) => isTarget(l) && (l.category === 'DAPP' || l.category === 'TX'));
    if (relevant.length > 0) {
      const last = relevant[relevant.length - 1];
      const facts = last.details
        ? Object.entries(last.details)
            .filter(([k]) => k !== 'chain')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(', ')
        : '';
      return `Aucune erreur côté wallet. Dernière opération : ${last.message}${facts ? ` (${facts})` : ''}`;
    }

    // 3. Si pas d'erreur directe sur le réseau ciblé, mais erreurs d'arrière-plan
    const anyErrors = this.logs.filter((l) => l.isError);
    if (anyErrors.length > 0) {
      const last = anyErrors[anyErrors.length - 1];
      const otherChain = last.chain || last.details?.chain || 'Réseau externe';
      const status = last.details?.status ?? 500;
      const err = last.details?.error ? ` - ${last.details.error}` : '';
      if (targetChain && !/^(?:Non spécifié|Non déterminée)$/i.test(targetChain)) {
        return `Aucune erreur sur ${targetChain} (RPC ${status}${err} sur ${otherChain} en arrière-plan)`;
      }
      return `RPC ${status}${err} sur ${otherChain}`;
    }

    return null;
  }

  public getRecentLogs(limit = 40): LogEntry[] {
    return this.logs.slice(-limit);
  }

  public getRecentTechnicalLogs(limit = 25): string[] {
    const slice = this.logs.slice(-limit);
    return slice.map((l) => {
      const detailPart = l.details ? ` - ${JSON.stringify(l.details)}` : '';
      return `[${l.timestamp}] [${l.category}] ${l.message}${detailPart}`;
    });
  }

  public getErrorLogs(limit = 5): string[] {
    const errors = this.logs.filter((l) => l.isError);
    return errors.slice(-limit).map((l) => `[${l.timestamp}] [${l.category}] ${l.message}${l.details ? ' ' + JSON.stringify(l.details) : ''}`);
  }

  public getCondensedErrorLogs(limit = 5, targetChain?: string): string[] {
    const errors = this.logs.filter((l) => l.isError && (!targetChain || matchesChain(l.chain, targetChain)));
    return errors.slice(-limit).map(formatCondensedLog);
  }

  public hasErrors(): boolean {
    return this.logs.some((l) => l.isError);
  }

  public clear() {
    this.logs = [];
  }
}

export const technicalLogger = new TechnicalLogger();

// Fonctions de compatibilité
export function recordTechnicalLog(category: string, message: string, details?: unknown): void {
  const cat = (['RPC', 'TX', 'WALLET', 'DAPP', 'SYS'].includes(category.toUpperCase())
    ? category.toUpperCase()
    : 'SYS') as LogEntry['category'];
  const isErr = typeof details === 'object' && details && (details as any).error;
  technicalLogger.log(cat, message, typeof details === 'object' ? (details as Record<string, any>) : { info: String(details ?? '') }, !!isErr);
}

export function getRecentTechnicalLogs(limit = 25): string[] {
  return technicalLogger.getRecentTechnicalLogs(limit);
}

export function getFormattedTechnicalLogs(limit = 25): string {
  return technicalLogger.getFormattedLogs(limit);
}

export function clearTechnicalLogs(): void {
  technicalLogger.clear();
}
