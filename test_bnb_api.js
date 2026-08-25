const fetch = require('node-fetch');

const bnbEndpoints = [
    'https://api.bscscan.com/api',
    'https://explorer.binance.org/api',
    'https://binance.blockscout.com/api',
    'https://api.bscscan.com/v2/api',
];

async function check() {
    for (const url of bnbEndpoints) {
        try {
            const res = await fetch(`${url}?module=account&action=txlist&address=0x0000000000000000000000000000000000000000&page=1&offset=1`);
            const text = await res.text();
            console.log(url, ":", text.slice(0, 100));
        } catch (e) {
            console.log(url, ": Error", e.message);
        }
    }
}
check();
