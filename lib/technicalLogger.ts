import { sanitizeLog } from './sanitizeLog';

export interface LogEntry {
  timestamp: string;
  category: 'RPC' | 'TX' | 'WALLET' | 'DAPP' | 'SYS';
  message: string;
  details?: Record<string, any>;
  isError?: boolean;
}

export type TechnicalLogEntry = {
  timestamp: string;
  category: string;
  message: string;
  details?: string;
};

class TechnicalLogger {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 60;

  public log(
    category: LogEntry['category'],
    message: string,
    details?: Record<string, any>,
    isError = false
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

    const entry: LogEntry = {
      timestamp,
      category,
      message: cleanMessage,
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
    this.log('RPC', msg, { method, status, error, ...details }, isErr);
  }

  public logTx(step: string, details?: Record<string, any>, isError = false) {
    this.log('TX', `Step: ${step}`, details, isError);
  }

  public logDapp(event: string, url?: string, details?: Record<string, any>, isError = false) {
    this.log('DAPP', `${event}${url ? ` [${url}]` : ''}`, details, isError);
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
