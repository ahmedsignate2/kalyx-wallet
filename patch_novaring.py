import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

button_search = """        <View style={{ marginTop: spacing(2) }}>
          {!quote ? (
            <Button label={loading ? t('findingRoute') : t('getQuote')} onPress={onQuote} loading={loading} disabled={loading || !amount || Number(amount) <= 0 || !fromTok || !toTok} />
          ) : (
            <Button label={t('swapAction')} onPress={() => setConfirming(true)} variant="primary" />
          )}
        </View>"""
button_replace = """        <View style={{ marginTop: spacing(2) }}>
          {!quote ? (
            loading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing(2) }}>
                <NovaRing size={40} />
                <Text style={{ marginTop: spacing(1), color: colors.textMuted, fontFamily: fonts.medium }}>{t('findingRoute')}</Text>
              </View>
            ) : (
              <Button label={t('getQuote')} onPress={onQuote} disabled={!amount || Number(amount) <= 0 || !fromTok || !toTok} />
            )
          ) : (
            <Button label={t('swapAction')} onPress={() => setConfirming(true)} variant="primary" />
          )}
        </View>"""
content = content.replace(button_search, button_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
