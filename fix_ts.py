with open('lib/walletconnect.ts', 'r') as f:
    content = f.read()

# Add getAdapter import
content = content.replace(
    "import { listChains, type RawTxRequest } from '../src';",
    "import { listChains, getAdapter, type RawTxRequest } from '../src';"
)

# Fix btcAddress to use the derived address or just use address because w.account.address might not be BTC if activeChain is not BTC!
# But wait, w.wallets[0] etc. Let's just use the derived BtcAccount address!
# Also use mnemonicToSeedSync from 'src/crypto/mnemonic' instead of 'src/crypto/hd'

content = content.replace(
    "const hdModule = await import('../src/crypto/hd');",
    "const mnemonicModule = await import('../src/crypto/mnemonic');"
)
content = content.replace(
    "hdModule.mnemonicToSeedSync",
    "mnemonicModule.mnemonicToSeedSync"
)

content = content.replace(
    "const activeBtcAddress = w.account?.btcAddress || '';",
    "const activeBtcAddress = derived.address;"
)

content = content.replace(
    "const txid = await (adapter as any).sendBitcoin(w.account?.btcAddress, to, amountStr, {",
    "const txid = await (adapter as any).sendBitcoin(btcSigner.address, to, amountStr, {"
)

with open('lib/walletconnect.ts', 'w') as f:
    f.write(content)
