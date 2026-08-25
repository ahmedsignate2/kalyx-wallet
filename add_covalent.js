const fs = require('fs');
let content = fs.readFileSync('src/domain/chains/configs.ts', 'utf8');

const replacement = "export const EXPLORER_API_KEY: string = process.env.EXPO_PUBLIC_ETHERSCAN_KEY ?? '';\nexport const COVALENT_API_KEY: string = process.env.EXPO_PUBLIC_COVALENT_API_KEY ?? '';\n"

content = content.replace("export const EXPLORER_API_KEY: string = process.env.EXPO_PUBLIC_ETHERSCAN_KEY ?? '';\n", replacement);

fs.writeFileSync('src/domain/chains/configs.ts', content);
