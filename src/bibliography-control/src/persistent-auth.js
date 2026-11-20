import { appRoot } from './routes.js';
import { DriveError } from './drive.js';

export function loginUrl(page) {
  const url = new URL('auth/login', appRoot);
  url.searchParams.set('page', page);
  return url;
}

async function authRequest(action, id) {
  const headers = id ? { 'X-Bibliography-Session': id } : {};
  return fetch(new URL('auth/' + action, appRoot), { method: 'POST', headers, cache: 'no-store' });
}

export async function readAuthStatus() {
  const response = await fetch(new URL('auth/status', appRoot), { cache: 'no-store' });
  return response.ok ? response.json() : { persistent: false };
}

export async function readServerSession(id) {
  const response = await authRequest('session', id);
  if (response.status === 404) return { persistent: false };
  const result = await response.json();
  if (result.persistent !== true) return { persistent: false };
  if (response.status === 409 || result.expired) return { persistent: true, expired: true };
  if (!response.ok) return { persistent: true, unavailable: true };
  const session = result.session;
  return typeof session?.id === 'string' && typeof session.token === 'string' && Number.isFinite(session.expiresAt)
    ? { persistent: true, session } : { persistent: true };
}

export function renewableSession(initial) {
  const session = { ...initial };
  let pending;
  session.renew = () => {
    pending ??= (async () => {
      const result = await readServerSession(initial.id);
      if (result.unavailable) throw new Error('Google Drive の接続を更新できませんでした。もう一度お試しください。');
      if (!result.session || result.session.id !== initial.id) {
        throw new DriveError(401, 'Google Drive の接続が終了しました。再接続してください。');
      }
      session.token = result.session.token;
      session.expiresAt = result.session.expiresAt;
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return session;
}

export async function forgetServerSession(id) {
  const response = await authRequest('logout', id);
  if (!response.ok && response.status !== 409) throw new Error('Google Drive の接続を解除できませんでした。');
}
