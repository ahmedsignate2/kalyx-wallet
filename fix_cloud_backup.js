const fs = require('fs');
let content = fs.readFileSync('app/cloud-backup.tsx', 'utf8');

// Remove both Stack.Screens and add one at the top.
content = content.replace(/<Stack\.Screen options=\{\{ headerShown: true, title: t\('encBackup'\) \}\} \/>/g, '');
content = content.replace('  if (isPk) {', "  return (\n    <>\n      <Stack.Screen options={{ headerShown: true, title: t('encBackup') }} />\n      {(() => {\n  if (isPk) {");
content = content.replace(/    <\/KeyboardAvoidingView>\n  \);\n\}/, "    </KeyboardAvoidingView>\n  );\n      })()}\n    </>\n  );\n}");

fs.writeFileSync('app/cloud-backup.tsx', content);
