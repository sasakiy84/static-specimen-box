import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDrive, folderIdFromLink } from '../src/drive.js';

const session = { token: 'test-token', expiresAt: Date.now() + 3600_000 };

test('lists every page within the requested folder using the session token', async () => {
  const drive = createDrive(session, async (address, options) => {
    const { searchParams } = new URL(address);
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token');
    assert.equal(searchParams.get('q'), "'folder-1' in parents and trashed = false");
    return Response.json(searchParams.has('pageToken')
      ? { files: [{ id: 'file-2' }] }
      : { files: [{ id: 'file-1' }], nextPageToken: 'next-page' });
  });
  assert.deepEqual(await drive.list('folder-1'), [{ id: 'file-1' }, { id: 'file-2' }]);
});

test('creates a small upload with the correct name, metadata, and media body', async () => {
  const drive = createDrive(session, async (address, options) => {
    const url = new URL(address);
    assert.equal(url.pathname, '/upload/drive/v3/files');
    assert.equal(url.searchParams.get('uploadType'), 'multipart');
    assert.equal(options.method, 'POST');
    const boundary = options.headers.get('Content-Type').split('boundary=')[1];
    const content = await options.body.text();
    assert.match(content, /"name":"MA0001_原文\.pdf","parents":\["folder-1"\]/);
    assert(content.startsWith('--' + boundary + '\r\n'));
    assert(content.includes('\r\nContent-Type: application/pdf\r\n\r\n%PDF-demo'));
    return Response.json({ id: 'file-1' });
  });
  assert.deepEqual(await drive.create('folder-1', 'MA0001_原文.pdf', '%PDF-demo', 'application/pdf'), { id: 'file-1' });
});

test('rejects an upload session URL outside the Drive API origin', async () => {
  let requests = 0;
  const drive = createDrive(session, async () => {
    requests++;
    return new Response(null, { headers: { Location: 'https://example.org/upload' } });
  });
  await assert.rejects(drive.create('folder-1', 'MA0001_原文.pdf', new Blob(['x'.repeat(5_000_001)]), 'application/pdf'), /アップロード先/);
  assert.equal(requests, 1);
});

test('uploads a large file to the resumable session issued by the Drive API', async () => {
  let requests = 0;
  const drive = createDrive(session, async (address, options) => {
    requests++;
    const url = new URL(address);
    if (requests === 1) {
      assert.equal(options.method, 'POST');
      assert.equal(url.searchParams.get('uploadType'), 'resumable');
      assert.equal(options.headers.get('X-Upload-Content-Length'), '5000001');
      return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=mock' } });
    }
    assert.equal(url.searchParams.get('upload_id'), 'mock');
    assert.equal(options.method, 'PUT');
    assert.equal(options.body.size, 5_000_001);
    return Response.json({ id: 'file-1' });
  });
  assert.deepEqual(await drive.create('folder-1', 'MA0001_原文.pdf', new Blob(['x'.repeat(5_000_001)]), 'application/pdf'), { id: 'file-1' });
  assert.equal(requests, 2);
});

test('accepts Drive folder links from multiple accounts and plain folder IDs', () => {
  assert.equal(folderIdFromLink(' https://drive.google.com/drive/u/1/folders/a-B_2?usp=sharing '), 'a-B_2');
  assert.equal(folderIdFromLink('https://drive.google.com/drive/folders/a-B_2/'), 'a-B_2');
  assert.equal(folderIdFromLink('https://drive.google.com/open?id=a-B_2'), 'a-B_2');
  assert.equal(folderIdFromLink(' a-B_2 '), 'a-B_2');
});

test('rejects outside hosts, non-folder links and IDs with path separators', () => {
  for (const input of ['https://drive.google.com.example.org/drive/folders/valid',
    'https://drive.google.com/file/d/valid/view', 'https://drive.google.com/open?id=bad%2Fid', '']) {
    assert.throws(() => folderIdFromLink(input), /フォルダ ID/);
  }
});
