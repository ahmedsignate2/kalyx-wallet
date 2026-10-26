# Privacy practices form (Chrome Web Store)

Copy each block into the matching field of the "Privacy practices" tab.

## Single purpose
Kalyx Wallet is a non-custodial cryptocurrency wallet: it stores the user's keys encrypted on their computer (or, in companion mode, leaves them on the user's phone), shows balances and activity, sends funds, and lets websites (dApps) request a connection or a signature that the user approves or refuses in a Kalyx window.

## Permission justifications

| Permission | Why |
|---|---|
| `storage` | Stores the encrypted vault (keys encrypted with the user's password), settings, connected sites and a cache of balances, all locally on the computer. The decryption key of an unlocked session is held in `storage.session` (memory only, cleared when the browser closes or the wallet locks). |
| `alarms` | Locks the wallet automatically after the delay chosen by the user, even if the service worker was suspended. Also used to check the status of a transaction the user just sent, to remind the user of token approvals they asked to revoke, and, in companion mode, to tell the linked phone every few hours that the extension is still connected. |
| `idle` | Locks the wallet as soon as the computer screen locks (and, if the user enables the strict mode, after one minute of inactivity). |
| `sidePanel` | Lets the user open the wallet in Chrome's side panel instead of the popup. |
| `notifications` | Tells the user when a transaction sent from the wallet is confirmed or fails, and when a token approval they asked to be reminded about is due for revocation. No marketing, no other notification. |
| `scripting` | Registers the in-page provider script (EIP-1193 / EIP-6963 for EVM, Wallet Standard for Solana and Bitcoin) so websites can ask the wallet to connect or sign. The script exposes no key and only relays requests to the extension, which shows them to the user. |
| Host permissions `http://*/*`, `https://*/*` | Required for the provider script to be available on any website the user visits, as with every browser wallet; the user decides which sites may connect, and a site sees nothing until the user approves it. The extension also uses them to reach blockchain nodes and the data services listed in the privacy policy. |

## Remote code
No, I am not using remote code. All JavaScript is in the package; no script is downloaded and executed. The extension only exchanges data (JSON) with blockchain nodes and data services.

## Data usage
Tick nothing in "What user data do you plan to collect": the developer collects **no** data. No analytics, no telemetry, no account.

- Website content: the extension reads only the requests a site sends to the wallet (connection, signature), to show them to the user.
- Data sent to third parties: only what a blockchain wallet needs to work (public addresses to nodes and data services, and to the Kalyx relay on Cloudflare; see the privacy policy). Never keys, phrases or passwords. Not sold, not used for advertising or credit.

Then tick the three certifications (no sale or transfer of user data, no use unrelated to the single purpose, no use for creditworthiness or lending).

Privacy policy URL: https://kalyxwallet.com/privacy
