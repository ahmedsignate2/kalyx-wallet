const fs = require('fs');

let content = fs.readFileSync('ui/TokenPicker.tsx', 'utf8');

// Replace formSheet with transparent fade or slide covering the bottom or just a clean transparent modal
content = content.replace(
  '<Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>',
  '<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>'
);

content = content.replace(
  '<KeyboardAvoidingView behavior={Platform.OS === \'ios\' ? \'padding\' : undefined} style={{ flex: 1, backgroundColor: colors.bgDeep }}>',
  `<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ height: '85%', backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' }}>`
);

content = content.replace(
  '      </KeyboardAvoidingView>\n    </Modal>',
  '      </KeyboardAvoidingView>\n      </View>\n    </Modal>'
);

// Add StyleSheet import if needed
if (!content.includes('StyleSheet')) {
  content = content.replace('Platform, ActivityIndicator } from \'react-native\';', 'Platform, ActivityIndicator, StyleSheet } from \'react-native\';');
}

fs.writeFileSync('ui/TokenPicker.tsx', content);
