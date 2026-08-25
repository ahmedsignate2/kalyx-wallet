const fetch = require('node-fetch');
async function run() {
    const qs = new URLSearchParams({
        fromChain: "1", // ETH
        toChain: "1151111081099710", // SOL
        fromToken: "0x0000000000000000000000000000000000000000",
        toToken: "11111111111111111111111111111111",
        fromAmount: "10000000000000000", // 0.01 ETH
        fromAddress: "0x323b5d4c32345ced77393b3530b1eed0f346429d",
        toAddress: "9Xd8RtngB7mu5342Hc9kN7PYAdH4uwRP7sN8MK6C2ECc",
    });
    
    console.log("Fetching: https://li.quest/v1/quote?" + qs.toString());
    const res = await fetch("https://li.quest/v1/quote?" + qs.toString());
    console.log("Status:", res.status);
    const json = await res.json();
    if (res.status !== 200) {
        console.log("Error:", JSON.stringify(json, null, 2));
    } else {
        console.log("Success! Transaction to:", json.transactionRequest?.to);
    }
}
run();
