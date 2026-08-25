const buffer = Buffer.from([31, ...new Array(64).fill(1)]);
console.log(buffer.length);
