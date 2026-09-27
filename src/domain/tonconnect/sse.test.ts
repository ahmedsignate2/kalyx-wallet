import { SseParser, parseBridgeMessage } from './sse';

const MSG = `{"from":"${'ab'.repeat(32)}","message":"AAAA"}`;

describe('SSE', () => {
  it('assemble des événements coupés n’importe où, heartbeat compris', () => {
    const raw = `event: heartbeat\ndata: heartbeat\n\nid: 1714000000000001\nevent: message\ndata: ${MSG}\n\n`;
    const p = new SseParser();
    const got = [...raw].flatMap((c) => p.feed(c));
    expect(got).toEqual([
      { event: 'heartbeat', data: 'heartbeat' },
      { id: '1714000000000001', event: 'message', data: MSG },
    ]);
    expect(p.lastEventId).toBe('1714000000000001');
  });

  it('fins de ligne CRLF, commentaires, data multi-lignes', () => {
    const p = new SseParser();
    expect(p.feed(': ping\r\ndata: a\r\ndata: b\r\n\r\n')).toEqual([{ data: 'a\nb' }]);
  });

  it('message du pont : expéditeur hex, heartbeat ignoré, déchet refusé', () => {
    expect(parseBridgeMessage(MSG)).toEqual({ from: 'ab'.repeat(32), message: 'AAAA' });
    expect(parseBridgeMessage('heartbeat')).toBeNull();
    expect(parseBridgeMessage('{"from":"zz","message":"x"}')).toBeNull();
    expect(parseBridgeMessage('pas du json')).toBeNull();
  });
});

describe('flux réel du pont TonAPI (relevé le 27/09)', () => {
  it('heartbeat sans data ignoré, message lu avec son id', () => {
    const raw = 'event: heartbeat\n\nevent: message\nid: 1789473958403624\ndata: {"from":"ef7e12b8f89de9e695c13e4abe55c20d789e4092726870a98cbc6ee0f541205f","message":"SGVsbG8="}\n\nevent: heartbeat\n\n';
    const p = new SseParser();
    const ev = p.feed(raw);
    expect(ev).toHaveLength(1);
    expect(parseBridgeMessage(ev[0].data)).toEqual({ from: 'ef7e12b8f89de9e695c13e4abe55c20d789e4092726870a98cbc6ee0f541205f', message: 'SGVsbG8=' });
    expect(p.lastEventId).toBe('1789473958403624');
  });
});
