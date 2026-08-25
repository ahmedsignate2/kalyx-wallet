import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

slippage_ui = """
        {quote ? (
          <GlassCard>
"""
slippage_replacement = """
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium }}>Slippage Tolérance</Text>
          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
            {['0.001', '0.005', '0.01'].map(v => (
              <Pressable
                key={v}
                onPress={() => setSlippage(v)}
                style={{
                  backgroundColor: slippage === v ? colors.accent : colors.glass,
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
                  borderWidth: 1, borderColor: slippage === v ? colors.accent : colors.glassBorder
                }}
              >
                <Text style={{ color: slippage === v ? '#fff' : colors.text, fontSize: 12, fontFamily: fonts.semibold }}>{Number(v) * 100}%</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {quote ? (
          <GlassCard>
"""
content = content.replace(slippage_ui, slippage_replacement)

# Also update Price impact colors
impact_ui = """{impact != null ? <Row label={t("priceImpact")} value={`${impact.toFixed(2)} %`} color={impact < -1 ? colors.down : colors.textMuted} /> : null}"""
impact_replace = """{impact != null ? <Row label={t("priceImpact")} value={`${impact.toFixed(2)} %`} color={impact < -3 ? colors.danger : impact < -1 ? colors.warning : colors.up} /> : null}"""
content = content.replace(impact_ui, impact_replace)

# Visualisation Route & Relay Badge
# Replace Row label={t("route")} with visualization
route_search = """<Row label={t("route")} value={`LI.FI → ${quote.toolName}`} />"""
route_replace = """
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, alignItems: 'center' }}>
              <Text style={typography.muted}>{t("route")}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                 <Image source={{ uri: logoFor(activeChain, fromTok) }} style={{ width: 14, height: 14, borderRadius: 7 }} />
                 <Icon name="forward" size={12} color={colors.textMuted} />
                 <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 12 }}>{quote.toolName}</Text>
                 <Icon name="forward" size={12} color={colors.textMuted} />
                 <Image source={{ uri: logoFor(toChain, toTok) }} style={{ width: 14, height: 14, borderRadius: 7 }} />
              </View>
            </View>
            {quote.toolName === 'Relay' && (
              <View style={{ backgroundColor: colors.accent + '20', padding: 8, borderRadius: radii.sm, marginTop: 4, marginBottom: 8 }}>
                <Text style={{ color: colors.accent, fontSize: 11, fontFamily: fonts.medium, textAlign: 'center' }}>
                  🌉 Cross-chain EVM ↔ Solana via Relay
                </Text>
              </View>
            )}
"""
content = content.replace(route_search, route_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
