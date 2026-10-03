import type { LegalSection } from './types';

/** English translation. The French text (terms.ts) prevails. */
export const sections: LegalSection[] = [
  {
    id: 'beta',
    title: '1. Beta & testing phase',
    body: `Kalyx Wallet is currently in a testing and continuous improvement phase (beta). Although it is designed to the strictest security standards, the application may contain unexpected software defects.
We strongly recommend not storing disproportionate amounts in it, and running your first tests on test networks (testnets) or with moderate amounts until a final version and formal audit reports are made public.`,
  },
  {
    id: 'responsabilite',
    title: '2. You alone are responsible for your private keys',
    body: `Kalyx Wallet is a strictly non-custodial application: YOU are the one and only holder of your secret recovery phrase (seed phrase) and your private keys.
If you lose your secret phrase, no one — neither the publisher (KALYX / Ahamed Signate) nor any technical support — has the technical ability to restore access to your wallet or recover your funds.
Never take a screenshot of your phrase, save it in a cloud service or give it to anyone, for any reason.`,
  },
  {
    id: 'risques',
    title: '3. Risks inherent to crypto-assets & irreversibility',
    body: `Using distributed ledger technologies (blockchains) carries significant risks:
• Volatility: the price of digital assets fluctuates unpredictably.
• Irreversibility: once validated by a network's validators, a blockchain transaction can be neither cancelled, modified nor refunded.
• Input errors: sending to a wrong address or on an incompatible network can cause the permanent loss of the asset.
• Malicious smart contracts: although Kalyx checks before signing (GoPlus Security, Alchemy simulation, WalletConnect Verify) to inspect addresses, contracts and websites, no preventive analysis can guarantee that third-party protocols are free of vulnerabilities.`,
  },
  {
    id: 'garantie',
    title: '4. No warranty ("as is")',
    body: `The application is provided "as is", without any express or implied warranty as to its continuous availability, its fitness for a particular purpose or the absence of errors.
To the fullest extent permitted by applicable law, KALYX (sole proprietorship of Ahamed Signate) accepts no liability for any direct or indirect financial loss resulting from a blockchain network failure, a protocol bug, network congestion or a hack caused by negligence in keeping private keys.`,
  },
  {
    id: 'frais',
    title: '5. Free of charge & fees',
    body: `Kalyx Wallet is free. Network fees (gas) are paid to each blockchain's validators, never to Kalyx. On swaps and bridges, a 0.3% service fee is included in the quote and shown before any signature; no fee is taken on Earn (staking and lending) or on sends.`,
  },
  {
    id: 'earn',
    title: '6. Earn: staking & lending',
    body: `The Earn tab gives access to third-party protocols (Lido, Rocket Pool, Benqi, Jito, Marinade, Aave, TON staking…). Displayed yields are estimates published by third parties and may change or turn negative. These protocols carry their own risks (contract flaws, de-pegging, withdrawal delays, validator slashing) that Kalyx neither controls nor guarantees.`,
  },
  {
    id: 'protections',
    title: '7. Security protections & limits',
    body: `The whitelist, duress code, signature analysis, scam detection and transaction simulation reduce risks but cannot remove them. They rely on public data and third-party services that may be incomplete or unavailable. The decoy wallet must hold real funds to stay credible; those funds are exposed like any other wallet.`,
  },
  {
    id: 'web',
    title: '8. Web dashboard, Telegram & AI Copilot',
    body: `The web dashboard and the Telegram mini app are viewing interfaces: every operation is signed in the app, on your phone. The Telegram bot provides public information (prices, gas, scans) for guidance only. The AI Copilot relies on a provider you choose, with your own key: its answers may be inaccurate, are not advice, and it can never sign on your behalf.`,
  },
  {
    id: 'tiers',
    title: '9. Decentralised third-party services & protocols',
    body: `Token swaps, cross-chain bridges and dApps available through the built-in browser are run by third parties and autonomous smart contracts (including the LI.FI aggregation protocol, Uniswap, Raydium, etc.).
Kalyx Wallet only acts as a client interface that makes local signing by the user easier. Kalyx does not control, administer or endorse the third-party services contacted in this way.`,
  },
  {
    id: 'conseil',
    title: '10. No financial or investment advice',
    body: `No content, notification, price or quote shown in the Kalyx Wallet application constitutes investment advice, a financial recommendation or an incentive to trade crypto-assets.
You alone are responsible for complying with the legal, regulatory and tax obligations in force in your country of tax residence.`,
  },
  {
    id: 'droit',
    title: '11. Governing law & jurisdiction',
    body: `These terms are governed by and interpreted in accordance with French law. Any dispute about their interpretation or performance will first be the subject of an attempt at amicable settlement before being brought before the competent courts within the jurisdiction of the competent court of appeal.`,
  },
  {
    id: 'editeur',
    title: '12. Legal notice & contact details',
    body: `Publisher: KALYX (Ahamed Signate)
Legal status: sole proprietorship (entrepreneur individuel)
SIREN: 130 046 865 — APE code: 62.01Z
Support & compliance contact: support@kalyxwallet.com
Official Telegram channel: https://t.me/kalyxntw
The full notice (publisher, host) is on the dedicated "Legal notice" page.`,
  },
];
