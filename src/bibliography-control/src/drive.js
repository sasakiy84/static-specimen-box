const API = 'https://www.googleapis.com';
const FIELDS = 'id,name,mimeType,parents,trashed,modifiedTime,version,size,webViewLink,capabilities(canEdit,canAddChildren)';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function validateFileId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Drive ファイル ID が不正です。');
  return id;
}

export function folderIdFromLink(value) {
  const text = value.trim();
  if (/^[a-zA-Z0-9_-]+$/.test(text)) return text;

  const message = 'Google Drive のフォルダのリンクまたはフォルダ ID を入力してください。';
  let url;
  try { url = new URL(text); }
  catch { throw new Error(message); }
  if (url.origin === 'https://drive.google.com' && !url.username && !url.password) {
    const folderPath = /^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);
    const id = folderPath?.[1] ?? (['/open', '/folderview'].includes(url.pathname) ? url.searchParams.get('id') : null);
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  }
  throw new Error(message);
}

export async function getAccessToken(session) {
  if (session.renew && Date.now() + 30_000 >= session.expiresAt) await session.renew();
  if (Date.now() >= session.expiresAt) throw new DriveError(401, 'Google Drive の接続期限が切れました。再接続してください。');
  return session.token;
}

export function createDrive(session, request = fetch) {
  async function send(url, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${await getAccessToken(session)}`);
    const response = await request(url, { ...options, headers, credentials: 'omit' });
    if (response.ok) return response;
    const message = {
      401: 'Google Drive の接続期限が切れました。再接続してください。',
      403: 'Google Drive が操作を拒否しました。フォルダやファイルの操作権限を確認してください。',
      404: 'Drive ファイルが見つかりません。移動された可能性があります。',
      429: 'Google Drive の利用上限に達しました。時間をおいてお試しください。',
    }[response.status] ?? `Google Drive の操作に失敗しました（${response.status}）。`;
    throw new DriveError(response.status, message);
  }

  function fileUrl(id, params) {
    return `${API}/drive/v3/files/${validateFileId(id)}?${new URLSearchParams({ supportsAllDrives: 'true', ...params })}`;
  }

  async function who() {
    const response = await send(`${API}/drive/v3/about?fields=user(permissionId,displayName)`);
    const { user } = await response.json();
    if (!user || typeof user.permissionId !== 'string' || !user.permissionId) throw new Error('Google アカウントを確認できませんでした。');
    return user;
  }

  async function get(id) {
    return (await send(fileUrl(id, { fields: FIELDS }))).json();
  }

  async function list(parentId) {
    const files = [];
    const usedTokens = new Set();
    let pageToken;
    do {
      const params = new URLSearchParams({
        q: `'${validateFileId(parentId)}' in parents and trashed = false`,
        fields: `nextPageToken,incompleteSearch,files(${FIELDS})`,
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await send(`${API}/drive/v3/files?${params}`);
      const page = await response.json();
      if (page.incompleteSearch || !Array.isArray(page.files)) throw new Error('Drive ファイルの一覧をすべて取得できませんでした。');
      files.push(...page.files);
      pageToken = page.nextPageToken;
      if (pageToken && usedTokens.has(pageToken)) throw new Error('Drive ファイルの一覧を続けて取得できませんでした。');
      usedTokens.add(pageToken);
    } while (pageToken);
    return files;
  }

  async function read(id) {
    return (await send(fileUrl(id, { alt: 'media' }))).text();
  }

  async function update(id, content, mimeType) {
    const response = await send(`${API}/upload/drive/v3/files/${validateFileId(id)}?uploadType=media&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: content,
    });
    return response.json();
  }

  async function create(parentId, name, content, mimeType) {
    const metadata = { name, parents: [validateFileId(parentId)], mimeType };
    const params = `supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`;
    const blob = new Blob([content], { type: mimeType });
    if (blob.size > 5_000_000) {
      const response = await send(`${API}/upload/drive/v3/files?uploadType=resumable&${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(blob.size) },
        body: JSON.stringify(metadata),
      });
      const location = response.headers.get('Location');
      if (!location || new URL(location).origin !== API) throw new Error('Drive からアップロード先を取得できませんでした。');
      return (await send(location, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob })).json();
    }
    const boundary = `drive-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--\r\n`,
    ]);
    return (await send(`${API}/upload/drive/v3/files?uploadType=multipart&${params}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })).json();
  }

  return { who, get, list, read, update, create };
}
