const fetch = require('node-fetch');
async function run() {
    const qs = new URLSearchParams({
        fromChain: "SOL",
        toChain: "137", // Polygon
        fromToken: "11111111111111111111111111111111", // native SOL? wait, LI.FI uses native SOL as 11111111111111111111111111111111?
        toToken: "0x0000000000000000000000000000000000000000",
        fromAmount: "10000000",
        fromAddress: "9Xd8RtngB7mu5342Hc9kN7PYAdH4uwRP7sN8MK6C2ECc",
        toAddress: "0x323b5d4c32345ced77393b3530b1eed0f346429d",
    });
    
    // Solana native token in LI.FI is "11111111111111111111111111111111".
    
    console.log("Fetching: https://li.quest/v1/quote?" + qs.toString());
    const res = await fetch("https://li.quest/v1/quote?" + qs.toString());
    console.log("Status:", res.status);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
}
run();
