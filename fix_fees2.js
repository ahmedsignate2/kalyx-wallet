const fs = require('fs');
let code = fs.readFileSync('src/domain/swap/lifi.ts', 'utf8');

const regexFee = /if \(withFee\) \{\s*qs\.set\('fee', isEarn \? EARN_FEE : NOVA_FEE\);\s*if \(FEE_RECIPIENT\) qs\.set\('feeRecipient', FEE_RECIPIENT\);\s*\}/m;
const replacementFee = `if (withFee) {
    const feeToSet = isEarn ? EARN_FEE : NOVA_FEE;
    if (feeToSet !== '0') {
      qs.set('fee', feeToSet);
      if (FEE_RECIPIENT) qs.set('feeRecipient', FEE_RECIPIENT);
    }
  }`;

code = code.replace(regexFee, replacementFee);
fs.writeFileSync('src/domain/swap/lifi.ts', code);
