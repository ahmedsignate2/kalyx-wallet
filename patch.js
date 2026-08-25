const fs = require('fs');
let code = fs.readFileSync('app/browser.tsx', 'utf8');

// 1. Imports
code = code.replace(
  "import { fonts, radii, spacing, useTheme } from '../ui/theme';",
  "import { fonts, radii, spacing, useTheme } from '../ui/theme';\nimport { duration, easing } from '../ui/motion';\nimport { haptic } from '../lib/haptics';"
);

// 2. LoadBar
code = code.replace(
  "Animated.timing(width, { toValue: 1, duration: 120, useNativeDriver: false })",
  "Animated.timing(width, { toValue: 1, duration: duration.base, easing: easing.out, useNativeDriver: false })"
);
code = code.replace(
  "Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: false })",
  "Animated.timing(opacity, { toValue: 0, duration: duration.base, easing: easing.out, useNativeDriver: false })"
);
code = code.replace(
  "Animated.timing(width, { toValue: progress, duration: 180, useNativeDriver: false })",
  "Animated.timing(width, { toValue: progress, duration: duration.base, easing: easing.out, useNativeDriver: false })"
);

// 3. Haptics in useEffect
code = code.replace(
  "assessAddress(cid, pending.to).then(setRisk).catch(() => setRisk(null));",
  "assessAddress(cid, pending.to).then(r => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null));"
);
code = code.replace(
  "assessAddress(cid, pending.summary.verifyingContract).then(setRisk).catch(() => setRisk(null));",
  "assessAddress(cid, pending.summary.verifyingContract).then(r => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null));"
);
code = code.replace(
  "isPhishingSite(`https://${pending.origin}`).then(setPhishSite).catch(() => {});",
  "isPhishingSite(`https://${pending.origin}`).then(r => { setPhishSite(r); if (r) haptic.warning(); }).catch(() => {});"
);

// 4. SiteBadge
code = code.replace(
  "{activeTab?.url ? (\n            <Icon name={sec === 'suspicious' ? 'warning' : 'security'} size={13} color={secColor} />\n          ) : null}",
  "{activeTab?.url ? (\n            <SiteBadge sec={sec} />\n          ) : null}"
);

// 5. Tile update
code = code.replace(
  "function Tile({ host, name, color, emoji, width, onPress }: { host: string; name: string; color: string; emoji?: string; width: number; onPress: () => void }) {\n  const { colors } = useTheme();\n  return (\n    <Pressable\n      onPress={onPress}\n      onPressIn={() => Vibration.vibrate(6)}\n      style={({ pressed }) => ({ width, alignItems: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}\n    >\n      <Favicon host={host} size={56} color={color} emoji={emoji} label={name.slice(0, 1).toUpperCase()} />",
  "function Tile({ host, name, color, emoji, width, onPress }: { host: string; name: string; color: string; emoji?: string; width: number; onPress: () => void }) {\n  const { colors } = useTheme();\n  return (\n    <Pressable\n      onPress={onPress}\n      onPressIn={() => Vibration.vibrate(6)}\n      style={({ pressed }) => ({ width, alignItems: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}\n    >\n      <View style={{ padding: 4, borderRadius: Math.round(56 * 0.32) + 4, backgroundColor: colors.glass }}>\n        <Favicon host={host} size={56} color={colors.glassStrong} emoji={emoji} label={name.slice(0, 1).toUpperCase()} />\n      </View>"
);

// 6. Tab Switcher
let tabSwitcherReplacement = `
            {tabs.map((tb, i) => {
              const host = tb.url ? originOf(tb.url) : '';
              return (
                <AnimatedTab key={tb.id} index={i} tb={tb} active={tb.id === activeId} host={host} onPress={() => { setActiveId(tb.id); setSwitcher(false); }} onClose={() => closeTab(tb.id)} />
              );
            })}
            <AnimatedTab index={tabs.length} isNew onPress={newTab} />
`;

code = code.replace(
  /\{tabs\.map\(\(tb\) => \{[\s\S]*?<\/ScrollView>/m,
  tabSwitcherReplacement + "\n          </ScrollView>"
);

code += `\n\nfunction SiteBadge({ sec }: { sec: SecLevel }) {
  const { colors } = useTheme();
  
  if (sec === 'safe') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.up + '22', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
        <Icon name="security" size={12} color={colors.up} />
        <Text style={{ color: colors.up, fontSize: 11, fontWeight: '600' }}>Vérifié</Text>
      </View>
    );
  }
  if (sec === 'suspicious') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.danger + '22', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
        <Icon name="warning" size={12} color={colors.danger} />
        <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '600' }}>Risque</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.glass, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
      <Icon name="security" size={12} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Inconnu</Text>
    </View>
  );
}

function AnimatedTab({ index, active, host, tb, onPress, onClose, isNew }: any) {
  const { colors, typography } = useTheme();
  const t = useT();
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: duration.base, easing: easing.out, delay: index * 40, useNativeDriver: true }).start();
  }, [anim, index]);
  
  return (
    <Animated.View style={{ width: '47%', opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }, { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      {isNew ? (
        <Pressable onPress={onPress}>
          <GlassCard style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(3), gap: 6, borderStyle: 'dashed' }}>
            <Icon name="add" size={26} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('newTabLabel')}</Text>
          </GlassCard>
        </Pressable>
      ) : (
        <Pressable onPress={onPress}>
          <GlassCard style={{ gap: spacing(1), borderColor: active ? colors.accent : colors.glassBorder, borderWidth: active ? 1.5 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              {host ? <Favicon host={host} size={22} color={colors.glassStrong} label={host.slice(0, 1).toUpperCase()} /> : <Icon name="home" size={20} color={colors.textMuted} />}
              <Text style={[typography.bodyStrong, { flex: 1, fontSize: 13 }]} numberOfLines={1}>{tb.title || (host || t('homeWord'))}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Icon name="close" size={16} tone="muted" />
              </Pressable>
            </View>
            <Text style={typography.muted} numberOfLines={1}>{host || t('newTabLabel')}</Text>
          </GlassCard>
        </Pressable>
      )}
    </Animated.View>
  );
}
`;

fs.writeFileSync('app/browser.tsx', code);
