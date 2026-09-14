import { BACKUP_FILE_NAME, buildMultipartBody, downloadBackup, findBackup, pickLatestBackup, uploadBackup, DriveError } from './drive';

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = handler(url, init);
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return { ok: r.status < 400, status: r.status, json: async () => JSON.parse(text), text: async () => text } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

describe('drive', () => {
  it('garde la sauvegarde la plus récente portant le bon nom', () => {
    expect(pickLatestBackup(undefined)).toBeNull();
    expect(
      pickLatestBackup([
        { id: 'a', name: BACKUP_FILE_NAME, modifiedTime: '2026-09-01T00:00:00Z' },
        { id: 'b', name: 'autre.enc', modifiedTime: '2026-09-20T00:00:00Z' },
        { id: 'c', name: BACKUP_FILE_NAME, modifiedTime: '2026-09-14T00:00:00Z' },
      ])?.id,
    ).toBe('c');
  });

  it('findBackup interroge appDataFolder avec le jeton', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: { files: [{ id: 'f1', name: BACKUP_FILE_NAME, modifiedTime: '2026-09-14T10:00:00Z' }] } }));
    const found = await findBackup('tok', fn);
    expect(found?.id).toBe('f1');
    expect(calls[0].url).toContain('spaces=appDataFolder');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('downloadBackup renvoie le texte chiffré', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: '{"app":"kalyx"}' }));
    expect(await downloadBackup('tok', 'f1', fn)).toBe('{"app":"kalyx"}');
    expect(calls[0].url).toContain('/files/f1?alt=media');
  });

  it('uploadBackup crée en multipart puis met à jour en PATCH', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: { id: 'new' } }));
    expect(await uploadBackup('tok', '{"x":1}', null, fn)).toBe('new');
    expect(calls[0].init?.method).toBe('POST');
    expect(String(calls[0].init?.body)).toContain('"parents":["appDataFolder"]');
    expect(await uploadBackup('tok', '{"x":2}', 'new', fn)).toBe('new');
    expect(calls[1].init?.method).toBe('PATCH');
    expect(calls[1].url).toContain('/files/new?uploadType=media');
  });

  it('le corps multipart contient métadonnées et contenu', () => {
    const body = buildMultipartBody('{"a":1}', 'B');
    expect(body.startsWith('--B\r\n')).toBe(true);
    expect(body).toContain(`"name":"${BACKUP_FILE_NAME}"`);
    expect(body.endsWith('--B--')).toBe(true);
  });

  it('un 401 devient une erreur d’accès claire', async () => {
    const { fn } = mockFetch(() => ({ status: 401, body: {} }));
    await expect(findBackup('bad', fn)).rejects.toBeInstanceOf(DriveError);
  });
});
