/**
 * Journal technique de l'EXTENSION : rien n'est gardé. Substitué au journal
 * de l'app (lib/technicalLogger) au build, pour les adaptateurs du cœur qui y
 * notent leurs appels RPC. L'app tient ce journal pour ses tickets de support ;
 * l'extension n'en a pas, et ne garde donc aucune trace d'activité.
 */
const none = () => {};

export const technicalLogger = {
  log: none,
  logRpc: none,
  logTx: none,
  logDapp: none,
  clear: none,
  hasErrors: () => false,
  getRecentLogs: () => [] as string[],
  getErrorLogs: () => [] as string[],
  getFormattedLogs: () => '',
  getCondensedLogs: () => '',
  getCondensedTicketLogs: () => '',
  getDetectedError: () => null,
};

export const recordTechnicalLog = none;
