const fs = require('fs');

let content = fs.readFileSync('ui/WalletConnectHost.tsx', 'utf8');

// Add onRequestClose to allow hardware back button to dismiss (auto-reject)
// And a Pressable background to close it
content = content.replace(
  '<Modal transparent animationType="fade">',
  '<Modal transparent animationType="fade" onRequestClose={reject}>'
);

content = content.replace(
  '<View style={{ flex: 1, backgroundColor: \'rgba(0,0,0,0.6)\', justifyContent: \'flex-end\' }}>',
  `<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={reject} />`
);

// We need to pass `reject` or something. Wait, in `WalletConnectHost.tsx`, `reject` is defined INSIDE the specific rendering blocks?
// Let's check how it's rendered.
