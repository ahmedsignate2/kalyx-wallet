const fs = require('fs');

let code = fs.readFileSync('app/earn.tsx', 'utf8');

const positionState = `
  const [staked, setStaked] = useState<Record<string, bigint>>({});
  const [userStakedPositions, setUserStakedPositions] = useState<any[]>([]);
`;

code = code.replace("const [staked, setStaked] = useState<Record<string, bigint>>({});", positionState);

const loadPositions = `
      newBalances['ETH'] = eBal;
      newBalances['AVAX'] = aBal;
      newBalances['BNB'] = bBal;
      newBalances['ETH_BASE'] = baBal;
      
      // -- Fetch Liquid Staking Tokens --
      try {
        const avalancheAdapter = getAdapter('avalanche') as EvmChainAdapter;
        const savaxAddress = '0x2b2c81e08f1af8835a78bb2a9caba09866032896';
        const savaxBal = await avalancheAdapter.getTokenBalance(savaxAddress, account.evmAddress);
        
        const positions = [];
        if (savaxBal > 0n) {
          positions.push({
            id: 'SAVAX',
            name: 'Avalanche Staking',
            symbol: 'sAVAX',
            protocol: 'BENQI Liquid Staking',
            balance: savaxBal,
            decimals: 18,
            underlyingAsset: 'AVAX'
          });
        }
        setUserStakedPositions(positions);
      } catch (e) {
        console.warn('Failed to fetch staked tokens', e);
      }
`;

code = code.replace(/newBalances\['ETH'\] = eBal;\s*newBalances\['AVAX'\] = aBal;\s*newBalances\['BNB'\] = bBal;\s*(newBalances\['ETH_BASE'\] = baBal;)?/, loadPositions);


const renderPositions = `
      {/* SECTION MES POSITIONS */}
      {userStakedPositions.length > 0 && (
        <View style={{ marginBottom: spacing(4) }}>
          <Text style={[typography.title, { marginBottom: spacing(2) }]}>Mes positions actives</Text>
          {userStakedPositions.map((pos) => (
            <Card key={pos.id} style={{ padding: spacing(2), marginBottom: spacing(2), borderColor: colors.accent, borderWidth: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E84142', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="staking" size={24} color="#FFF" />
                  </View>
                  <View>
                    <Text style={typography.bodyStrong}>{pos.name}</Text>
                    <Text style={typography.muted}>{pos.protocol}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={typography.bodyStrong}>{formatCrypto(pos.balance, pos.decimals)} {pos.symbol}</Text>
                  <Text style={[typography.muted, { color: colors.up, fontSize: 12 }]}>Actif</Text>
                </View>
              </View>
              
              <View style={{ height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing(2) }} />
              
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Button label="Unstake / Retirer" variant="outline" onPress={() => toast.success('Ouverture de la dApp BENQI...')} />
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* OPPORTUNITES */}
      <Text style={[typography.title, { marginBottom: spacing(2) }]}>
`;

code = code.replace("{/* OPPORTUNITES */}", renderPositions);

fs.writeFileSync('app/earn.tsx', code);
