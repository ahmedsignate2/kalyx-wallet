# Privacy policy — Kalyx Wallet extension

*Last updated: October 19, 2026*

Kalyx Wallet is a **non-custodial** wallet: your keys and recovery phrase
never leave your computer. Kalyx has no user accounts and no server that keeps
your data.

## What stays on your computer

- **The vault**: your recovery phrase and private keys, encrypted with a key
  derived from your password (scrypt, then AES-256-GCM). Your password is
  never stored.
- **The session**: while Kalyx is unlocked, the vault key is held in the
  browser's memory (`storage.session`) and erased when the wallet locks or the
  browser closes.
- **Your settings and local data**: lock delay, currency, whitelist, connected
  sites, cache of balances and activity.

Uninstalling the extension erases all of this. Without your recovery phrase,
nobody, not even Kalyx, can recover your funds.

## What Kalyx does not collect

No usage statistics, no telemetry, no trackers, no logs sent to Kalyx. Kalyx
does not sell or share any data, and uses none for advertising.

## What goes over the network, and why

A wallet has to query blockchains. To show your balances and activity and to
send your transactions, the extension contacts directly, from your browser:

| Service | What is sent | Why |
|---|---|---|
| Public nodes of each network (RPC) | Your **public** addresses, your **signed** transactions | Read balances, estimate fees, broadcast a transaction |
| Block explorers (e.g. Blockscout) | Your public addresses | Read your history |
| DefiLlama / CoinGecko | Token identifiers (not your addresses) | Show value in your currency |
| GoPlus Security | A contract or recipient address, a site's domain | Flag a dangerous contract or site before you sign |
| Hosts of token logos (e.g. CoinGecko, wsrv.nl) | The image request, without your address | Show token logos |
| Kalyx relay (Cloudflare), to Alchemy, Etherscan and Helius | Your **public** EVM address and the list of networks; a transaction to simulate before signing | List your ERC-20 tokens and NFTs, fill in prices, history, simulation — with no API key inside the extension. No logs are kept. |

These services see your IP address, like any website you visit. Blockchain
addresses are public by nature. **Your phrase, keys and password are never
sent.** The exact list of hosts contacted is in the extension's source code.

## Websites (dApps)

A site only sees your address if you agree to connect it, in a Kalyx window.
It can't sign anything without your approval, asked every time. You can
disconnect a site at any time (Settings → Connected sites).

## Permissions

- `storage`: keep the encrypted vault and your settings locally.
- `alarms`, `idle`: lock Kalyx after the chosen delay and as soon as the
  screen locks.
- `sidePanel`: open Kalyx in the side panel.
- `scripting` and site access: let websites propose a connection or a
  signature, which you accept or refuse in Kalyx.

## Contact

For any question: support@kalyxwallet.com (or Telegram @kalyxntw)
