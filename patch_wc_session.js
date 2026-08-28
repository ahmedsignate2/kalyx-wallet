const fs = require('fs');

let code = fs.readFileSync('lib/walletconnect.ts', 'utf8');

const replacement = `w.on('session_request', async (request: any) => {
      console.log('\\n[WC-IN] === SESSION_REQUEST RECEIVED ===');
      console.log('[WC-IN] ID:', request?.id);
      console.log('[WC-IN] Topic:', request?.topic);
      console.log('[WC-IN] Method:', request?.params?.request?.method);
      console.log('[WC-IN] Params:', JSON.stringify(request?.params?.request?.params, null, 2));
      console.log('[WC-IN] ==================================\\n');

      const sessions = w.getActiveSessions();
      if (!request?.topic || !sessions || !sessions[request.topic]) {
        console.error('[WC-IN] Topic introuvable ou expiré:', request?.topic);
        try {
          await w.respondSessionRequest({
            topic: request.topic,
            response: {
              id: request.id,
              jsonrpc: '2.0',
              error: { code: 5100, message: 'Invalid session / Session expirée' }
            }
          });
        } catch (e) {
          console.error('[WC-IN] Impossible de renvoyer l\\'erreur (session morte):', e);
        }
        return; // Bloque la demande pour ne pas déranger l'utilisateur
      }`;

code = code.replace(/w\.on\('session_request',\s*\(request:\s*any\)\s*=>\s*\{[\s\S]*?console\.log\('\[WC-IN\] ==================================\\n'\);/, replacement);

fs.writeFileSync('lib/walletconnect.ts', code);
