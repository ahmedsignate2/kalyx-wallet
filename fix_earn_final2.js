const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

// 1. Fix targetProtocol?.name to targetProtocol?.project in title and subtitle
code = code.replace(/\{targetProtocol\?\.name\}/g, "{targetProtocol?.project}");
code = code.replace(/\{opp\.name\}/g, "{opp.project}");

// 2. Add KeyboardAvoidingView
// First, import KeyboardAvoidingView and Platform if not imported
if (!code.includes('KeyboardAvoidingView')) {
  code = code.replace("import { View, Text, ScrollView, TextInput, Modal, Pressable } from 'react-native';", "import { View, Text, ScrollView, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';");
}
const regexModal = /<Modal visible=\{inputModalVisible\} transparent animationType="slide" onRequestClose=\{\(\) => setInputModalVisible\(false\)\}>\s*<View style=\{\{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba\\(0,0,0,0.6\\)' \}\}>/m;
const replacementModal = `<Modal visible={inputModalVisible} transparent animationType="slide" onRequestClose={() => setInputModalVisible(false)}>
         <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>`;
code = code.replace(regexModal, replacementModal);
// Close KeyboardAvoidingView instead of View
const regexModalClose = /<\/View>\s*<\/View>\s*<\/Modal>/m;
const replacementModalClose = `</View>\n         </KeyboardAvoidingView>\n      </Modal>`;
code = code.replace(regexModalClose, replacementModalClose);

// 3. Add simulateTransaction logs
const regexSolana = /hash = await \(solAdapter as any\)\.rpc\('sendTransaction', \[signedTxStr, \{ encoding: 'base64' \}\]\);/m;
const replacementSolana = `// --- SIMULATION LOGS FOR DEBUGGING ---
        const sim = await (solAdapter as any).rpc('simulateTransaction', [signedTxStr, { encoding: 'base64' }]);
        if (sim?.value?.err) {
            console.error('[Solana Sim Error]', sim.value.err);
            console.error('[Solana Sim Logs]', JSON.stringify(sim.value.logs, null, 2));
            throw new Error(\`Solana Simulation Failed: \${JSON.stringify(sim.value.err)}\`);
        }
        // -------------------------------------
        hash = await (solAdapter as any).rpc('sendTransaction', [signedTxStr, { encoding: 'base64' }]);`;
code = code.replace(regexSolana, replacementSolana);

fs.writeFileSync('app/earn.tsx', code);
