const fs = require('fs');

let content = fs.readFileSync('ui/ConfirmUnlock.tsx', 'utf8');

// Replace standard view with Pressable background
content = content.replace(
  '<View style={{ flex: 1, backgroundColor: \'rgba(0,0,0,0.6)\', justifyContent: \'flex-end\' }}>',
  `<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={working ? undefined : onCancel} />`
);

// We must also import StyleSheet
if (!content.includes('StyleSheet')) {
  content = content.replace('Pressable, Text, View', 'Pressable, Text, View, StyleSheet');
}

fs.writeFileSync('ui/ConfirmUnlock.tsx', content);
