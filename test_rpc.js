const { ethers } = require('ethers');

async function test() {
  const provider = new ethers.JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc');
  // Check the address the user gave
  const userAddr = '0x2b2c81e08f1af8835a78bb2a9caba09866032896';
  const savaxAddr = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0EA4aE';
  
  try {
      const code1 = await provider.getCode(userAddr);
      console.log('User given address code length:', code1.length);
      const code2 = await provider.getCode(savaxAddr);
      console.log('Real sAVAX code length:', code2.length);
  } catch (e) {
      console.log(e);
  }
}
test();
