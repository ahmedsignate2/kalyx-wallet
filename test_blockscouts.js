const fetch = require('node-fetch');

const endpoints = {
    'polygon-zkevm': 'https://zkevm.blockscout.com/api',
    'mode': 'https://explorer.mode.network/api',
    'opbnb': 'https://opbnb.blockscout.com/api',
    'zora': 'https://explorer.zora.energy/api',
    'scroll': 'https://blockscout.scroll.io/api',
    'fantom': 'https://ftmscan.com/api', // ftmscan is etherscan
    'manta': 'https://pacific-explorer.manta.network/api',
    'kava': 'https://explorer.kava.io/api',
    'aurora': 'https://explorer.aurora.dev/api',
    'cronos': 'https://explorer.cronos.org/api'
};

async function check() {
    for (const [name, url] of Object.entries(endpoints)) {
        try {
            const res = await fetch(`${url}?module=account&action=txlist&address=0x0000000000000000000000000000000000000000&page=1&offset=1`);
            const json = await res.json();
            console.log(name, ":", Array.isArray(json.result) ? "OK" : json.result);
        } catch (e) {
            console.log(name, ": Error");
        }
    }
}
check();
