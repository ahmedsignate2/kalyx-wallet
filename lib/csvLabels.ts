/** Libellés de l'export CSV des transactions, dans la langue de l'utilisateur. */
import type { CsvLabels } from '../src';
import type { Key } from './i18n';

export function csvLabels(t: (key: Key) => string): CsvLabels {
  return {
    header: [
      t('csvDate'), t('csvNetwork'), t('csvDirection'), t('csvAmount'), t('csvAsset'),
      t('csvFrom'), t('csvTo'), t('csvStatus'), t('csvHash'), t('csvLink'),
    ],
    directions: { in: t('csvDirIn'), out: t('csvDirOut'), self: t('csvDirSelf') },
    statuses: { success: t('csvStatusConfirmed'), failed: t('csvStatusFailed'), pending: t('csvStatusPending') },
    swap: t('exTitleSwap'),
    approval: t('exTitleApproval'),
    contractCall: t('txPreviewContractInteraction'),
  };
}
