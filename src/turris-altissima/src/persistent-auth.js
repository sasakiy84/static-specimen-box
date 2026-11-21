import { appRoot } from './routes.js';
import { DriveError } from './drive.js';

export function loginUrl(page) {
  const url = new URL('auth/login', appRoot);
  url.searchParams.set('page', page);
  return url;
}

function authRequest(action, id, force) {
  const headers = new Headers();
  if (id) headers.set('X-Bibliography-Session', id);
  if (force) headers.set('X-Bibliography-Refresh', '1');
  return fetch(new URL('auth/' + action, appRoot), { method: 'POST', headers, cache: 'no-store' });
}

export async function readServerSession(id, force) {
  const response = await authRequest('session', id, force);
  if (import.meta.env.DEV && response.status === 404) return { persistent: false };
  if (response.status === 409) return { persistent: true };
  if (!response.ok) throw new Error('Google Drive の接続を確認できませんでした。しばらくしてからお試しください。');
  const { persistent, session } = await response.json();
  if (persistent === false) return { persistent: false };
  if (typeof session?.id !== 'string' || typeof session.token !== 'string' || !Number.isFinite(session.expiresAt)) {
    return { persistent: true };
  }
  return { persistent: true, session };
}

export function renewableSession(initial) {
  const session = { ...initial };
  let pending;
  session.renew = (force = false) => {
    pending ??= readServerSession(initial.id, force).then(({ session: next }) => {
      if (!next || next.id !== initial.id) {
        throw new DriveError(401, 'Google Drive の接続が終了しました。再接続してください。');
      }
      session.token = next.token;
      session.expiresAt = next.expiresAt;
    }).finally(() => { pending = undefined; });
    return pending;
  };
  return session;
}

export async function forgetServerSession(id) {
  const response = await authRequest('logout', id);
  if (!response.ok && response.status !== 409) throw new Error('Google Drive の接続を解除できませんでした。');
}
