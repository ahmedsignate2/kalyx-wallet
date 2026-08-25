import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

# Add native token fetch
chain_icon_search = """                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: logoFor(toChain, toTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  {isBridge && (
                    <Image source={{ uri: logoFor(toChain, { address: NATIVE_TOKEN, decimals: 18, symbol: '' }) }} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.bgDeep }} />
                  )}
                </View>"""
chain_icon_replace = """
                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: logoFor(toChain, toTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  {isBridge && (
                    <Image source={{ uri: (tokensByChain[toChain]?.find(t => t.address === NATIVE_TOKEN || t.address === '11111111111111111111111111111111')?.logo) || 'https://via.placeholder.com/18' }} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.bgDeep }} />
                  )}
                </View>
"""
content = content.replace(chain_icon_search, chain_icon_replace)

# Also fix the `fromChain` icon
from_chain_icon_search = """              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                <Image source={{ uri: logoFor(activeChain, fromTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{fromTok.symbol}</Text>
              </View>"""
from_chain_icon_replace = """              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: logoFor(activeChain, fromTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  <Image source={{ uri: (tokensByChain[activeChain]?.find(t => t.address === NATIVE_TOKEN || t.address === '11111111111111111111111111111111')?.logo) || 'https://via.placeholder.com/18' }} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.bgDeep }} />
                </View>
                <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>{fromTok.symbol}</Text>
              </View>"""
content = content.replace(from_chain_icon_search, from_chain_icon_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
