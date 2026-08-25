const fs = require('fs');
const content = fs.readFileSync('lib/i18n.ts', 'utf8');

const langs = ['en', 'fr', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko'];
const keysCount = {};

for (const lang of langs) {
  const regex = new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\}(,\\s*[a-z]{2}:|\\n};)`);
  const match = content.match(regex);
  if (match) {
    // Count the number of keys roughly by counting the colons or keys
    const block = match[1];
    const keyMatches = block.match(/[a-zA-Z0-9_]+\s*:/g);
    keysCount[lang] = keyMatches ? keyMatches.length : 0;
  } else {
    keysCount[lang] = 'Not found';
  }
}

console.log(keysCount);
