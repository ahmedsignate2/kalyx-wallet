# Kalyx Wallet — Vulnerability Disclosure Program

This is the policy of the Kalyx Wallet vulnerability disclosure program
(VDP). It is versioned with the code, in this repository, which is the
reference. The program is published on Intake Security:
https://intakesecurity.io/programs/kalyx-wallet, which repeats this text.

Kalyx Wallet is a non-custodial crypto wallet: an Android app, a browser
extension, a web dashboard (`app.kalyxwallet.com`), a Telegram bot and a
marketing site. Keys are generated and kept on the user's device. There is no
Kalyx account, no custody server and no telemetry.

This is a **vulnerability disclosure program without monetary rewards**.
Valid reports are acknowledged publicly (with your consent) in the release
notes and in [`ACKNOWLEDGMENTS.md`](ACKNOWLEDGMENTS.md).

## What we want to hear about

The highest-impact issues for a self-custody wallet, in priority order:

1. **Key or seed exposure**: any way to read, export, log, transmit or derive
   a private key, recovery phrase, vault key or session key without the
   user's PIN / password.
2. **Unauthorised signing**: a transaction or message signed or broadcast
   without the user's explicit approval, or different from what was shown
   (amount, recipient, network, approval scope).
3. **Approval-screen deception**: the plain-language explanation, simulation,
   risk score or address shown to the user can be made to lie (for example a
   transfer shown as a harmless signature, an unlimited approval shown as
   limited, a look-alike domain shown as the real one).
4. **Bypass of a protection**: PIN / password brute-force throttling, duress
   code (decoy profile reveals the real wallets), recipient whitelist and its
   24-hour delay, auto-lock, passkey second factor, phone-only mode.
5. **dApp bridge and companion mode**: a website reading accounts it was not
   granted, acting on a session it does not own, or making the phone sign for
   a site other than the one displayed; a third party linking its own phone
   addresses as the user's.
6. **Backup files**: decrypting a backup without its password, or a backup
   file that alters wallets on restore beyond what it claims to contain.
7. Classic web issues on the in-scope web assets (XSS, CSP bypass,
   clickjacking with impact, open redirect leading to phishing in the
   product, authentication flaws in the Telegram bot).

## Scope

See [`SCOPE.md`](SCOPE.md) for the list of assets, their current versions and
the assets that are out of scope. In short: the Android app, the browser
extension, the web dashboard (`https://app.kalyxwallet.com`), the Telegram bot,
the Cloudflare relay, the marketing site and the release pipeline, in their
latest published version. All their source code is in this repository.

### Out of scope

- Third-party services the product relies on (RPC providers, WalletConnect
  relay, CoinGecko, DefiLlama, LI.FI, Jupiter, GoPlus, Alchemy, Helius,
  Stripe / MoonPay, Cloudflare, Telegram). Report to them directly.
- Attacks requiring a rooted / jailbroken device, a compromised operating
  system or browser, a malicious browser extension with broad permissions,
  or physical access to an unlocked device.
- Social engineering, phishing sites imitating Kalyx (please still tell us so
  we can warn users), physical attacks.
- Denial of service, volumetric attacks, rate-limit exhaustion of the public
  relay, spam.
- Missing best-practice headers or cookie flags without a demonstrated impact,
  clickjacking on pages without sensitive actions, self-XSS, tab-nabbing,
  content spoofing / text injection without impact, version disclosure.
- Findings from automated scanners without a working proof of concept.
- Known, accepted limitations listed in [`SECURITY.md`](../../SECURITY.md) ("Known, accepted").

## Rules of engagement

- **Never use real funds or real users' wallets.** Create your own test
  wallets. Use the test networks the product supports (Sepolia, Base Sepolia,
  Solana Devnet, TON Testnet, Monad Testnet) whenever possible.
- Do not access, modify or destroy data that is not yours. Stop and report as
  soon as you reach someone else's data.
- Do not run load tests or anything that degrades the relay
  (`kalyx-ton-proxy.ahamedsignate2.workers.dev`), the Telegram bot or the
  websites for other users.
- **Never send** a real recovery phrase, private key, PIN, password or API key
  in a report — not even a test one that holds value. We will never ask for
  one.
- Give us reasonable time to fix before any public disclosure (see below).
- One vulnerability per report, unless chaining is needed to show impact.

## How to report

Submit through **[the program on Intake Security](https://intakesecurity.io/programs/kalyx-wallet/submit)**, use **[GitHub private vulnerability reporting](https://github.com/ahmedsignate2/kalyx-wallet/security/advisories/new)** (a private
advisory on this repository) or write to **security@kalyxwallet.com**. Every
email gets an immediate acknowledgement with a ticket number (KLX-YYYY-NNNN);
keep it in the subject when you follow up.
Reports are sorted automatically by severity and component, but **every
security report is read and answered by a person** — the automatic
acknowledgement never validates, rejects or closes a report.

A good report contains: the affected asset and version (app version, extension
version, commit hash), the steps to reproduce, the impact, and a proof of
concept. Videos are welcome for UI deception issues.

## What you can expect from us

| Step | Target |
| --- | --- |
| First response | 3 business days |
| Triage (valid / not applicable / duplicate) | 10 business days |
| Fix for a critical or high issue | as fast as possible, usually within 30 days |
| Public disclosure | coordinated, by default 90 days after the report or when the fix ships, whichever comes first |

Severity is assessed with CVSS 3.1, adjusted for the wallet context: anything
that can move a user's funds or reveal their keys without their approval is
treated as critical.

Kalyx Wallet is maintained by a single developer: response times are targets,
not guarantees, and we will keep you informed if a fix takes longer.

## Safe harbor

We will not pursue or support legal action against you for security research
conducted in good faith and in accordance with this policy. Activities that
follow this policy are considered authorized. If a third party brings legal
action against you for activities that followed this policy, we will make it
known that your actions were authorized. We will not ask you to waive
these protections, and we consider research under this policy to be exempt
from the anti-circumvention provisions of our terms of use and of the
source-available license of this repository. This statement is aligned with
the disclose.io core terms.
