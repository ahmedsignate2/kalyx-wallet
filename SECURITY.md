# Security Policy

Security vulnerabilities must NOT be publicly disclosed through
GitHub Issues.

If you discover a security vulnerability in Kalyx Wallet, please report
it privately:

**Contact:** Telegram [@kalyxntw](https://t.me/kalyxntw) or X [@kalyxntw](https://x.com/kalyxntw)

Please include:

- A description of the vulnerability
- Steps to reproduce it
- The affected component
- Potential impact
- A proof of concept if appropriate

Never send recovery phrases, private keys, passwords, API keys,
or authentication tokens in a security report.

Please allow reasonable time for the vulnerability to be investigated
and fixed before public disclosure.

Kalyx Wallet has not been independently audited unless explicitly stated
in the project documentation.

## Web dashboard (app.kalyxwallet.com) — threat model

The phone is the vault. The web dashboard **never** holds a private key,
seed phrase or PIN: it reads public balances and forwards signing requests
to the phone over WalletConnect, where the user approves them.

What an attacker who fully compromises the browser tab could obtain:
public addresses, balances, contacts, display preferences, and the user's
own BYOK AI API key. They could also *ask* the phone to sign a transaction
— which the phone shows to the user for approval, exactly like any dApp.

Hardening in place (see `public/_headers`, `lib/kv.web.ts`, `ui/web/platform.ts`,
`lib/webConnect.ts`):

- Enforced Content-Security-Policy: scripts only from the origin (no inline,
  no `eval`), fonts self-hosted, no third-party script in a normal browser
  (the Telegram SDK is loaded only inside the Telegram mini app), iframe
  embedding limited to Telegram, `object-src 'none'`, `base-uri 'self'`.
- `Referrer-Policy: no-referrer`, `nosniff`, HSTS preload, restrictive
  `Permissions-Policy`, COOP/CORP.
- Least-privilege WalletConnect session: only `eth_sendTransaction`,
  `solana_signTransaction` and Bitcoin `sendTransfer` are requested — no
  `personal_sign`, `signTypedData`, `signMessage` or PSBT signing.
- Values persisted in IndexedDB are encrypted at rest (AES-256-GCM under a
  non-extractable WebCrypto key), so a copied browser profile does not
  reveal the AI key, contacts or preferences.
- Session cut after 30 min without interaction; balances auto-masked after
  2 min or when the tab goes to the background.
- Chain-sourced text passed to the AI agent is sanitized and truncated
  (prompt-injection via token names).
- Address-poisoning detection and transaction simulation before every send.

Known, accepted: WalletConnect session keys live in browser storage (standard
for all WalletConnect dApps); the AI key is sent only to the provider the
user chose.
