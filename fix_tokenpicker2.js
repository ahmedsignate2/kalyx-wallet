const fs = require('fs');
let content = fs.readFileSync('ui/TokenPicker.tsx', 'utf8');

if (!content.includes('StyleSheet,')) {
  content = content.replace('ActivityIndicator } from', 'ActivityIndicator, StyleSheet } from');
}

fs.writeFileSync('ui/TokenPicker.tsx', content);
