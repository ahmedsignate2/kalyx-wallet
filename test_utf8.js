const { utf8ToBytes } = require('@noble/hashes/utils');
try {
  utf8ToBytes(undefined);
} catch (e) {
  console.log(e.message);
}
