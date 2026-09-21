# Security Policy

## Status: not independently audited

Kalyx Wallet has **not** been audited by an independent security firm. It is
built and maintained by a solo developer. Do not store amounts you cannot
afford to lose until an audit has been published in this repository.

## Reporting a vulnerability

Please report privately — **never** through public GitHub Issues.

- Telegram: [@kalyxntw](https://t.me/kalyxntw)
- Email: support@kalyxwallet.com (put "SECURITY" in the subject)
- X: [@kalyxntw](https://x.com/kalyxntw) (DM)

Include: a description, the affected component (app, web dashboard, Telegram
bot, marketing site), steps to reproduce, impact, and a proof of concept if
appropriate. You will get an acknowledgement within 72 hours and a status
update within 7 days. Please allow a reasonable time to fix before any public
disclosure; you will be credited in the release notes if you wish.

**Never send** recovery phrases, private keys, PINs, passwords, API keys or
authentication tokens in a report — real or test. We will never ask for them.

## Scope

In scope:
- The mobile app (`app/`, `lib/`, `src/`, `ui/`): key generation and storage,
  PIN/biometrics, signing, WalletConnect handling, transaction simulation,
  address-poisoning detection, backups.
- The web dashboard `app.kalyxwallet.com` (`ui/web/`, `lib/webConnect.ts`,
  `public/_headers`): session handling, CSP, storage encryption, request
  forwarding to the phone.
- The Telegram bot (`bot/`): webhook authentication, input handling.
- The marketing site `kalyxwallet.com` (`web/`).

Out of scope:
- Third-party services the app relies on (RPC providers, CoinGecko, LI.FI,
  Jupiter, GoPlus, Alchemy, WalletConnect relay, Cloudflare, Telegram): report
  to them directly.
- Vulnerabilities requiring a rooted/jailbroken device, a compromised OS, or
  physical access to an unlocked phone.
- Social engineering of users, phishing sites imitating Kalyx (please still
  tell us so we can warn users).
- Denial of service against public endpoints.

## Safe harbor

Good-faith research that respects this policy (no data destruction, no access
to other users' data, no service disruption) will not be met with legal action.

## Security model (summary)

- **The phone is the vault.** Keys are generated on the device, encrypted with
  AES-256-GCM under a key derived from the PIN with scrypt, stored in the OS
  keystore/keychain. They never leave the device.
- No Kalyx server, no account, no remote session. Backups are encrypted
  client-side before any export.
- Every signature is shown in plain language and approved on the phone.
- Address-poisoning detection and transaction simulation before every send.

### Web dashboard (app.kalyxwallet.com) — threat model

The dashboard **never** holds a private key, seed phrase or PIN: it reads
public balances and forwards signing requests to the phone over WalletConnect,
where the user approves them. What an attacker who fully compromises the
browser tab could obtain: public addresses, balances, contacts, display
preferences and the user's own BYOK AI API key; they could *ask* the phone to
sign — which the phone shows to the user for approval.

Hardening in place (`public/_headers`, `lib/kv.web.ts`, `ui/web/platform.ts`,
`lib/webConnect.ts`):
- Enforced Content-Security-Policy: scripts only from the origin (no inline,
  no `eval`), fonts self-hosted, no third-party script in a normal browser (the
  Telegram SDK loads only inside the Telegram mini app), iframe embedding
  limited to Telegram, `object-src 'none'`, `base-uri 'self'`.
- `Referrer-Policy: no-referrer`, `nosniff`, HSTS preload, restrictive
  `Permissions-Policy`, COOP/CORP.
- Least-privilege WalletConnect session: only `eth_sendTransaction`,
  `solana_signTransaction` and Bitcoin `sendTransfer` are requested.
- IndexedDB values encrypted at rest (AES-256-GCM, non-extractable WebCrypto
  key).
- Session cut after 30 min without interaction; balances auto-masked after
  2 min or when the tab goes to the background.
- Chain-sourced text passed to the AI agent is sanitized and truncated.

Known, accepted: WalletConnect session keys live in browser storage (standard
for WalletConnect dApps); the AI key is sent only to the provider the user
chose.

## Supported versions

Only the latest release published on the releases page receives fixes.
