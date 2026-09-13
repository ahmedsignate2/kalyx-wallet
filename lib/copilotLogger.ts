type LogData = Record<string, unknown> | undefined;

const MAX_TEXT = 500;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limited]';
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/(?:sk|key|token|api[_-]?key|authorization|password|secret|private[_-]?key)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[REDACTED]')
      .replace(/\b(?:0x)?[a-f0-9]{64}\b/gi, '[REDACTED_HEX_SECRET]')
      .replace(/\b(?:[a-z]+\s+){11,}[a-z]+\b/gi, '[REDACTED_MNEMONIC]');
    return cleaned.length > MAX_TEXT ? `${cleaned.slice(0, MAX_TEXT)}…` : cleaned;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [
      key,
      /api.?key|authorization|password|secret|private|mnemonic|seed|pin|cipher/i.test(key) ? '[REDACTED]' : redact(item, depth + 1),
    ]));
  }
  return value;
}

export function newCopilotTraceId(): string {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function copilotLog(traceId: string, event: string, data?: LogData): void {
  const stamp = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(redact(data))}` : '';
  console.log(`[KALYX-COPILOT][${traceId}][${stamp}] ${event}${payload}`);
}

export function copilotError(traceId: string, event: string, error: unknown, data?: LogData): void {
  const message = error instanceof Error ? error.message : String(error);
  copilotLog(traceId, event, { ...data, error: message });
}
