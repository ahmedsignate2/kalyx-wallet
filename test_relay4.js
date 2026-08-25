const fetch = require('node-fetch');
async function run() {
    const body = {
      user: "0x323b5d4c32345ced77393b3530b1eed0f346429d",
      originChainId: 1,
      destinationChainId: 792703809,
      originCurrency: "0x0000000000000000000000000000000000000000",
      destinationCurrency: "0x0000000000000000000000000000000000000000", // WRONG SOLANA TOKEN
      amount: "10000000000000000",
      recipient: "9Xd8RtngB7mu5342Hc9kN7PYAdH4uwRP7sN8MK6C2ECc",
      tradeType: 'EXACT_INPUT',
      referrer: 'nova'
    };

    const res = await fetch("https://api.relay.link/quote", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    console.log("Status:", res.status);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
}
run();
