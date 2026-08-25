const fs = require('fs');
const content = fs.readFileSync('app/swap.tsx', 'utf8');
if (content.includes('s.accounts[s.activeAccountIndex]')) {
  console.log("Already uses storedAccount");
} else {
  console.log("Need to inject storedAccount");
}
