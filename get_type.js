const ts = require('typescript');
const program = ts.createProgram(['lib/walletStore.ts'], {});
const checker = program.getTypeChecker();
const sf = program.getSourceFile('lib/walletStore.ts');
function findNode(node, text) {
  if (node.getText().includes(text) && node.kind === ts.SyntaxKind.PropertyAccessExpression) {
    if (node.getText() === text) return node;
  }
  return ts.forEachChild(node, c => findNode(c, text));
}
const node = findNode(sf, 'btcSigner.privateKey');
if (node) {
  const type = checker.getTypeAtLocation(node.expression);
  console.log("Type properties: ", type.getProperties().map(p => p.name));
} else { console.log("Not found"); }
