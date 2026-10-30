# Security Policy

## Status: not independently audited

Kalyx Wallet has **not** been audited by an independent security firm. It is
built and maintained by a solo developer. Do not store amounts you cannot
afford to lose until an audit has been published in this repository.

## Reporting a vulnerability

Kalyx Wallet runs a **vulnerability disclosure program (VDP)** without
monetary rewards: valid reports are credited publicly (with your consent) in
the release notes and in
[`docs/security/ACKNOWLEDGMENTS.md`](docs/security/ACKNOWLEDGMENTS.md).
The full policy — priorities, rules of engagement, response targets, safe
harbor — is in [`docs/security/VDP.md`](docs/security/VDP.md), and the assets
in scope in [`docs/security/SCOPE.md`](docs/security/SCOPE.md).

Please report privately — **never** through public GitHub Issues:

- Intake Security: **[the Kalyx Wallet program](https://intakesecurity.io/programs/kalyx-wallet)** — [submit a report](https://intakesecurity.io/programs/kalyx-wallet/submit).
- GitHub: **[Report a vulnerability](https://github.com/ahmedsignate2/kalyx-wallet/security/advisories/new)** — a private security
  advisory on this repository, visible only to you and the maintainer.
- Email: **security@kalyxwallet.com**. Every report gets an immediate
  acknowledgement with a ticket number (KLX-YYYY-NNNN) and is read by a person;
  keep the ticket number in the subject when you follow up.

This repository stays the reference for the policy and the scope; the program
page on Intake Security repeats them.

Include: the affected asset and version (app version, extension version or
commit hash), steps to reproduce, impact, and a proof of concept. You will get
a first response within 3 business days. Coordinated disclosure: by default
90 days after the report or when the fix ships, whichever comes first; you
will be credited if you wish.

**Never send** recovery phrases, private keys, PINs, passwords, API keys or
authentication tokens in a report — real or test. We will never ask for them.
Test with your own wallets, on test networks whenever possible.

## Scope

In scope:
- The mobile app (`app/`, `lib/`, `src/`, `ui/`): key generation and storage,
  PIN/biometrics, signing, WalletConnect and TON Connect handling, the
  in-app dApp browser, transaction simulation, address-poisoning detection,
  duress code / decoy wallet, recipient whitelist, backups.
- The web dashboard `app.kalyxwallet.com` (`extension/web/`: the extension's
  interface in companion mode, its in-page host and generated `_headers`):
  session handling, CSP, local storage, request forwarding to the phone.
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
- The previous web dashboard code (`ui/web/`, `lib/webConnect.ts`): kept for
  reference, no longer deployed (`app.kalyxwallet.com` is built from
  `extension/web/`).
- Kalyx's internal support tooling (`support.kalyxwallet.com`, the support
  mail worker and its `*.workers.dev` address, the support Telegram bot): not
  part of the product, not in this repository, protected by Cloudflare Access.
  Do not test it; if you notice an exposure of report data, tell us by email.

## Safe harbor

Good-faith research that respects this policy (no data destruction, no access
to other users' data, no service disruption, no use of real funds) is
authorized and will not be met with legal action. The full safe-harbor
statement, aligned with the disclose.io core terms, is in
`docs/security/VDP.md`.

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

The dashboard is the browser extension's interface in **companion mode**,
running in a web page (`extension/web/`): the same modules and the same
message router as the extension, hosted in the page instead of a service
worker. It **never** holds a private key, seed phrase or PIN, and it has no
password: it is linked to the phone by a WalletConnect QR (the user confirms
on both sides), receives the phone's public addresses, and forwards every
transfer, swap or approval revocation to the phone, where the user approves
it. Creating or importing a wallet is refused by the router (`PHONE_ONLY`).
What an attacker who fully compromises the browser tab could obtain: public
addresses, balances, contacts, display preferences and the user's own BYOK AI
API key (sent only to the provider they chose; the model receives a summary of
tokens and activity without any address, and a message that looks like a
recovery phrase or private key is never sent); they could *ask* the
phone to sign — which the phone shows to the user for approval.

Hardening in place (`_headers` generated by `extension/web/vite.config.ts`):
- Enforced Content-Security-Policy, the extension pages' policy: scripts and
  styles only from the origin (no inline, no `eval`), Trusted Types with no
  policy (no HTML or script injection by string), fonts self-hosted, frames
  limited to WalletConnect Verify, embedding limited to Telegram,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`.
- `Referrer-Policy: no-referrer`, `nosniff`, HSTS preload, restrictive
  `Permissions-Policy`, COOP/CORP.
- The local container (addresses received from the phone, preferences) is
  sealed with a random key kept in this browser; it holds no secret.
- Session cut after 30 min without interaction: the phone link is closed and
  everything Kalyx stored in the browser is erased. "Sign out" does the same.
- The test-only hook (`--mode test`) is compiled out of the published build.

Known, accepted: WalletConnect session keys live in browser storage (standard
for WalletConnect dApps).

## Supported versions

Only the latest release published on
[kalyx-wallet-release](https://github.com/ahmedsignate2/kalyx-wallet-release/releases/latest)
receives fixes. The app is currently in **open beta**.
