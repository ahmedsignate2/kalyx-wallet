const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');
code = code.replace(
  "const savaxBal = await avalancheAdapter.getTokenBalance(savaxAddress, account.evmAddress);",
  `const savaxBal = await avalancheAdapter.getTokenBalance(savaxAddress, account.evmAddress);
        console.log('[DEBUG EARN] sAVAX balance fetched:', savaxBal.toString());`
);
code = code.replace(
  "console.warn('Failed to fetch staked tokens', e);",
  "console.warn('[DEBUG EARN] Failed to fetch staked tokens', e);"
);
fs.writeFileSync('app/earn.tsx', code);
