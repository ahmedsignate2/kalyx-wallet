/**
 * Données d'appel pour un transfert ERC-20 : transfer(to, amount).
 * Pur et testable — l'envoi réel passe par EvmChainAdapter.sendContractTx.
 */
import { Interface, getAddress } from 'ethers';

const ERC20 = new Interface(['function transfer(address to, uint256 amount) returns (bool)']);

export function erc20TransferData(to: string, amount: bigint): string {
  return ERC20.encodeFunctionData('transfer', [getAddress(to), amount]);
}
