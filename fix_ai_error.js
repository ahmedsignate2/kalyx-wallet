const fs = require('fs');

let code = fs.readFileSync('components/ai/AiChatModal.tsx', 'utf8');

const regexImport = /import { buildAiRequestParams } from '\.\.\/\.\.\/lib\/aiConfig';/g;
if (regexImport.test(code)) {
    code = code.replace(regexImport, "import { buildAiRequestParams, mapAiErrorToMessage } from '../../lib/aiConfig';");
} else {
    // try standard import
    code = code.replace(/import { buildAiRequestParams } from '..\/..\/lib\/aiConfig';/g, "import { buildAiRequestParams, mapAiErrorToMessage } from '../../lib/aiConfig';");
    code = code.replace(/import { buildAiRequestParams, /g, "import { buildAiRequestParams, mapAiErrorToMessage, ");
}

const regexFetch = /const res = await fetch\(url, \{ method: 'POST', headers, body: JSON\.stringify\(body\) \}\);\s*const data = await res\.json\(\);\s*let rawReply = provider === 'anthropic' \? data\.content\?\.\[0\]\?\.text : data\.choices\?\.\[0\]\?\.message\?\.content;\s*rawReply = rawReply \|\| 'Erreur de réponse';/m;

const replacementFetch = `const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      
      let rawReply = '';
      if (!res.ok) {
         const providerMsg = data?.error?.message || data?.message || '';
         const customMsg = typeof mapAiErrorToMessage === 'function' ? mapAiErrorToMessage(res.status) : 'Erreur IA';
         rawReply = \`\${customMsg}\\n\\n*(Provider: \${providerMsg || res.statusText || 'Erreur interne'})*\`;
      } else {
         rawReply = provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
         rawReply = rawReply || 'Erreur de réponse du modèle IA.';
      }`;

code = code.replace(regexFetch, replacementFetch);

fs.writeFileSync('components/ai/AiChatModal.tsx', code);
