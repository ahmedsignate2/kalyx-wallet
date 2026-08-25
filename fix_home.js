const fs = require('fs');
let content = fs.readFileSync('app/home.tsx', 'utf8');

// Remove both Stack.Screens
content = content.replace(/<Stack\.Screen options=\{\{ headerShown: false \}\} \/>/g, '');

// Prepend to the first PremiumScreen
content = content.replace('  if (!account) {', "  return (\n    <>\n      <Stack.Screen options={{ headerShown: false }} />\n      {(() => {\n  if (!account) {");
content = content.replace(/    <\/PremiumScreen>\n  \);\n\}/, "    </PremiumScreen>\n  );\n      })()}\n    </>\n  );\n}");

fs.writeFileSync('app/home.tsx', content);
