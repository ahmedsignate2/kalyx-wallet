const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// Fix userStakedPositions
const regexPos = /<View style=\{\{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' \}\}>\s*<View style=\{\{ flexDirection: 'row', alignItems: 'center', gap: spacing\(1\.5\), flex: 1 \}\}>\s*<View style=\{\{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E84142', alignItems: 'center', justifyContent: 'center' \}\}>\s*<Icon name="staking" size=\{24\} color="#FFF" \/>\s*<\/View>\s*<View>\s*<Text style=\{typography\.bodyStrong\}>\{pos\.name\}<\/Text>\s*<Text style=\{typography\.muted\}>\{pos\.protocol\}<\/Text>\s*<\/View>\s*<\/View>\s*<View style=\{\{ alignItems: 'flex-end', paddingRight: spacing\(1\) \}\}>\s*<Text style=\{typography\.bodyStrong\}>\{formatCrypto\(pos\.balance, pos\.decimals\)\} \{pos\.symbol\}<\/Text>\s*<Text style=\{\[typography\.muted, \{ color: colors\.up, fontSize: 12 \}\]\}>Actif<\/Text>\s*<\/View>\s*<\/View>/m;

const replacePos = `<View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E84142', alignItems: 'center', justifyContent: 'center', marginRight: spacing(1.5) }}>
                  <Icon name="staking" size={24} color="#FFF" />
                </View>
                <View style={{ flex: 1, paddingRight: spacing(1) }}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>{pos.name}</Text>
                  <Text style={typography.muted} numberOfLines={1}>{pos.protocol}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={typography.bodyStrong}>{formatCrypto(pos.balance, pos.decimals)} {pos.symbol}</Text>
                  <Text style={[typography.muted, { color: colors.up, fontSize: 12 }]}>Actif</Text>
                </View>
              </View>`;
code = code.replace(regexPos, replacePos);

// Fix eligibleOpps
const regexOpp = /<View style=\{\{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' \}\}>\s*<View style=\{\{ flexDirection: 'row', alignItems: 'center', gap: spacing\(1\.5\), flex: 1 \}\}>\s*<View style=\{\{ width: 40, height: 40, borderRadius: 20, backgroundColor: opp\.underlyingAsset === 'SOL' \? '#14F195' : opp\.underlyingAsset === 'AVAX' \? '#E84142' : opp\.underlyingAsset === 'BNB' \? '#F3BA2F' : \(opp\.underlyingAsset === 'USDC' \|\| opp\.underlyingAsset === 'USDC_SOL'\) \? '#B6509E' : '#627EEA', alignItems: 'center', justifyContent: 'center' \}\}>\s*<Icon name=\{opp\.underlyingAsset === 'SOL' \? 'staking' : 'defi'\} size=\{24\} color=\{opp\.underlyingAsset === 'SOL' \? '#000' : '#FFF'\} \/>\s*<\/View>\s*<View>\s*<Text style=\{typography\.bodyStrong\}>\{opp\.name\} \(\{opp\.underlyingAsset\}\)<\/Text>\s*<Text style=\{typography\.muted\}>~\{opp\.apy\}% APY • \{opp\.type\}<\/Text>\s*<\/View>\s*<\/View>\s*<Text style=\{\{ fontFamily: fonts\.bold, color: colors\.up \}\}>\+\{opp\.apy\}%<\/Text>\s*<\/View>/m;

const replaceOpp = `<View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: opp.underlyingAsset === 'SOL' ? '#14F195' : opp.underlyingAsset === 'AVAX' ? '#E84142' : opp.underlyingAsset === 'BNB' ? '#F3BA2F' : (opp.underlyingAsset === 'USDC' || opp.underlyingAsset === 'USDC_SOL') ? '#B6509E' : '#627EEA', alignItems: 'center', justifyContent: 'center', marginRight: spacing(1.5) }}>
              <Icon name={opp.underlyingAsset === 'SOL' ? 'staking' : 'defi'} size={24} color={opp.underlyingAsset === 'SOL' ? '#000' : '#FFF'} />
            </View>
            <View style={{ flex: 1, paddingRight: spacing(1) }}>
              <Text style={typography.bodyStrong} numberOfLines={1}>{opp.name} ({opp.underlyingAsset})</Text>
              <Text style={typography.muted} numberOfLines={1}>~{opp.apy}% APY • {opp.type}</Text>
            </View>
            <Text style={{ fontFamily: fonts.bold, color: colors.up }}>+{opp.apy}%</Text>
          </View>`;
code = code.replace(regexOpp, replaceOpp);

fs.writeFileSync('app/earn.tsx', code);
