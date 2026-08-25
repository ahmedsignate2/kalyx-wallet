import re

with open('lib/tokenStore.ts', 'r') as f:
    content = f.read()

content = content.replace("logo?: string;\n}", "logo?: string;\n  priceUSD?: string;\n}")

# In fetchTokens:
content = content.replace(
    "logo: t.logoURI",
    "logo: t.logoURI,\n          priceUSD: t.priceUSD"
)

with open('lib/tokenStore.ts', 'w') as f:
    f.write(content)

# In app/swap.tsx, display the fiat value
with open('app/swap.tsx', 'r') as f:
    swap = f.read()

input_search = """          <TextInput
            style={{ color: colors.text, fontSize: 32, fontFamily: fonts.extrabold, paddingVertical: spacing(0.5) }}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textMuted}
          />"""
input_replace = """          <TextInput
            style={{ color: colors.text, fontSize: 32, fontFamily: fonts.extrabold, paddingVertical: spacing(0.5) }}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.0"
            placeholderTextColor={colors.textMuted}
          />
          {fromTok.priceUSD && amount ? (
             <Text style={{ color: colors.textFaint, fontSize: 13, fontFamily: fonts.medium }}>
               ≈ ${(parseFloat(amount) * parseFloat(fromTok.priceUSD)).toFixed(2)}
             </Text>
          ) : null}"""
swap = swap.replace(input_search, input_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(swap)
