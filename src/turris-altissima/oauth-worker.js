import { googleConfig } from './src/google-config.js';

const appPath = '/turris-altissima/';
const authPath = appPath + 'auth/';
const callbackUrl = googleConfig.origin + authPath + 'callback';
const sessionCookie = '__Host-turris-session';
const loginCookie = '__Host-turris-oauth';
const sessionLifetime = 90 * 24 * 60 * 60;
const loginLifetime = 10 * 60;
const tokenBufferMs = 60_000;
const sessionPattern = /^[\w-]{43}$/;

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomValue(size) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(request, name) {
  const pairs = (request.headers.get('Cookie') || '').split(/;\s*/);
  return pairs.find(pair => pair.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}

function headersWithCookies(cookies = []) {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return headers;
}

function json(body, status = 200, cookies) {
  return Response.json(body, { status, headers: headersWithCookies(cookies) });
}

function redirect(location, cookies) {
  const headers = headersWithCookies(cookies);
  headers.set('Location', location);
  return new Response(null, { status: 303, headers });
}

function pagePath(page) {
  return appPath + (['new', 'prompt', 'settings'].includes(page) ? page + '/' : '');
}

async function exchange(params, env, send) {
  const response = await send('https://oauth2.googleapis.com/token', {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      ...params, client_id: googleConfig.clientId, client_secret: env.BIBLIOGRAPHY_GOOGLE_CLIENT_SECRET,
    }),
  });
  return { ok: response.ok, body: await response.json() };
}

