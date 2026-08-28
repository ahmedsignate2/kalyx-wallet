const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');
code = code.replace(
  /<Modal visible=\{inputModalVisible\} transparent animationType="slide" onRequestClose=\{\(\) => setInputModalVisible\(false\)\}>\s*<View style=\{\{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba\(0,0,0,0\.6\)' \}\}>/m,
  `<Modal visible={inputModalVisible} transparent animationType="slide" onRequestClose={() => setInputModalVisible(false)}>
         <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>`
);
fs.writeFileSync('app/earn.tsx', code);
