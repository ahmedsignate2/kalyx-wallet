import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

chain_icon_search = """<Image source={{ uri: logoFor(toChain, toTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />"""
chain_icon_replace = """
                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: logoFor(toChain, toTok) }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  {isBridge && (
                    <Image source={{ uri: logoFor(toChain, { address: NATIVE_TOKEN, decimals: 18, symbol: '' }) }} style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.bgDeep }} />
                  )}
                </View>
"""
content = content.replace(chain_icon_search, chain_icon_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
