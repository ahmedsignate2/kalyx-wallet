/** Nombre fini ou 0 — jamais de NaN/Infinity dans une somme affichée. */
export function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
