const fs = require('fs');
let content = fs.readFileSync('app/backup.tsx', 'utf8');

content = content.replace(/<Stack\.Screen options=\{\{ headerShown: true, title: t\('backupTitle'\) \}\} \/>/g, '');

content = content.replace('  if (!draft) {', "  return (\n    <>\n      <Stack.Screen options={{ headerShown: true, title: t('backupTitle') }} />\n      {(() => {\n  if (!draft) {");
content = content.replace(/    <\/PremiumScreen>\n  \);\n\}/, "    </PremiumScreen>\n  );\n      })()}\n    </>\n  );\n}");

fs.writeFileSync('app/backup.tsx', content);
