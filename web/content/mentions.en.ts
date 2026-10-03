import type { LegalSection } from './types';

/** English translation. The French text (mentions.ts) prevails. */
export const sections: LegalSection[] = [
  {
    id: 'editeur',
    title: '1. Website publisher',
    body: `The kalyxwallet.com website is published by KALYX (Ahamed Signate), sole proprietorship (entrepreneur individuel).
SIREN: 130 046 865 — APE code: 62.01Z.
Publication director: Ahamed Signate.
Contact: support@kalyxwallet.com.`,
  },
  {
    id: 'hebergement',
    title: '2. Hosting',
    body: `The website is hosted by Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, United States — phone: +1 (888) 993-5273.
The app.kalyxwallet.com dashboard, the TON relay and the Kalyx Telegram bot (Cloudflare Workers and D1 database) are hosted by the same company.`,
  },
  {
    id: 'nature',
    title: '3. Nature of the service',
    body: `Kalyx is non-custodial client software: the application generates and stores your private keys only on your device, encrypted end to end. KALYX has access to no key, holds or keeps no funds on behalf of others, and never acts as a financial intermediary, custodian or digital asset service provider (PSAN). Using crypto-assets carries risks; see our Terms of use.`,
  },
  {
    id: 'propriete',
    title: '4. Intellectual property',
    body: `All elements of the kalyxwallet.com website (texts, structure, visual identity, "Kalyx" brand) are the property of KALYX, unless stated otherwise. Any reproduction without prior authorisation is forbidden.
The Kalyx Wallet source code is source-available, not open source: reuse, modification and redistribution require written permission (LICENSE file in the repository). Third-party libraries remain governed by their own licenses.`,
  },
  {
    id: 'contact',
    title: '5. Contact',
    body: `For any question about the publisher, hosting or content of the website: support@kalyxwallet.com.`,
  },
];
