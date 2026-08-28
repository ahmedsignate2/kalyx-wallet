const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

code = code.replace(
  /if \(sim\?\.value\?\.err\) \{/,
  "if (sim?.value?.err && !isUnstaking) {"
);

fs.writeFileSync('app/earn.tsx', code);
