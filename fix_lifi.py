with open('src/domain/swap/lifi.ts', 'r') as f:
    content = f.read()

import_jupiter = "import { getJupiterQuote } from './jupiter';\n"
if "getJupiterQuote" not in content:
    content = content.replace(
        "export async function getSwapQuote(params: QuoteParams): Promise<SwapQuote | null> {",
        import_jupiter + "\nexport async function getSwapQuote(params: QuoteParams): Promise<SwapQuote | null> {\n  // Same-chain Solana -> Jupiter\n  if (params.fromChainId === 1151111081099710 && params.toChainId === 1151111081099710) {\n    return getJupiterQuote(params);\n  }"
    )

with open('src/domain/swap/lifi.ts', 'w') as f:
    f.write(content)
