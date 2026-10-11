import {
  BACKUP_FILE_NAME,
  buildMultipartBody,
  contentMd5,
  decideOverwrite,
  downloadBackup,
  DriveError,
  DriveVerifyError,
  envelopeCount,
  findBackup,
  isTransientError,
  pickLatestBackup,
  PENDING_SAVE_TTL_MS,
  readPendingSave,
  saveBackupGuarded,
  uploadBackup,
  type RemoteBackup,
} from './drive';

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

  it('uploadBackup crée en multipart puis met à jour en PATCH, en demandant id + md5', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: { id: 'new', md5Checksum: 'abc' } }));
    expect((await uploadBackup('tok', '{"x":1}', null, fn, { count: '2', rev: '3', deviceId: 'd' })).id).toBe('new');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].url).toContain('fields=id,md5Checksum');
    expect(String(calls[0].init?.body)).toContain('"parents":["appDataFolder"]');
    expect(String(calls[0].init?.body)).toContain('"appProperties":{"count":"2","rev":"3","deviceId":"d"}');
    expect((await uploadBackup('tok', '{"x":2}', 'new', fn)).id).toBe('new');
    expect(calls[1].init?.method).toBe('PATCH');
    expect(calls[1].url).toContain('/files/new?uploadType=multipart');
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

  it('à plusieurs fichiers, la plus grande rev l’emporte sur la date', () => {
    const f = (id: string, modifiedTime: string, rev?: string) => ({ id, name: BACKUP_FILE_NAME, modifiedTime, ...(rev ? { appProperties: { rev } } : {}) });
    expect(pickLatestBackup([f('a', '2026-09-20T00:00:00Z', '4'), f('b', '2026-09-21T00:00:00Z', '3')])?.id).toBe('a');
    expect(pickLatestBackup([f('a', '2026-09-20T00:00:00Z'), f('b', '2026-09-01T00:00:00Z', '1')])?.id).toBe('b');
    // Même rev : repli sur la date.
    expect(pickLatestBackup([f('a', '2026-09-01T00:00:00Z', '2'), f('b', '2026-09-02T00:00:00Z', '2')])?.id).toBe('b');
    // rev non numérique : traitée comme absente.
    expect(pickLatestBackup([f('a', '2026-09-03T00:00:00Z', 'x'), f('b', '2026-09-02T00:00:00Z', '1')])?.id).toBe('b');
  });

  it('lit le nombre de portefeuilles en clair de l’enveloppe', () => {
    expect(envelopeCount('{"count":3}')).toBe(3);
    expect(envelopeCount('{"app":"kalyx"}')).toBeUndefined();
    expect(envelopeCount('pas du json')).toBeUndefined();
  });

  it('md5 local conforme à celui de Drive (vecteur RFC 1321)', () => {
    expect(contentMd5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('distingue erreur réseau (on garde le blob) et erreur définitive', () => {
    expect(isTransientError(new TypeError('Network request failed'))).toBe(true);
    expect(isTransientError(new DriveError('x', 503))).toBe(true);
    expect(isTransientError(new DriveError('x', 429))).toBe(true);
    expect(isTransientError(new DriveError('x', 403))).toBe(false);
    expect(isTransientError(new DriveVerifyError())).toBe(false);
    expect(isTransientError(new Error('autre'))).toBe(false);
  });
});

describe('décision d’écrasement', () => {
  const remote = (p: Partial<RemoteBackup> = {}): RemoteBackup => ({ id: 'f1', modifiedTime: '2026-10-01T10:00:00Z', rev: 3, deviceId: 'A', count: 3, ...p });

  it('rien en ligne : on écrit', () => {
    expect(decideOverwrite({ remote: null, localCount: 1, deviceId: 'B' }).ok).toBe(true);
  });

  it('téléphone B à 1 portefeuille face à la sauvegarde à 3 de A : conflit', () => {
    const d = decideOverwrite({ remote: remote(), localCount: 1, deviceId: 'B' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.conflict).toMatchObject({ remoteCount: 3, localCount: 1, sameDevice: false, accept: { id: 'f1' } });
  });

  it('autre appareil, même à nombre égal ou inférieur : conflit', () => {
    expect(decideOverwrite({ remote: remote({ count: 2 }), localCount: 5, deviceId: 'B' }).ok).toBe(false);
  });

  it('même appareil : on écrit, sauf s’il y a plus de portefeuilles en ligne', () => {
    expect(decideOverwrite({ remote: remote(), localCount: 3, deviceId: 'A' }).ok).toBe(true);
    const d = decideOverwrite({ remote: remote(), localCount: 2, deviceId: 'A' });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.conflict.sameDevice).toBe(true);
  });

  it('version déjà restaurée ici : pas de conflit (si pas plus riche)', () => {
    expect(decideOverwrite({ remote: remote(), localCount: 3, deviceId: 'B', known: { id: 'f1', rev: 3 } }).ok).toBe(true);
    expect(decideOverwrite({ remote: remote(), localCount: 3, deviceId: 'B', known: { id: 'f1', rev: 2 } }).ok).toBe(false);
  });

  it('l’acceptation ne vaut que pour la version vue', () => {
    const accept = { id: 'f1', modifiedTime: '2026-10-01T10:00:00Z' };
    expect(decideOverwrite({ remote: remote(), localCount: 1, deviceId: 'B', accept }).ok).toBe(true);
    // Un autre appareil a réécrit entre-temps : on redemande.
    expect(decideOverwrite({ remote: remote({ modifiedTime: '2026-10-02T00:00:00Z' }), localCount: 1, deviceId: 'B', accept }).ok).toBe(false);
  });

  it('ancien fichier sans appProperties : écrit s’il n’est pas plus riche, conflit sinon ou si illisible', () => {
    expect(decideOverwrite({ remote: remote({ deviceId: undefined, rev: -1, count: 2 }), localCount: 2, deviceId: 'B' }).ok).toBe(true);
    expect(decideOverwrite({ remote: remote({ deviceId: undefined, rev: -1, count: 4 }), localCount: 2, deviceId: 'B' }).ok).toBe(false);
    expect(decideOverwrite({ remote: remote({ deviceId: undefined, rev: -1, count: undefined }), localCount: 2, deviceId: 'B' }).ok).toBe(false);
  });
});

describe('envoi gardé et vérifié', () => {
  const blob = JSON.stringify({ app: 'kalyx', count: 1 });
  const existing = { id: 'old', name: BACKUP_FILE_NAME, modifiedTime: '2026-10-01T10:00:00Z', appProperties: { count: '3', rev: '5', deviceId: 'A' } };

  it('conflit : rien n’est écrit', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: { files: [existing] } }));
    const r = await saveBackupGuarded('tok', { content: blob, deviceId: 'B' }, fn);
    expect(r.kind).toBe('conflict');
    expect(calls.every((c) => !c.init?.method || c.init.method === 'GET')).toBe(true);
  });

  it('accepté : crée rev+1, vérifie le md5, puis supprime l’ancien et les doublons', async () => {
    const dup = { ...existing, id: 'dup', appProperties: { rev: '2' } };
    const { fn, calls } = mockFetch((url, init) => {
      if (init?.method === 'POST') return { status: 200, body: { id: 'new', md5Checksum: contentMd5(blob) } };
      if (init?.method === 'DELETE') return { status: 204, body: '' };
      return { status: 200, body: { files: [existing, dup] } };
    });
    const r = await saveBackupGuarded('tok', { content: blob, deviceId: 'B', accept: { id: 'old', modifiedTime: existing.modifiedTime } }, fn);
    expect(r).toMatchObject({ kind: 'saved', id: 'new', rev: 6 });
    expect(String(calls.find((c) => c.init?.method === 'POST')?.init?.body)).toContain('"rev":"6"');
    expect(calls.filter((c) => c.init?.method === 'DELETE').map((c) => c.url.split('/').pop())).toEqual(['old', 'dup']);
  });

  it('md5 différent : erreur, le fichier fautif est supprimé et l’ancien gardé', async () => {
    const { fn, calls } = mockFetch((url, init) => {
      if (init?.method === 'POST') return { status: 200, body: { id: 'new', md5Checksum: 'deadbeef' } };
      if (init?.method === 'DELETE') return { status: 204, body: '' };
      return { status: 200, body: { files: [] } };
    });
    await expect(saveBackupGuarded('tok', { content: blob, deviceId: 'B' }, fn)).rejects.toBeInstanceOf(DriveVerifyError);
    expect(calls.filter((c) => c.init?.method === 'DELETE').map((c) => c.url.split('/').pop())).toEqual(['new']);
  });

  it('sans md5 rendu : relit le fichier et compare à l’octet près', async () => {
    const { fn } = mockFetch((url, init) => {
      if (init?.method === 'POST') return { status: 200, body: { id: 'new' } };
      if (url.includes('alt=media')) return { status: 200, body: blob };
      return { status: 200, body: { files: [] } };
    });
    expect((await saveBackupGuarded('tok', { content: blob, deviceId: 'B' }, fn)).kind).toBe('saved');
  });

  it('ancien fichier sans appProperties : le nombre est lu dans son enveloppe', async () => {
    const legacy = { id: 'leg', name: BACKUP_FILE_NAME, modifiedTime: '2026-01-01T00:00:00Z' };
    const { fn } = mockFetch((url) => {
      if (url.includes('alt=media')) return { status: 200, body: JSON.stringify({ count: 4 }) };
      return { status: 200, body: { files: [legacy] } };
    });
    const r = await saveBackupGuarded('tok', { content: blob, deviceId: 'B' }, fn);
    expect(r.kind === 'conflict' && r.conflict.remoteCount).toBe(4);
  });
});

describe('blob en attente', () => {
  const now = 1_000_000_000;
  it('expire après 15 min et rejette l’illisible', () => {
    const rec = JSON.stringify({ blob: 'x', createdAt: now });
    expect(readPendingSave(rec, now + PENDING_SAVE_TTL_MS - 1)?.blob).toBe('x');
    expect(readPendingSave(rec, now + PENDING_SAVE_TTL_MS + 1)).toBeNull();
    expect(PENDING_SAVE_TTL_MS).toBe(15 * 60_000);
    expect(readPendingSave(null, now)).toBeNull();
    expect(readPendingSave('{', now)).toBeNull();
    expect(readPendingSave(JSON.stringify({ createdAt: now }), now)).toBeNull();
  });
});
