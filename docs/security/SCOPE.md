# Kalyx Wallet — assets in scope

Asset list for the HackerOne program (one line per asset to declare). All
source code is in this repository.

| Asset | Type | Identifier | Max severity | Notes |
| --- | --- | --- | --- | --- |
| Android app | Android app (APK) | `com.kalyx.wallet` — download from kalyxwallet.com/download, checksum `kalyx-wallet.apk.sha256` | Critical | Source: `app/`, `lib/`, `src/`, `ui/`. Key storage, signing, WalletConnect / TON Connect, dApp browser, backups, duress code, whitelist. |
| Browser extension | Other (browser extension) | Kalyx Wallet extension (Chrome, Edge, Brave), source in `extension/` | Critical | Vault, passkeys, dApp bridge (EIP-1193 / EIP-6963, Solana and Bitcoin Wallet Standard), approval window, companion mode. |
| Web dashboard | URL | `app.kalyxwallet.com` | High | Extension interface in companion mode, no keys (`extension/web/`). |
| Cloudflare relay | URL | `kalyx-ton-proxy.ahamedsignate2.workers.dev` | High | Server-side API keys, method allow-lists, caching (`ton-proxy/`). No load testing. |
| Telegram bot | Other | Kalyx Telegram bot (source `bot/`, Cloudflare Worker) | Medium | Webhook authentication, input handling. |
| Marketing site | URL | `kalyxwallet.com` | Medium | Static site (`web/`); download and WalletConnect / TON Connect relay pages. |
| Source code | Source code | `github.com/ahmedsignate2/kalyx-wallet` | Critical | Release pipeline integrity (`scripts/publish-release.mjs`, `.eas/workflows/`). |

Out of scope: see `VDP.md` ("Out of scope").
