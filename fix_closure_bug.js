const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

code = code.replace(
  /const applyShortcut = async \(pct: number\) => \{/,
  "const applyShortcut = async (pct: number, overrideUnstake?: boolean, overrideProtocol?: any) => {\n    const activeUnstaking = overrideUnstake !== undefined ? overrideUnstake : isUnstaking;\n    const activeProtocol = overrideProtocol || targetProtocol;"
);

code = code.replace(
  /if \(isUnstaking\) \{/g,
  "if (activeUnstaking) {"
);

code = code.replace(
  /if \(!targetProtocol\) return;/g,
  "if (!activeProtocol) return;"
);

code = code.replace(
  /targetProtocol\./g,
  "activeProtocol."
);

code = code.replace(
  /targetProtocol/g,
  "activeProtocol"
);

// wait, the regex replaced `activeProtocol` inside the UI JSX because it matched `targetProtocol`? 
// Yes, replace is global if I used `/g`! I should NOT do a global replace over the whole file!
// Let me revert and do it carefully.
