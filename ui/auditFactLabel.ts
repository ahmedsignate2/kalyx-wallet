/** Libellés des faits d'audit (destinataire), partagés : fiche d'envoi et analyse IA. */
import type { TxAuditFact } from '../lib/aiTxAudit';
import type { useT } from '../lib/settingsStore';

const FACT_KEY = {
  flagged: 'aiFactFlagged', lookalike: 'aiFactLookalike', own: 'aiFactOwn', paid: 'aiFactPaid', received: 'aiFactReceived',
  new: 'aiFactNew', contract: 'aiFactContract', fresh: 'aiFactFresh', unverified: 'aiFactUnverified',
} as const;

/** Libellé d'un fait, dans la langue de l'app. */
export function factLabel(f: TxAuditFact, t: ReturnType<typeof useT>, locale: string): string {
  const date = (unix: number) => new Date(unix * 1000).toLocaleDateString(locale || undefined);
  switch (f.kind) {
    case 'contact': return t('aiFactContact').replace('{name}', f.name);
    case 'paidN': return (f.last ? t('aiFactPaidNLast').replace('{date}', date(f.last)) : t('aiFactPaidN')).replace('{n}', String(f.n));
    case 'since': return t('aiFactSince').replace('{date}', date(f.at));
    case 'busy': return t('aiFactBusy').replace('{n}', String(f.n));
    default: return t(FACT_KEY[f.kind]);
  }
}

