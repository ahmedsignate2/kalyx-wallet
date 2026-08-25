const fs = require('fs');
let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');

const oldLogic = `let msg = pSafe.message || pSafe[0]?.message;
        if (!msg && Array.isArray(pSafe)) msg = pSafe.filter(x => typeof x === 'string').pop();
        if (!msg && typeof pSafe === 'string') msg = pSafe;`;

const newLogic = `let msg = pSafe.message ?? pSafe.msg ?? pSafe.signMessage;
        if (!msg && Array.isArray(pSafe)) {
          msg = pSafe[0]?.message ?? pSafe[0]?.msg ?? pSafe[0];
        }
        if (!msg && typeof pSafe === 'string') msg = pSafe;`;

wcContent = wcContent.replace(oldLogic, newLogic);
fs.writeFileSync('lib/walletconnect.ts', wcContent);
