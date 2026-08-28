const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// 1. Fix ConfirmUnlock props
code = code.replace(
  /title=\{\`Staking \$\{targetProtocol\?\.project\}\`\}/,
  "title={isUnstaking ? `Retrait de ${targetProtocol?.project}` : `Staking ${targetProtocol?.project}`}"
);
code = code.replace(
  /subtitle=\{\`Dépôt de \$\{amountStr\} \$\{targetProtocol\?\.underlyingAsset\}\`\}/,
  "subtitle={isUnstaking ? `Retrait de ${amountStr} ${targetProtocol?.symbol || targetProtocol?.underlyingAsset}` : `Dépôt de ${amountStr} ${targetProtocol?.underlyingAsset}`}"
);

// 2. Fix applyShortcut rounding bug
const regexShortcut = /let amt = Number\(formatBalance\(maxBal, decimals\)\) \* \(pct \/ 100\);\n\s*setAmountStr\(amt > 0 \? Number\(amt\.toFixed\(5\)\)\.toString\(\) : ''\);/g;
const replacementShortcut = `let amt = Number(formatBalance(maxBal, decimals)) * (pct / 100);
    if (pct === 100) {
       setAmountStr(formatBalance(maxBal, decimals));
    } else {
       setAmountStr(amt > 0 ? Number(Math.floor(amt * 10000) / 10000).toString() : '');
    }`;
code = code.replace(regexShortcut, replacementShortcut);

const regexShortcut2 = /let amt = Number\(formatBalance\(bal, decimals\)\) \* \(pct \/ 100\);\n\s*setAmountStr\(amt > 0 \? Number\(amt\.toFixed\(5\)\)\.toString\(\) : ''\);/g;
const replacementShortcut2 = `let amtStrVal = formatBalance(bal, decimals);
      if (pct === 100) {
        setAmountStr(amtStrVal);
      } else {
        let amt = Number(amtStrVal) * (pct / 100);
        setAmountStr(amt > 0 ? Number(Math.floor(amt * 10000) / 10000).toString() : '');
      }`;
code = code.replace(regexShortcut2, replacementShortcut2);


// 3. Fix validateInput error message
code = code.replace(
  /toast\.error\('Solde insuffisant', \`Tu possèdes \$\{userBalance\} \$\{targetProtocol\.underlyingAsset\}\`\);/,
  "toast.error('Solde insuffisant', `Tu possèdes ${userBalance} ${isUnstaking ? (targetProtocol.symbol || targetProtocol.project) : targetProtocol.underlyingAsset}`);"
);

fs.writeFileSync('app/earn.tsx', code);
