import re

with open('lib/walletconnect.ts', 'r') as f:
    content = f.read()

old_block = """      } else if (method === 'bitcoin_signMessage' || method === 'signMessage') {
        const pSafe: any = p || {};
        let msg = pSafe.message || pSafe[0]?.message;
        if (!msg && Array.isArray(pSafe)) msg = pSafe.filter(x => typeof x === 'string').pop();
        if (!msg && typeof pSafe === 'string') msg = pSafe;
        if (typeof msg !== 'string') throw new Error('Expected String');
        const sig = await w.signBitcoinMessage(unlock, msg);
        result = { signature: sig };"""

new_block = """      } else if (method === 'bitcoin_signMessage' || method === 'signMessage') {
        const pSafe: any = p || {};
        let msg = pSafe.message || pSafe[0]?.message;
        if (!msg && Array.isArray(pSafe)) msg = pSafe.filter(x => typeof x === 'string').pop();
        if (!msg && typeof pSafe === 'string') msg = pSafe;
        if (typeof msg !== 'string') throw new Error('Expected String');
        let type = 'ecdsa';
        if (pSafe.type === 'bip322-simple' || pSafe[0]?.type === 'bip322-simple') type = 'bip322';
        const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');
        result = { signature: sig };"""

content = content.replace(old_block, new_block)

with open('lib/walletconnect.ts', 'w') as f:
    f.write(content)
