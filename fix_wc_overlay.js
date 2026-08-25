const fs = require('fs');
let content = fs.readFileSync('ui/WalletConnectHost.tsx', 'utf8');

content = content.replace(
  'function Overlay({ children }: { children: React.ReactNode }) {',
  'function Overlay({ children, onCancel }: { children: React.ReactNode, onCancel?: () => void }) {'
);

content = content.replace(
  '<Modal transparent animationType="fade">',
  '<Modal transparent animationType="fade" onRequestClose={onCancel}>'
);

content = content.replace(
  '<View style={{ flex: 1, backgroundColor: \'rgba(0,0,0,0.6)\', justifyContent: \'flex-end\' }}>',
  `<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />`
);

// We must also import StyleSheet
if (!content.includes('StyleSheet')) {
  content = content.replace('Pressable, ScrollView, Image', 'Pressable, ScrollView, Image, StyleSheet');
}

// Inject onCancel into instances of Overlay
content = content.replace(
  '<Overlay>',
  '<Overlay onCancel={reject}>'
);
// There are multiple `<Overlay>` ? Let's check:
