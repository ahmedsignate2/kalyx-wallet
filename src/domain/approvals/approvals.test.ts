import {
  APPROVAL_TOPIC,
  addressTopic,
  addressFromTopic,
  spendersFromLogs,
  isUnlimited,
  revokeCalldata,
} from './approvals';

const OWNER = '0x1111111111111111111111111111111111111111';
const SPENDER_A = '0x00000000000000000000000000000000000000aa';
const SPENDER_B = '0x00000000000000000000000000000000000000bb';

describe('approvals (helpers purs)', () => {
  it('APPROVAL_TOPIC est le keccak de la signature', () => {
    // Valeur de référence connue de l'événement Approval(address,address,uint256).
    expect(APPROVAL_TOPIC).toBe('0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925');
  });

  it('addressTopic / addressFromTopic sont inverses', () => {
    const topic = addressTopic(OWNER);
    expect(topic).toHaveLength(66); // 0x + 64
    expect(addressFromTopic(topic).toLowerCase()).toBe(OWNER.toLowerCase());
  });

  it('spendersFromLogs déduplique et garde le plus récent en premier', () => {
    const pad = (a: string) => addressTopic(a);
    const logs = [
      { topics: [APPROVAL_TOPIC, pad(OWNER), pad(SPENDER_A)] },
      { topics: [APPROVAL_TOPIC, pad(OWNER), pad(SPENDER_B)] },
      { topics: [APPROVAL_TOPIC, pad(OWNER), pad(SPENDER_A)] }, // ré-approbation récente
    ];
    const spenders = spendersFromLogs(logs);
    expect(spenders).toHaveLength(2);
    expect(spenders[0].toLowerCase()).toBe(SPENDER_A.toLowerCase()); // le plus récent
  });

  it('ignore les logs mal formés', () => {
    expect(spendersFromLogs([{ topics: [] }, { topics: [APPROVAL_TOPIC] }])).toEqual([]);
  });

  it('isUnlimited : max uint256 oui, montant fini non', () => {
    expect(isUnlimited((1n << 256n) - 1n)).toBe(true);
    expect(isUnlimited(1n << 255n)).toBe(true);
    expect(isUnlimited(1000000n * 10n ** 18n)).toBe(false);
    expect(isUnlimited(0n)).toBe(false);
  });

  it('revokeCalldata encode approve(spender, 0)', () => {
    const data = revokeCalldata(SPENDER_A);
    // sélecteur approve(address,uint256) = 0x095ea7b3
    expect(data.startsWith('0x095ea7b3')).toBe(true);
    // le montant (dernier mot de 32 octets) doit être 0
    expect(data.slice(-64)).toBe('0'.repeat(64));
  });
});
