const fs = require('fs');

let content = fs.readFileSync('ui/WalletConnectHost.tsx', 'utf8');

// The first <Overlay> is at line 240, for proposal
content = content.replace(
  '<Overlay>',
  '<Overlay onCancel={() => { setConfirming(false); rejectProposal().catch(()=>{}); }}>'
);

// The second <Overlay> is at line 293, for request
content = content.replace(
  '<Overlay>',
  '<Overlay onCancel={reject}>'
);

fs.writeFileSync('ui/WalletConnectHost.tsx', content);
