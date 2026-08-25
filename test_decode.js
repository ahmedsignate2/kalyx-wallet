const { base58, base64 } = require('@scure/base');
const str = "X3CUgCGzyn43DTAbUKnTMDzcGWMooJT2hPSZinjfN1QUgVNYYfeoJ5zg6i4Ne59cXZCWLCvgQik";
try {
  base64.decode(str);
} catch (e) {
  console.log(e.message);
}
