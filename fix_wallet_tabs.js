const fs = require('fs');
let code = fs.readFileSync('app/wallet.tsx', 'utf8');

const regexEmptyState = /return \(\s*<GlassCard>[\s\S]*?<\/GlassCard>\s*\);/m;
const replacementEmptyState = `return (
            <GlassCard>
              <View style={{ alignItems: 'center', paddingVertical: spacing(3), gap: spacing(1) }}>
                <Icon name={isStaking ? 'staking' : 'defi'} size={34} color={colors.textMuted} />
                <Text style={typography.bodyStrong}>{isStaking ? 'Aucune position de staking' : 'Aucune position DeFi'}</Text>
                
                {(() => {
                  const isSolana = activeChain === 'solana';
                  const isAvax = activeChain === 'avalanche';
                  const isBnb = activeChain === 'bnb';
                  
                  const stakingDesc = isSolana ? "Mets ton SOL au travail via Jito ou Marinade." : isAvax ? "Mets ton AVAX au travail via BENQI." : isBnb ? "Génère du rendement avec le staking BNB." : "Mets ton ETH au travail via un protocole de staking liquide (stETH, rETH…).";
                  const defiDesc = "Prête, emprunte ou fournis de la liquidité sur les protocoles DeFi.";
                  
                  const stakingCtaText = isSolana ? "Ouvrir Jito ↗" : isAvax ? "Ouvrir BENQI ↗" : isBnb ? "Staking BNB ↗" : "Ouvrir Lido ↗";
                  const stakingCtaUrl = isSolana ? "https://jito.network/staking" : isAvax ? "https://staking.benqi.fi" : isBnb ? "https://www.bnbchain.org/en/staking" : "https://stake.lido.fi";
                  
                  const defiCtaText = isSolana ? "Ouvrir Raydium ↗" : isAvax ? "Ouvrir BENQI ↗" : isBnb ? "Ouvrir PancakeSwap ↗" : "Ouvrir Aave ↗";
                  const defiCtaUrl = isSolana ? "https://raydium.io" : isAvax ? "https://app.benqi.fi" : isBnb ? "https://pancakeswap.finance" : "https://app.aave.com";

                  return (
                    <>
                      <Text style={[typography.muted, { textAlign: 'center' }]}>
                        {isStaking ? stakingDesc : defiDesc}
                      </Text>
                      <Pressable
                        onPress={() => router.push({ pathname: '/browser', params: { url: isStaking ? stakingCtaUrl : defiCtaUrl } })}
                        style={{ marginTop: spacing(0.5), backgroundColor: colors.accent, borderRadius: 999, paddingVertical: spacing(1.25), paddingHorizontal: spacing(2.5) }}
                      >
                        <Text style={{ color: '#fff', fontFamily: fonts.semibold }}>
                          {isStaking ? stakingCtaText : defiCtaText}
                        </Text>
                      </Pressable>
                    </>
                  );
                })()}
              </View>
            </GlassCard>
          );`;

code = code.replace(regexEmptyState, replacementEmptyState);


const regexListRow = /onPress=\{\(\) => router\.push\(\{ pathname: '\/browser', params: \{ url: isStaking \? 'https:\/\/stake\.lido\.fi' : 'https:\/\/app\.aave\.com' \} \}\)\}/g;
const replacementListRow = `onPress={() => {
                        const pName = (p.defi?.protocol || p.name).toLowerCase();
                        let url = isStaking ? 'https://stake.lido.fi' : 'https://app.aave.com'; // fallback
                        
                        if (pName.includes('jito')) url = 'https://jito.network/staking';
                        else if (pName.includes('benqi')) url = isStaking ? 'https://staking.benqi.fi' : 'https://app.benqi.fi';
                        else if (pName.includes('lido')) url = 'https://stake.lido.fi';
                        else if (pName.includes('binance') || pName.includes('bnb')) url = 'https://www.bnbchain.org/en/staking';
                        else if (pName.includes('rocket')) url = 'https://stake.rocketpool.net';
                        else if (pName.includes('aave')) url = 'https://app.aave.com';
                        else if (pName.includes('raydium')) url = 'https://raydium.io';
                        else if (pName.includes('pancake')) url = 'https://pancakeswap.finance';
                        
                        router.push({ pathname: '/browser', params: { url } });
                      }}`;

code = code.replace(regexListRow, replacementListRow);

fs.writeFileSync('app/wallet.tsx', code);
