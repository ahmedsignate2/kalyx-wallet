const fs = require('fs');

let content = fs.readFileSync('src/domain/chains/configs.ts', 'utf8');

const patches = {
    'id: \'polygon-zkevm\'': "  explorerApi: 'https://zkevm.blockscout.com/api',\n",
    'id: \'mode\'': "  explorerApi: 'https://explorer.mode.network/api',\n",
    'id: \'opbnb\'': "  explorerApi: 'https://opbnb.blockscout.com/api',\n",
    'id: \'zora\'': "  explorerApi: 'https://explorer.zora.energy/api',\n",
    'id: \'scroll\'': "  explorerApi: 'https://blockscout.scroll.io/api',\n",
    'id: \'manta\'': "  explorerApi: 'https://pacific-explorer.manta.network/api',\n",
    'id: \'kava\'': "  explorerApi: 'https://explorer.kava.io/api',\n",
    'id: \'aurora\'': "  explorerApi: 'https://explorer.aurora.dev/api',\n",
    'id: \'cronos\'': "  explorerApi: 'https://explorer.cronos.org/api',\n",
};

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    for (const [key, apiLine] of Object.entries(patches)) {
        if (lines[i].includes(key) && !lines[i+1].includes('explorerApi')) {
            // Insert right after the id line (or at the end of the block, but right after id is fine, wait, no, id is on the same line as other properties for some of them, e.g. `id: 'mode', name: 'Mode', ...`)
            // Wait, in configs.ts some chains are formatted differently.
        }
    }
}
