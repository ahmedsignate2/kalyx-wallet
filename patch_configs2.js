const fs = require('fs');

let content = fs.readFileSync('src/domain/chains/configs.ts', 'utf8');

const patches = [
    { url: "explorerUrl: 'https://zkevm.polygonscan.com'", api: "explorerApi: 'https://zkevm.blockscout.com/api'" },
    { url: "explorerUrl: 'https://explorer.mode.network'", api: "explorerApi: 'https://explorer.mode.network/api'" },
    { url: "explorerUrl: 'https://opbnbscan.com'", api: "explorerApi: 'https://opbnb.blockscout.com/api'" },
    { url: "explorerUrl: 'https://explorer.zora.energy'", api: "explorerApi: 'https://explorer.zora.energy/api'" },
    { url: "explorerUrl: 'https://scrollscan.com'", api: "explorerApi: 'https://blockscout.scroll.io/api'" },
    { url: "explorerUrl: 'https://pacific-explorer.manta.network'", api: "explorerApi: 'https://pacific-explorer.manta.network/api'" },
    { url: "explorerUrl: 'https://explorer.kava.io'", api: "explorerApi: 'https://explorer.kava.io/api'" },
    { url: "explorerUrl: 'https://explorer.aurora.dev'", api: "explorerApi: 'https://explorer.aurora.dev/api'" },
    { url: "explorerUrl: 'https://cronoscan.com'", api: "explorerApi: 'https://explorer.cronos.org/api'" },
];

for (const patch of patches) {
    content = content.replace(patch.url + ',', patch.url + ', ' + patch.api + ',');
}

fs.writeFileSync('src/domain/chains/configs.ts', content);
