const fs = require('fs');
let code = fs.readFileSync('app/earn.tsx', 'utf8');

const regexSim = /\/\/ --- SIMULATION LOGS FOR DEBUGGING ---[\s\S]*?\/\/ -------------------------------------/m;
const replacementSim = `// --- SIMULATION LOGS FOR DEBUGGING ---
        const sim = await (solAdapter as any).rpc('simulateTransaction', [signedTxStr, { encoding: 'base64' }]);
        if (sim?.value?.err) {
            const logsStr = JSON.stringify(sim.value.logs || []);
            const match = logsStr.match(/insufficient lamports (\\d+), need (\\d+)/);
            if (match) {
                const has = Number(match[1]);
                const need = Number(match[2]);
                const missing = (need - has) / 1e9;
                throw new Error(\`Solde insuffisant. Il manque \${missing.toFixed(9).replace(/0+$/, '')} SOL pour créer le compte WSOL.\`);
            }
            console.error('[Solana Sim Error]', sim.value.err);
            console.error('[Solana Sim Logs]', logsStr);
            throw new Error(\`Erreur d'exécution du Smart Contract. Vérifiez la console.\`);
        }
        // -------------------------------------`;

code = code.replace(regexSim, replacementSim);

// Also update the UI gas buffer for Solana to be more realistic (0.0025) instead of 0.00001 so it disables the button earlier
code = code.replace(/const estGas = \['ETH', 'USDC'\].includes\(targetProtocol\?\.underlyingAsset\) \? 0\.002 : 0\.00001;/g, "const estGas = ['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) ? 0.002 : targetProtocol?.underlyingAsset === 'SOL' ? 0.0025 : 0.00001;");

fs.writeFileSync('app/earn.tsx', code);
