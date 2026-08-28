const { ethers } = require('ethers');

async function test() {
  const provider = new ethers.JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc');
  
  const addr1 = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0EA4aE'.toLowerCase();
  
  try {
      const code2 = await provider.getCode(addr1);
      console.log('Real sAVAX code length:', code2.length);
  } catch (e) {
      console.log(e);
  }
}
test();
