const fs = require('fs');

let code = fs.readFileSync('app/earn.tsx', 'utf8');

// 1. Fix validateInput
const regexValidate = /const validateInput = \(\) => \{\s*if \(\!targetProtocol\) return;\s*if \(\!amountStr/m;
const replacementValidate = `const validateInput = () => {
    if (!targetProtocol) return;
    const isNative = targetProtocol?.asset === 'SOL' || targetProtocol?.asset === 'ETH' || targetProtocol?.asset === 'AVAX' || targetProtocol?.asset === 'BNB';
    const estGas = ['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) ? 0.002 : 0.00001;
    const totalNeeded = Number(amountStr) + (isNative ? estGas : 0);
    const userBal = Number(formatBalance(balances[targetProtocol?.asset] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18));
    
    if (!amountStr || isNaN(Number(amountStr)) || Number(amountStr) <= 0) {
      toast.error('Montant invalide', 'Veuillez saisir un montant valide à staker.');
      return;
    }
    if (totalNeeded > userBal) {
      toast.error('Solde insuffisant', 'Vous n\\'avez pas assez de fonds pour couvrir le montant et les frais réseau.');
      return;
    }`;

code = code.replace(regexValidate, replacementValidate.replace(/if \(\!amountStr/m, ''));


// 2. Fix the button rendering inside the Modal
const regexButtonRender = /<View style=\{\{ opacity: \(Number\(amountStr\) > Number\(formatBalance\(balances\[targetProtocol\?\.asset\] \|\| 0n, \(targetProtocol\?\.underlyingAsset === 'USDC' \|\| targetProtocol\?\.underlyingAsset === 'USDC_SOL'\) \? 6 : targetProtocol\?\.underlyingAsset === 'SOL' \? 9 : 18\)\)\) \? 0\.5 : 1 \}\}>[\s\S]*?<\/View>/m;

const replacementButton = `
             {(() => {
               const isNative = targetProtocol?.asset === 'SOL' || targetProtocol?.asset === 'ETH' || targetProtocol?.asset === 'AVAX' || targetProtocol?.asset === 'BNB';
               const estGas = ['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) ? 0.002 : 0.00001;
               const totalNeeded = Number(amountStr || 0) + (isNative ? estGas : 0);
               const userBal = Number(formatBalance(balances[targetProtocol?.asset] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18));
               const isInsufficient = Number(amountStr) > 0 && totalNeeded > userBal;
               return (
                 <View style={{ opacity: isInsufficient ? 0.5 : 1 }}>
                   <Button 
                     label={isInsufficient ? "Solde insuffisant" : "Valider"} 
                     onPress={isInsufficient ? undefined : validateInput} 
                     disabled={isInsufficient}
                   />
                 </View>
               );
             })()}
`;
code = code.replace(regexButtonRender, replacementButton);

// 3. Fix the template literal strings in ConfirmUnlock
code = code.replace(/title=\{\`Staking \\\$\{(.*?)\}\`\}/g, "title={`Staking ${$1}`}");
code = code.replace(/subtitle=\{\`Dépôt de \\\$\{amountStr\} \\\$\{(.*?)\}\`\}/g, "subtitle={`Dépôt de ${amountStr} ${$1}`}");

// Wait, I might have replaced incorrectly. Let me just replace the exact substrings.
code = code.replace(/Staking \\\$\{targetProtocol\?\.name\}/g, "Staking ${targetProtocol?.name}");
code = code.replace(/Dépôt de \\\$\{amountStr\} \\\$\{targetProtocol\?\.asset\}/g, "Dépôt de ${amountStr} ${targetProtocol?.asset}");
code = code.replace(/message=\{\`Vos \\\$\{targetProtocol\?\.asset\}/g, "message={`Vos ${targetProtocol?.asset}");

fs.writeFileSync('app/earn.tsx', code);
