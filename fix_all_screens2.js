const fs = require('fs');
const path = require('path');
const glob = require('glob'); // Not available? We can just use fs.readdirSync recursively.

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('app', (filePath) => {
  if (!filePath.endsWith('.tsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Find <Stack.Screen options={{ ... }} />
  const stackRegex = /^\s*<Stack\.Screen\s+options=\{[\s\S]*?\}\s*\/>\s*$/gm;
  
  const matches = [...content.matchAll(stackRegex)];
  if (matches.length === 0) return;
  
  let modified = false;
  
  // For each match, check if it is right after `<PremiumScreen>` or `<PremiumScreen ...>`
  // Or just globally remove all Stack.Screen and insert them at the top of the component? No, there are multiple returns.
  
  // Let's do a simple regex replace:
  // Find: `<PremiumScreen*>\n *<Stack.Screen ... />`
  // Replace: `<>\n<Stack.Screen ... />\n<PremiumScreen*>`
  
  // We can use a regex for the opening PremiumScreen tag and the Stack.Screen right after it.
  const premiumRegex = /(<PremiumScreen[^>]*>)\s*(<Stack\.Screen\s+options=\{[^}]+\}\s*\/>)/g;
  if (premiumRegex.test(content)) {
    content = content.replace(premiumRegex, '<>\n      $2\n      $1');
    // Also we need to close the fragment where PremiumScreen is closed.
    // Replace `</PremiumScreen>` with `</PremiumScreen>\n    </>`
    // But what if there are multiple PremiumScreen in the file?
    content = content.replace(/<\/PremiumScreen>/g, '</PremiumScreen>\n    </>');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log('Fixed', filePath);
  }
});
