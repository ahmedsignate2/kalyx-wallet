const fs = require('fs');
const content = fs.readFileSync('lib/i18n.ts', 'utf8');

const frMatch = content.match(/fr:\s*\{([\s\S]*?)\},\s*[a-z]{2}:/);
if (frMatch) {
  console.log(frMatch[1].trim());
} else {
  console.log('Not found');
}
