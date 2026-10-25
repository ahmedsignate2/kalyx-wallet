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
  PIN/biometrics, signing, WalletConnect and TON Connect handling, the
  in-app dApp browser, transaction simulation, address-poisoning detection,
  duress code / decoy wallet, recipient whitelist, backups.
- The web dashboard `app.kalyxwallet.com` (`ui/web/`, `lib/webConnect.ts`,
  `public/_headers`): session handling, CSP, storage encryption, request
  forwarding to the phone.
- The Telegram bot (`bot/`): webhook authentication, input handling.
- The browser extension (`extension/`): the encrypted vault (scrypt +
  AES-256-GCM, optional passkeys via WebAuthn PRF), the session key handling
  (`extension/lib/keyBox.ts`), the dApp bridge (EIP-1193 / EIP-6963, Solana
  and Bitcoin Wallet Standard), the approval window and its risk score,
  companion mode (keys stay on the phone), the duress profile, backups.
- The Cloudflare relay (`ton-proxy/`): API keys kept server-side, method
  allow-lists, caching.
- The release pipeline (`.eas/workflows/release-production.yml`,
  `scripts/publish-release.mjs`): integrity of the published APK.
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
- Address-poisoning detection and transaction simulation before every send;
  hold-to-send confirmation.
- PIN brute-force lockout based on both wall-clock and monotonic time (changing
  the system clock does not shorten it).
- **Duress code**: a second code opens a decoy wallet; the real wallets,
  contacts, history and sessions are wiped from memory and storage is made
  read-only for the decoy session.
- **Recipient whitelist**: when enabled, sends and dApp signatures go only to
  approved addresses; adding an address or disabling the list takes effect
  after 24 hours.
- **No over-the-air updates**: the app runs only the code shipped in the
  installed APK (`expo-updates` is not included). Every release is built on
  EAS and published with its SHA-256 checksum
  (`sha256sum -c kalyx-wallet.apk.sha256`).

### Browser extension — threat model

The extension can hold keys (full wallet) or none at all (companion mode:
every signature is forwarded to the phone and approved there).

- **Vault**: secrets are sealed with AES-256-GCM under a random vault key,
  itself wrapped by a key derived from the password with scrypt (N = 2^17).
  A weak password is refused (same strength rule as backup files).
- **Passkeys (optional second factor)**: up to five (this computer, a phone
  via hybrid/QR, a security key). Each has its own slot sealed by
  HKDF(password-derived key ‖ WebAuthn PRF output): the password alone, or a
  passkey alone, opens nothing. A passkey can also confirm a signature while
  the session is open (a PRF fingerprint is checked, under the same
  throttling as the password).
- **Session**: the vault key is kept sealed in session storage by a
  non-extractable key (KeyBox); it is cleared on lock, auto-lock, browser
  close, and on service-worker stop in paranoid mode. Signing keys are wiped
  from memory after each use.
- **Signing**: every request opens a Kalyx window explaining it in plain
  language, with simulation (EVM, Solana) and a local 0-100 risk score
  (phishing site, look-alike domain, unlimited approval, approval to an
  address without code, unknown spender, loss without counterpart, new
  site…). High score = hold to sign. Re-asking the password (or a passkey)
  for each signature is on by default.
- **Duress code**: opens a separate decoy profile whose data never touches the
  real one; both scrypt derivations run on every unlock (same timing).

Known, accepted: anything that can read the browser profile *and* the user's
password can open the vault; WalletConnect session keys (companion mode) live
in extension storage.

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
- Test networks (Sepolia, Base Sepolia, Monad Testnet, Solana Devnet) are
  shared with the dashboard only if the user shows them in the app; the phone
  refuses any request targeting a network that was not granted to the session.
- IndexedDB values encrypted at rest (AES-256-GCM, non-extractable WebCrypto
  key).
- Session cut after 30 min without interaction; balances auto-masked after
  2 min or when the tab goes to the background.
- Chain-sourced text passed to the AI agent is sanitized and truncated.

Known, accepted: WalletConnect session keys live in browser storage (standard
for WalletConnect dApps); the AI key is sent only to the provider the user
chose.

## Supported versions

Only the latest release published on
[kalyx-wallet-release](https://github.com/ahmedsignate2/kalyx-wallet-release/releases/latest)
receives fixes. The app is currently in **open beta**.