function lifetime(value) {
  const seconds = Math.floor(Number(value));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function accessToken(body) {
  if (typeof body?.access_token !== 'string' || !body.access_token || !lifetime(body.expires_in)) return null;
  return { token: body.access_token, expiresAt: Date.now() + lifetime(body.expires_in) * 1_000 };
}

async function beginLogin(url) {
  const state = randomValue(32);
  const verifier = randomValue(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const page = url.searchParams.get('page');
  const returnPage = ['new', 'prompt', 'settings'].includes(page) ? page : 'library';
  const pending = [state, verifier, returnPage, Date.now() + loginLifetime * 1_000].join('.');
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({
    client_id: googleConfig.clientId, redirect_uri: callbackUrl, response_type: 'code',
    scope: googleConfig.scope, access_type: 'offline', prompt: 'consent select_account',
    state, code_challenge: base64Url(new Uint8Array(digest)), code_challenge_method: 'S256',
  });
  return redirect(google.href, [cookie(loginCookie, pending, loginLifetime)]);
}

function sessionObject(env, id) {
  return env.DRIVE_SESSIONS.get(env.DRIVE_SESSIONS.idFromName(id));
}

async function finishLogin(request, url, env, send) {
  const [state, verifier, page, expiry] = readCookie(request, loginCookie).split('.');
  const code = url.searchParams.get('code');
  if (!sessionPattern.test(state) || state !== url.searchParams.get('state')) {
    return redirect(pagePath(page) + '?auth=failed');
  }
  const clearLogin = cookie(loginCookie, '', 0);
  const failed = () => redirect(pagePath(page) + '?auth=failed', [clearLogin]);
  if (!code || !/^[\w-]{64}$/.test(verifier) || !(Number(expiry) > Date.now())) return failed();
  try {
    const { ok, body } = await exchange({
      grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: callbackUrl,
    }, env, send);
    const access = accessToken(body);
    if (!ok || !access || typeof body.refresh_token !== 'string' || !body.refresh_token ||
        typeof body.scope !== 'string' || !body.scope.split(/\s+/).includes(googleConfig.scope)) return failed();
    const seconds = Math.min(sessionLifetime, lifetime(body.refresh_token_expires_in) || sessionLifetime);
    const id = randomValue(32);
    const session = {
      id: randomValue(24), access, refresh: body.refresh_token, expiresAt: Date.now() + seconds * 1_000,
    };
    const stored = await sessionObject(env, id).fetch('https://session.internal/start', {
      method: 'POST', body: JSON.stringify(session),
    });
    if (!stored.ok) return failed();
    return redirect(pagePath(page), [clearLogin, cookie(sessionCookie, id, seconds)]);
  } catch {
    return failed();
  }
}

async function handleSession(request, action, env) {
  const id = readCookie(request, sessionCookie);
  const clearCookies = action === 'logout' ? [cookie(sessionCookie, '', 0), cookie(loginCookie, '', 0)] : [];
  if (!sessionPattern.test(id)) return json({ persistent: true, session: null }, 200, clearCookies);
  const response = await sessionObject(env, id).fetch('https://session.internal/' + action, {
    method: 'POST',
    headers: {
      'X-Bibliography-Session': request.headers.get('X-Bibliography-Session') || '',
      'X-Bibliography-Refresh': request.headers.get('X-Bibliography-Refresh') || '',
    },
  });
  const result = await response.json();
  const cookies = response.ok && !result.session ? clearCookies : [];
  return json({ persistent: true, ...result }, response.status, cookies);
}

export async function handleDriveAuth(request, env, send = fetch) {
  const url = new URL(request.url);
  if (url.origin !== googleConfig.origin) return json({ error: 'not_found' }, 404);
  const action = url.pathname.slice(authPath.length);
  if (action === 'session' || action === 'logout') {
    if (request.method !== 'POST' || request.headers.get('Origin') !== googleConfig.origin) {
      return json({ error: 'invalid_request' }, 403);
    }
  } else if (!['login', 'callback'].includes(action) || request.method !== 'GET') {
    return json({ error: 'not_found' }, 404);
  }
  if (!env.BIBLIOGRAPHY_GOOGLE_CLIENT_SECRET) {
    if (action === 'session') return json({ persistent: false, session: null });
    return json({ error: 'persistence_unavailable' }, 503);
  }
  if (action === 'login') return beginLogin(url);
  if (action === 'callback') return finishLogin(request, url, env, send);
  try {
    return await handleSession(request, action, env);
  } catch {
    return json({ error: 'session_unavailable' }, 503);
  }
}

export class DriveSession {
  constructor(ctx, env, send = fetch) {
    this.ctx = ctx;
    this.env = env;
    this.send = send;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const { storage } = this.ctx;
    if (path === '/start') {
      const session = await request.json();
      await storage.setAlarm(session.expiresAt);
      await storage.put('session', session);
      return json({});
    }
    const session = await storage.get('session');
    if (!session) return json({ session: null });
    const expected = request.headers.get('X-Bibliography-Session');
    if ((expected || path === '/logout') && expected !== session.id) return json({ changed: true }, 409);
    if (path === '/logout') {
      await this.alarm();
      const { send } = this;
      this.ctx.waitUntil(send('https://oauth2.googleapis.com/revoke', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({ token: session.refresh }),
      }).catch(() => {}));
      return json({ session: null });
    }
    if (session.expiresAt <= Date.now()) {
      await this.alarm();
      return json({ session: null });
    }
    const force = request.headers.get('X-Bibliography-Refresh') === '1';
    if (!force && session.access.expiresAt > Date.now() + tokenBufferMs) {
      return json({ session: { id: session.id, ...session.access } });
    }
    this.renewal ??= this.refresh(session).finally(() => { this.renewal = undefined; });
    const { body, status } = await this.renewal;
    return json(body, status);
  }

  async refresh(session) {
    let result;
    try {
      result = await exchange({ grant_type: 'refresh_token', refresh_token: session.refresh }, this.env, this.send);
    } catch {
      return { body: { error: 'refresh_unavailable' }, status: 503 };
    }
    const { storage } = this.ctx;
    return storage.transaction(async transaction => {
      const current = await transaction.get('session');
      if (current?.id !== session.id || current.expiresAt <= Date.now()) return { body: { session: null } };
      if (!result.ok && result.body?.error === 'invalid_grant') {
        await transaction.delete('session');
        return { body: { session: null } };
      }
      const access = accessToken(result.body);
      if (!result.ok || !access) return { body: { error: 'refresh_unavailable' }, status: 503 };
      const refresh = typeof result.body.refresh_token === 'string' && result.body.refresh_token
        ? result.body.refresh_token : session.refresh;
      await transaction.put('session', { ...session, access, refresh });
      return { body: { session: { id: session.id, ...access } } };
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith(authPath)) return handleDriveAuth(request, env);
    return env.ASSETS.fetch(request);
  },
};
