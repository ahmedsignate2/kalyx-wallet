import { Address, beginCell } from '@ton/core';
import { blindSafe, describeTonPayload, OP_JETTON_TRANSFER, OP_NFT_TRANSFER } from './payload';

const A = Address.parse('UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw');

describe('Données TON Connect lues localement', () => {
  it('commentaire, transfert de jetons, NFT, appel inconnu', () => {
    expect(describeTonPayload(beginCell().storeUint(0, 32).storeStringTail('merci').endCell())).toEqual({ kind: 'comment', text: 'merci' });
    const jet = beginCell().storeUint(OP_JETTON_TRANSFER, 32).storeUint(1, 64).storeCoins(123_000_000n).storeAddress(A).storeAddress(A).storeBit(0).storeCoins(1n).storeBit(0).endCell();
    expect(describeTonPayload(jet)).toMatchObject({ kind: 'jetton', amount: 123_000_000n });
    const nft = beginCell().storeUint(OP_NFT_TRANSFER, 32).storeUint(1, 64).storeAddress(A).storeAddress(A).storeBit(0).storeCoins(1n).storeBit(0).endCell();
    expect(describeTonPayload(nft)).toMatchObject({ kind: 'nft' });
    expect(describeTonPayload(beginCell().storeUint(0xdeadbeef, 32).endCell())).toEqual({ kind: 'call', op: 0xdeadbeef });
    expect(describeTonPayload(undefined)).toEqual({ kind: 'none' });
  });
  it('sans émulation : seuls les envois simples (et commentaires) sont signables', () => {
    const comment = beginCell().storeUint(0, 32).storeStringTail('x').endCell();
    const jet = beginCell().storeUint(OP_JETTON_TRANSFER, 32).storeUint(1, 64).storeCoins(1n).storeAddress(A).storeAddress(A).storeBit(0).storeCoins(1n).storeBit(0).endCell();
    expect(blindSafe([{}, { payload: comment }])).toBe(true);
    expect(blindSafe([{}, { payload: jet }])).toBe(false);
    expect(blindSafe([{ init: {} }])).toBe(false);
  });
});
