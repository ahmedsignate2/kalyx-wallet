# Privacy practices form (Chrome Web Store)

## Single purpose
Kalyx Wallet is a non-custodial cryptocurrency wallet: it stores the user's keys encrypted on their computer, shows balances and activity, sends funds, and lets websites (dApps) request a connection or a signature that the user approves or refuses in a Kalyx window.

## Permission justifications

| Permission | Why |
|---|---|
| `storage` | Stores the encrypted vault (keys encrypted with the user's password), settings, connected sites and a cache of balances, all locally. The decryption key of an unlocked session is held in `storage.session` (memory only, cleared when the browser closes or the wallet locks). |
| `alarms` | Locks the wallet automatically after the delay chosen by the user, even if the service worker was suspended. |
| `idle` | Locks the wallet as soon as the computer screen locks. |
| `sidePanel` | Lets the user open the wallet in Chrome's side panel. |
| `scripting` | Registers the in-page provider script (EIP-1193 / EIP-6963 for EVM, Wallet Standard for Solana) so websites can ask the wallet to connect or sign. The script exposes no key and only relays requests. |
| Host permissions `http://*/*`, `https://*/*` | Required for the provider script to be available on any website the user visits, as with every browser wallet; the user decides which sites may connect. The extension also uses these to reach blockchain nodes and the data services listed in the privacy policy. |

## Remote code
No. All code is in the package; nothing is downloaded and executed.

## Data usage
- Collected by the developer: **none**. No analytics, no telemetry, no account.
- Website content: the extension reads only the requests a site sends to the wallet (connection, signature), to show them to the user.
- Data sent to third parties: only what a blockchain wallet needs to work (public addresses to nodes and data services, and to the Kalyx relay on Cloudflare for ERC-20 token lists; see the privacy policy). Never keys, phrases or passwords. Not sold, not used for advertising or credit.
