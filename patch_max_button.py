import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

max_button_search = """          {balance && balance.raw > 0n ? (
            <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: 4 }}>
              <Pressable onPress={() => { onMax(); reset(); }} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.glass, borderRadius: radii.sm }}>
                <Text style={{ color: colors.accent, fontSize: 11, fontFamily: fonts.bold }}>MAX</Text>
              </Pressable>
              <Pressable onPress={() => { onHalf(); reset(); }} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.glass, borderRadius: radii.sm }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.bold }}>50%</Text>
              </Pressable>
            </View>
          ) : null}"""
max_button_replace = """          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: 4 }}>
            <Pressable onPress={() => { onMax(); reset(); }} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.glass, borderRadius: radii.sm }}>
              <Text style={{ color: colors.accent, fontSize: 11, fontFamily: fonts.bold }}>MAX</Text>
            </Pressable>
            <Pressable onPress={() => { onHalf(); reset(); }} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.glass, borderRadius: radii.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.bold }}>50%</Text>
            </Pressable>
          </View>"""
content = content.replace(max_button_search, max_button_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
