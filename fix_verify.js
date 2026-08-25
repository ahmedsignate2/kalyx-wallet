const fs = require('fs');
let content = fs.readFileSync('app/verify.tsx', 'utf8');

// Remove both Stack.Screens
content = content.replace(/<Stack\.Screen options=\{\{ headerShown: true, title: t\('verifyTitle'\) \}\} \/>/g, '');

// Wrap
content = content.replace('  if (!draft) {', "  return (\n    <>\n      <Stack.Screen options={{ headerShown: true, title: t('verifyTitle') }} />\n      {(() => {\n  if (!draft) {");
content = content.replace(/    <\/PremiumScreen>\n  \);\n\}/, "    </PremiumScreen>\n  );\n      })()}\n    </>\n  );\n}");

fs.writeFileSync('app/verify.tsx', content);
