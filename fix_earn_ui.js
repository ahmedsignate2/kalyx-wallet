const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// 1. Fix Modal Title
code = code.replace(
  /<Text style=\{typography\.title\}>\{targetProtocol\?\.type === 'Lending' \? 'Déposer sur' : 'Staker sur'\} \{targetProtocol\?\.project\}<\/Text>/,
  "<Text style={typography.title}>{isUnstaking ? 'Retirer de' : (targetProtocol?.type === 'Lending' ? 'Déposer sur' : 'Staker sur')} {targetProtocol?.project}</Text>"
);

// 2. Fix the CTA Button
code = code.replace(
  /<Button label=\{\`Confirmer le \$\{targetProtocol\?\.type === 'Lending' \? 'dépôt' : 'staking'\}\`\} onPress=\{validateInput\} \/>/,
  "<Button label={isUnstaking ? 'Confirmer le retrait' : `Confirmer le ${targetProtocol?.type === 'Lending' ? 'dépôt' : 'staking'}`} onPress={validateInput} />"
);

// 3. Pre-fill MAX when opening Unstake modal
code = code.replace(
  /const handleOpenInputModal = \(protocol: any, unstake: boolean = false\) => \{[\s\S]*?setIsUnstaking\(unstake\);/,
  `const handleOpenInputModal = (protocol: any, unstake: boolean = false) => {
    setIsUnstaking(unstake);
    setAmountStr('');` // reset it initially
);

code = code.replace(
  /setTargetProtocol\(protocol\);\n    setInputModalVisible\(true\);/,
  `setTargetProtocol(protocol);
    setInputModalVisible(true);
    if (unstake) {
      setTimeout(() => applyShortcut(100), 50); // Pre-fill with MAX balance
    }`
);

fs.writeFileSync('app/earn.tsx', code);
