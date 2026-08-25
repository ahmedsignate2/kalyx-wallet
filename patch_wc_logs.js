const fs = require('fs');

let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Enhance session_request listener
wcContent = wcContent.replace(
  "w.on('session_request', (request: any) => {",
  `w.on('session_request', (request: any) => {
      console.log('\\n[WC-IN] === SESSION_REQUEST RECEIVED ===');
      console.log('[WC-IN] ID:', request?.id);
      console.log('[WC-IN] Topic:', request?.topic);
      console.log('[WC-IN] Method:', request?.params?.request?.method);
      console.log('[WC-IN] Params:', JSON.stringify(request?.params?.request?.params, null, 2));
      console.log('[WC-IN] ==================================\\n');`
);

// Enhance approveRequest
const oldRawLog = `    // DEBUG: Affiche la requête brute reçue par le wallet
    console.log('--- RAW_WC_REQUEST ---');
    console.log(JSON.stringify({ method, p }, null, 2));
    console.log('----------------------');`;

const newRawLog = `    console.log('\\n[WC-PROCESSING] === START PROCESSING ===');
    console.log('[WC-PROCESSING] Method:', method);
    console.log('[WC-PROCESSING] Params:', JSON.stringify(p, null, 2));`;

wcContent = wcContent.replace(oldRawLog, newRawLog);

const oldSuccessLog = `      // DEBUG: Affiche le résultat brut renvoyé par le wallet
      console.log('--- WC_RESULT ---');
      console.log(JSON.stringify(result, null, 2));
      console.log('-----------------');`;

const newSuccessLog = `      console.log('\\n[WC-SUCCESS] === RESPONDING WITH SUCCESS ===');
      console.log('[WC-SUCCESS] Method:', method);
      console.log('[WC-SUCCESS] Result payload:', JSON.stringify(result, null, 2));
      console.log('[WC-SUCCESS] =====================================\\n');`;

wcContent = wcContent.replace(oldSuccessLog, newSuccessLog);

const oldErrorLog = `    } catch (e) {
      if (wallet && sdkUtils) {
        await wallet.respondSessionRequest({
          topic,
          response: { id, jsonrpc: '2.0', error: { code: 5000, message: e instanceof Error ? e.message : 'Unknown error' } },
        });
      }`;

const newErrorLog = `    } catch (e) {
      console.error('\\n[WC-ERROR] === RESPONDING WITH ERROR ===');
      console.error('[WC-ERROR] Method:', method);
      console.error('[WC-ERROR] Error object:', e);
      console.error('[WC-ERROR] Error message:', e instanceof Error ? e.message : 'Unknown error');
      console.error('[WC-ERROR] ===============================\\n');
      if (wallet && sdkUtils) {
        await wallet.respondSessionRequest({
          topic,
          response: { id, jsonrpc: '2.0', error: { code: 5000, message: e instanceof Error ? e.message : 'Unknown error' } },
        });
      }`;

wcContent = wcContent.replace(oldErrorLog, newErrorLog);

const oldRejectLog = `  rejectRequest: async () => {
    const { wallet, requestQueue } = get();
    const request = requestQueue[0];
    if (wallet && request && sdkUtils) {
      await wallet.respondSessionRequest({
        topic: request.topic,
        response: { id: request.id, jsonrpc: '2.0', error: sdkUtils.getSdkError('USER_REJECTED') },
      });
    }`;

const newRejectLog = `  rejectRequest: async () => {
    const { wallet, requestQueue } = get();
    const request = requestQueue[0];
    if (wallet && request && sdkUtils) {
      console.log('\\n[WC-REJECT] === USER REJECTED REQUEST ===');
      console.log('[WC-REJECT] ID:', request.id);
      console.log('[WC-REJECT] Method:', request?.params?.request?.method);
      console.log('[WC-REJECT] =================================\\n');
      await wallet.respondSessionRequest({
        topic: request.topic,
        response: { id: request.id, jsonrpc: '2.0', error: sdkUtils.getSdkError('USER_REJECTED') },
      });
    }`;

wcContent = wcContent.replace(oldRejectLog, newRejectLog);

fs.writeFileSync('lib/walletconnect.ts', wcContent);
