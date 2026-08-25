const fs = require('fs');

let content = fs.readFileSync('ui/ConfirmUnlock.tsx', 'utf8');

if (!content.includes('StyleSheet,')) {
  content = content.replace('Pressable, Text, View', 'Pressable, Text, View, StyleSheet');
}

fs.writeFileSync('ui/ConfirmUnlock.tsx', content);
