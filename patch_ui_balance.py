import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

balance_display_search = """          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[typography.muted, { fontSize: 12 }]}>{t('swapFromLabel')}</Text>
            {balance ? <Text style={[typography.muted, { fontSize: 12 }]}>{'Solde'}: {balance.display}</Text> : null}
          </View>"""
balance_display_replace = """          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[typography.muted, { fontSize: 12 }]}>{t('swapFromLabel')}</Text>
            <Text style={[typography.muted, { fontSize: 12 }]}>{'Solde'}: {formatAmount(getTokenBalance(), fromTok.decimals)}</Text>
          </View>"""
content = content.replace(balance_display_search, balance_display_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
