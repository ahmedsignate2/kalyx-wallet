import os
import re

def replace_in_file(path, old, new):
    with open(path, 'r') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)

replace_in_file('src/crypto/btc.ts', 'BtcSigner', 'LocalBtcSigner')
replace_in_file('src/index.ts', 'BtcSigner', 'LocalBtcSigner')
replace_in_file('src/domain/chains/BitcoinChainAdapter.ts', 'BtcSigner', 'LocalBtcSigner')
replace_in_file('lib/walletStore.ts', 'BtcSigner', 'LocalBtcSigner')

