const fs = require('fs');
const { ALL_CHAINS } = require('./dist/domain/chains/configs.js'); // Actually I can't require TS directly. Let's parse it using regex.
const code = fs.readFileSync('src/domain/chains/configs.ts', 'utf8');

// The easiest way is to just grep the network names.
// Or I can just write a quick script that outputs the table.
