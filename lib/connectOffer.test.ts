import { answerConnectOffer, offerConnect, useConnectOffer } from './connectOffer';

describe('Proposition de connexion', () => {
  it('accepter lance la connexion, ignorer appelle seulement « ignorer », et la feuille se ferme', () => {
    const calls: string[] = [];
    offerConnect({ kind: 'walletconnect', site: '1inch.com', onConnect: () => calls.push('connect'), onIgnore: () => calls.push('ignore') });
    expect(useConnectOffer.getState().offer?.site).toBe('1inch.com');
    answerConnectOffer(true);
    expect(calls).toEqual(['connect']);
    expect(useConnectOffer.getState().offer).toBeNull();
    offerConnect({ kind: 'tonconnect', onConnect: () => calls.push('connect2') });
    answerConnectOffer(false);
    expect(calls).toEqual(['connect']);
    answerConnectOffer(true); // plus rien d'ouvert : rien ne part
    expect(calls).toEqual(['connect']);
  });
});
