# Kalyx Wallet — scope

Asset list for the HackerOne program (one line per asset to declare). All
source code is in this repository. Only the **latest published version** of
each asset is in scope; reports must state the version tested (app version
and build number, extension version, or commit hash).

## In scope

| Asset | Type | Identifier | Current version | Max severity | Notes |
| --- | --- | --- | --- | --- | --- |
| Android app | Android: .apk | `com.kalyx.wallet` | 1.0.0 (latest release) — [kalyxwallet.com/download](https://kalyxwallet.com/download), checksum `kalyx-wallet.apk.sha256` attached to the release | Critical | Source: `app/`, `lib/`, `src/`, `ui/`. Key storage, PIN and biometrics, signing, WalletConnect / TON Connect, companion requests, dApp browser, backups, duress code, whitelist. |
| Browser extension | Other: browser extension | Kalyx Wallet for Chromium (Chrome, Edge, Brave) | 0.10.0 beta — package attached to the GitHub release `extension-v0.10.0` | Critical | Source: `extension/`. Vault, passkeys, dApp bridge (EIP-1193 / EIP-6963, Solana and Bitcoin Wallet Standard), approval window and risk score, companion mode. |
| Web dashboard | URL | `https://app.kalyxwallet.com` | built from `main` (`extension/web/`) | High | Extension interface in companion mode: no keys, no password. Pairing, session handling, CSP and Trusted Types, local storage, request forwarding to the phone. |
| Cloudflare relay | URL | `kalyx-ton-proxy.ahamedsignate2.workers.dev` | built from `main` (`ton-proxy/`) | High | Server-side API keys, method allow-lists, caching, origin checks. **No load testing.** |
| Telegram bot | Other | Kalyx Telegram bot (Cloudflare Worker) | built from `main` (`bot/`) | Medium | Webhook authentication, input handling, links it sends. |
| Marketing site | URL | `https://kalyxwallet.com` | built from `main` (`web/`) | Medium | Static site, download page, WalletConnect / TON Connect relay pages. |
| Source code | Source code | `https://github.com/ahmedsignate2/kalyx-wallet` | `main` | Critical | Release pipeline integrity (`.eas/workflows/`, `scripts/publish-release.mjs`, `.github/workflows/`), secrets in the repository. |

## Out of scope

| Asset | Why |
| --- | --- |
| Development and preview builds (version 0.1.0, Expo Go, development client) and their over-the-air updates | Test builds, not distributed to users. |
| iOS app | Not published. |
| Extension on Firefox or Safari | Not supported; only Chromium is built. |
| Versions older than the latest release | Fixed in the latest version or no longer distributed. |
| Legacy web dashboard (`ui/web/`, `lib/webConnect.ts`) | Kept in the code as reference, no longer deployed. `app.kalyxwallet.com` is built from `extension/web/`. |
| `promo-video/` | Promotional video source, not shipped. |
| Other `*.workers.dev`, `*.pages.dev` or `*.expo.dev` hosts | Not operated as part of the product. |
| Third-party services: RPC providers, WalletConnect relay, CoinGecko, DefiLlama, LI.FI, Relay, Jupiter, STON.fi, GoPlus, Alchemy, Helius, TonAPI, Etherscan, Stripe, MoonPay, Cloudflare, Telegram, GitHub, Expo | Report to the vendor directly. Issues in **how Kalyx uses** them stay in scope. |
| AI providers chosen by the user for the Copilot (DeepSeek, OpenAI, Anthropic, Gemini…) | Third-party services; what Kalyx sends them stays in scope. |
| Smart contracts and tokens of third-party protocols | Not operated by Kalyx. |

Out-of-scope vulnerability types and the rules of engagement are in
[`VDP.md`](VDP.md).
