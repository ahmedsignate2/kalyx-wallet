const fs = require('fs');
const path = require('path');

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
  
  // Regex to match PremiumScreen open tag followed by Stack.Screen
  // using [\s\S]*? to match the options safely
  const premiumRegex = /(<PremiumScreen[^>]*>)\s*(<Stack\.Screen\s+options=\{\{[\s\S]*?\}\}\s*\/>)/g;
  
  if (premiumRegex.test(content)) {
    content = content.replace(premiumRegex, '<>\n      $2\n      $1');
    content = content.replace(/<\/PremiumScreen>/g, '</PremiumScreen>\n    </>');
    fs.writeFileSync(filePath, content);
    console.log('Fixed', filePath);
  }
});
