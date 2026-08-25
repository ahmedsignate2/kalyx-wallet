const fetch = require('node-fetch');
async function run() {
    const body = {
      user: "0x323b5d4c32345ced77393b3530b1eed0f346429d", // EVM sender
      originChainId: 1, // ETH
      destinationChainId: 792703809, // SOL
      originCurrency: "0x0000000000000000000000000000000000000000",
      destinationCurrency: "11111111111111111111111111111111",
      amount: "10000000000000000", // 0.01 ETH
      recipient: "9Xd8RtngB7mu5342Hc9kN7PYAdH4uwRP7sN8MK6C2ECc", // Solana recipient
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
