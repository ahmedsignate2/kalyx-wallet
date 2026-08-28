const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// 1. Add isUnstaking
code = code.replace(
  "const [inputModalVisible, setInputModalVisible] = useState(false);",
  "const [isUnstaking, setIsUnstaking] = useState(false);\n  const [inputModalVisible, setInputModalVisible] = useState(false);"
);

// 2. handleOpenInputModal
code = code.replace(
  "const handleOpenInputModal = (protocol: any) => {",
  "const handleOpenInputModal = (protocol: any, unstake: boolean = false) => {\n    setIsUnstaking(unstake);"
);

// 3. Button unstake in map
const unstakeBtnRegex = /<Button label="Unstake \/ Retirer" variant="ghost" onPress=\{\(\) => \{[\s\S]*?\}\} \/>/;
code = code.replace(unstakeBtnRegex, `<Button label="Unstake / Retirer" variant="ghost" onPress={() => {\n                  const opp = opportunities.find(o => o.id === pos.id);\n                  if (opp) handleOpenInputModal(opp, true);\n                }} />`);

// 4. applyShortcut
code = code.replace(
  "const applyShortcut = async (pct: number) => {",
  `const applyShortcut = async (pct: number) => {
    if (isUnstaking) {
      if (!targetProtocol) return;
      const bal = staked[targetProtocol.id] || 0n;
      const decimals = (targetProtocol.underlyingAsset === 'USDC' || targetProtocol.underlyingAsset === 'USDC_SOL') ? 6 : (targetProtocol.underlyingAsset === 'SOL' ? 9 : 18);
      let amt = Number(formatBalance(bal, decimals)) * (pct / 100);
      setAmountStr(amt > 0 ? Number(amt.toFixed(5)).toString() : '');
      return;
    }`
);

// 5. executeStake quote
code = code.replace(
  "const fromToken = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';",
  "const underlyingAddress = targetProtocol.underlyingAsset === 'ETH' ? NATIVE_TOKEN : targetProtocol.underlyingAsset === 'SOL' ? '11111111111111111111111111111111' : targetProtocol.underlyingAsset === 'USDC_SOL' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';"
);
code = code.replace(
  /fromToken,[\s\n]*toToken: targetProtocol\.yieldTokenAddress,[\s\n]*fromAmount: rawAmount,[\s\n]*fromAddress: isEvm \? account\.evmAddress : account\.solAddress!,[\s\n]*isEarn: true,/,
  `fromToken: isUnstaking ? targetProtocol.yieldTokenAddress : underlyingAddress,
        toToken: isUnstaking ? underlyingAddress : targetProtocol.yieldTokenAddress,
        fromAmount: rawAmount,
        fromAddress: isEvm ? account.evmAddress : account.solAddress!,
        isEarn: !isUnstaking,`
);

// 6. UI texts
code = code.replace(
  "<Title>Staker sur {targetProtocol?.project}</Title>",
  "<Title>{isUnstaking ? 'Retirer de' : 'Staker sur'} {targetProtocol?.project}</Title>"
);
code = code.replace(
  "Solde disponible : {formatCrypto(balances[targetProtocol?.underlyingAsset], ((targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18))} {targetProtocol?.underlyingAsset}",
  "Solde : {isUnstaking ? formatCrypto(staked[targetProtocol?.id], ((targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18)) : formatCrypto(balances[targetProtocol?.underlyingAsset], ((targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18))} {isUnstaking ? targetProtocol?.project + ' (Staked)' : targetProtocol?.underlyingAsset}"
);
code = code.replace(
  "<Text style={{ fontSize: 24, color: colors.textFaint, fontFamily: fonts.medium }}>{targetProtocol?.underlyingAsset}</Text>",
  "<Text style={{ fontSize: 24, color: colors.textFaint, fontFamily: fonts.medium }}>{isUnstaking ? targetProtocol?.project : targetProtocol?.underlyingAsset}</Text>"
);
code = code.replace(
  "<Button label={`Confirmer le ${targetProtocol?.type === 'Lending' ? 'dépôt' : 'staking'}`}",
  "<Button label={isUnstaking ? 'Confirmer le retrait' : `Confirmer le ${targetProtocol?.type === 'Lending' ? 'dépôt' : 'staking'}`}"
);

// Fix validateInput for unstaking
code = code.replace(
  "const totalNeeded = Number(amountStr) + (isNative ? estGas : 0);",
  "const totalNeeded = isUnstaking ? Number(amountStr) : Number(amountStr) + (isNative ? estGas : 0);"
);
code = code.replace(
  "const userBal = Number(formatBalance(balances[targetProtocol?.underlyingAsset] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18));",
  "const userBal = isUnstaking ? Number(formatBalance(staked[targetProtocol?.id] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18)) : Number(formatBalance(balances[targetProtocol?.underlyingAsset] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18));"
);
code = code.replace(
  "const userBalance = Number(formatBalance(balRaw, (targetProtocol.underlyingAsset === 'USDC' ? 6 : targetProtocol.underlyingAsset === 'SOL' ? 9 : 18)));",
  "const userBalance = isUnstaking ? Number(formatBalance(staked[targetProtocol?.id] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18)) : Number(formatBalance(balRaw, (targetProtocol.underlyingAsset === 'USDC' ? 6 : targetProtocol.underlyingAsset === 'SOL' ? 9 : 18)));"
);

fs.writeFileSync('app/earn.tsx', code);
