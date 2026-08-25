import re

with open('lib/walletStore.ts', 'r') as f:
    content = f.read()

content = content.replace("  deriveBtcSigner,", "  deriveBtcSigner,\n  type BtcSigner,")

with open('lib/walletStore.ts', 'w') as f:
    f.write(content)
