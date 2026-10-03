import type { LegalSection } from './types';

/** English translation. The French text (privacy.ts) prevails. */
export const sections: LegalSection[] = [
  {
    id: 'principe',
    title: '1. The principle: 100% non-custodial',
    body: `Kalyx Wallet is a non-custodial wallet. Your private keys and recovery phrase are generated and stored ONLY on your phone, encrypted end to end. They are NEVER sent to KALYX (sole proprietorship of Ahamed Signate), nor to any remote server or intermediary. We have strictly no technical access to your funds or your secret phrase.`,
  },
  {
    id: 'collecte',
    title: '2. What we do not collect',
    body: `We collect none of the following:
• Your recovery phrase (12 or 24 words)
• Your private keys and signatures
• Your PIN or biometric identifier
• No personal identification data (name, address, phone number, e-mail)
There is no user account to create. No advertising network or analytics tracker is present in the application's code.`,
  },
  {
    id: 'local',
    title: '3. Data processed only on your device',
    body: `All of the following data stays on your personal device:
• The encrypted vault containing your private keys
• The address book and local contacts
• The list of custom networks you added
• dApp browsing history and favourites
• Display preferences and reference currency
• The local log of transactions and notifications
You can erase all of this data at any time by uninstalling or resetting the application.
• Security settings: address whitelist, duress code (decoy wallet), lock delays
• Watch-only addresses, price alerts and WalletConnect / TON Connect sessions
• Conversations with the AI Copilot and support ticket history`,
  },
  {
    id: 'tiers',
    title: '4. Third-party services used by the application',
    body: `To display your balances and history or to carry out an operation, the application queries third-party services. They receive your IP address and PUBLIC blockchain data (addresses, contracts, transactions) — never your keys:
• Alchemy & public RPC nodes (PublicNode, dRPC…) — balances, tokens, NFTs, history and transaction broadcast (EVM)
• Ankr, Etherscan — transaction history (EVM), as a fallback
• Helius & public Solana RPC — balances, NFTs and history (Solana)
• mempool.space — balances, fees and history (Bitcoin)
• TonAPI & TON Center — balances, jettons, NFTs, .ton names, simulation and broadcast (TON). TonAPI requests go through a relay run by the publisher (Cloudflare Workers): it sees your IP address and your TON addresses, keeps no record of them, and caches public responses for one minute only
• DefiLlama, CoinGecko, Frankfurter — crypto prices and exchange rates
• LI.FI, Relay — swap and bridge quotes; Jupiter — swaps on Solana; STON.fi — swaps on TON (receives your TON address to build the quote); Tonstakers — TON staking
• WalletConnect (Reown) — encrypted relay with dApps, domain verification (Verify) and merchant payments (WalletConnect Pay)
• TON Connect bridges (TON Foundation, Tonkeeper) — end-to-end encrypted messages with TON dApps
• GoPlus Security — preventive analysis of contracts, tokens and websites
• wsrv.nl — converting NFT images into a displayable format
• DuckDuckGo / Google Favicons — dApp icons in the browser
• Google Drive — only if you turn on Google Drive backup: a file encrypted on your device (scrypt + AES-256-GCM) is placed in the application's private folder; access is revoked right after the operation and no token is kept
• The AI provider of your choice (Copilot, personal key) — only if you turn it on: balances, active network and masked recent activity; never your addresses, keys or recovery phrase
Each of these third parties applies its own privacy policy. The built-in Web3 browser gives access to independent dApps that apply their own terms of use.`,
  },
  {
    id: 'web',
    title: '5. Web dashboard & Telegram mini app',
    body: `The app.kalyxwallet.com dashboard (in a browser or inside Telegram) holds no key: it links to the app on your phone through WalletConnect, and every signature is approved on the phone.
• It receives the PUBLIC addresses your phone shares during the session, and queries the same public services as the app (previous section) to show balances and activity.
• Your preferences and, if you enable it, your Copilot API key are stored in your browser, encrypted (AES-256-GCM, non-exportable key).
• Inside Telegram, the official mini-app SDK is loaded; Telegram may then know about your use of the mini app under its own policy. In a regular browser no third-party script is loaded, and the session closes after 30 minutes of inactivity.
• The site is hosted by Cloudflare, which processes your IP address to deliver pages.`,
  },
  {
    id: 'bot',
    title: '6. Kalyx Telegram bot',
    body: `The Kalyx Telegram bot never asks for nor receives any key or phrase. To work, it keeps in a Cloudflare database (D1):
• your Telegram ID and chosen language;
• the price alerts you create (asset, threshold, direction, status).
Price, gas and token-scan commands query public services (CoinGecko, DefiLlama, Binance, GoPlus, public nodes) without passing on your identity. Rate limiting uses a temporary counter (a few minutes). You can delete your alerts at any time (/alerts) and request full erasure of your data at support@kalyxwallet.com.`,
  },
  {
    id: 'droits',
    title: '7. Your rights (GDPR)',
    body: `The only personal data the publisher may hold is the Telegram bot data (previous section) and the messages you voluntarily send to support. You have the right of access, rectification, erasure, restriction and objection, and the right to lodge a complaint with the CNIL (cnil.fr) or your local authority. To exercise them: support@kalyxwallet.com. App data never leaves your device: you keep full control of it.`,
  },
  {
    id: 'notifications',
    title: '8. Notifications & alerts',
    body: `All notifications generated by Kalyx Wallet are strictly local (generated by your phone's operating system). No remote push notification server is used, which guarantees that no device push token is ever sent to a third party.`,
  },
  {
    id: 'securite',
    title: '9. Cryptographic security measures',
    body: `The recovery phrase is encrypted with AES-256-GCM using a key derived from your PIN (scrypt), then stored in the system's secure storage (iOS Keychain / Android Keystore).
The application locks automatically when your phone goes to sleep, has an anti-screenshot guard screen and slows down PIN brute-force attempts.
Although these defences are state of the art, no computer system is unbreakable: you must keep your recovery phrase written on paper, offline.
Additional protections, all local: recipient whitelist (24 h before an added address or a deactivation takes effect), a duress code that opens a decoy wallet, a biometric copy of the phrase guarded by the operating system (fingerprint or face required), explanation and simulation of signatures before approval, and confirmation before a site switches network. The encrypted backup uses a password separate from the PIN (scrypt + AES-256-GCM).`,
  },
  {
    id: 'mineurs',
    title: '10. Protection of minors',
    body: `The Kalyx Wallet application is not intended for people under 16. We do not knowingly request or keep any information about minors.`,
  },
  {
    id: 'hosting',
    title: '11. Legal notice & hosting (LCEN)',
    body: `In accordance with article 6 of French law no. 2004-575 of 21 June 2004 on confidence in the digital economy (LCEN):
• Publisher: KALYX (Ahamed Signate)
• Status: sole proprietorship (entrepreneur individuel)
• SIREN: 130 046 865 — APE code: 62.01Z
• Contact e-mail: support@kalyxwallet.com
• Hosting of kalyxwallet.com: Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, USA
• Hosting of the application: a non-custodial mobile application running locally on the user's device, with no central key storage server and no user database. Only the TON relay (no logging) runs on Cloudflare Workers.
The full notice is on the dedicated "Legal notice" page.`,
  },
  {
    id: 'contact',
    title: '12. Changes to this policy & contact',
    body: `This privacy policy may be revised to reflect new features or regulatory changes. The update date is authoritative. For any data protection request or to report a security issue: support@kalyxwallet.com or on Telegram @kalyxntw.`,
  },
];
