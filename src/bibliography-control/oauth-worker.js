import { googleConfig } from './src/google-config.js';

const authPath = '/bibliography-control/auth/';
const callbackUrl = googleConfig.origin + authPath + 'callback';
const sessionCookie = '__Host-bibliography-session';
const stateCookie = '__Host-bibliography-oauth';
const sessionLifetime = 7 * 24 * 60 * 60;
const stateLifetime = 10 * 60;
const googleTokenUrl = 'https://oauth2.googleapis.com/token';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64(text) {
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

function randomValue(size) {
  return encodeBase64(crypto.getRandomValues(new Uint8Array(size)));
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(request, name) {
  const pair = (request.headers.get('Cookie') || '').split(/;\s*/).find(item => item.startsWith(name + '='));
  return pair?.slice(name.length + 1);
}

function responseHeaders() {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function response(body, status = 200, cookies = []) {
  const headers = responseHeaders();
  for (const value of cookies) headers.append('Set-Cookie', value);
  return Response.json(body, { status, headers });
}

function redirect(url, cookies = []) {
  const headers = responseHeaders();
  headers.set('Location', url);
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { headers, status: 303 });
}

function returnPath(page, failed = false) {
  const route = page === 'new' || page === 'prompt' ? page + '/' : '';
  return '/bibliography-control/' + route + (failed ? '?auth=failed' : '');
}

async function encryptionKey(env) {
  const secret = env.BIBLIOGRAPHY_SESSION_KEY;
  if (!env.BIBLIOGRAPHY_GOOGLE_CLIENT_SECRET || !/^[0-9a-fA-F]{64}$/.test(secret || '')) return null;
  return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), hex => parseInt(hex, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(key, binding, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(binding) }, key, encoder.encode(JSON.stringify(value)),
  ));
  return encodeBase64(new Uint8Array([...iv, ...ciphertext]));
}

async function openCookie(request, name, key) {
  const value = readCookie(request, name);
  if (!value || value.length > 4096 || !/^[\w-]+$/.test(value)) return null;
  try {
    const encrypted = decodeBase64(value);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.slice(0, 12), additionalData: encoder.encode(name) }, key, encrypted.slice(12),
    );
    const parsed = JSON.parse(decoder.decode(plain));
    return Number.isFinite(parsed.expiresAt) && parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

async function exchange(params, env, send) {
  const result = await send(googleTokenUrl, {
    method: 'POST',
    body: new URLSearchParams({ ...params, client_id: googleConfig.clientId, client_secret: env.BIBLIOGRAPHY_GOOGLE_CLIENT_SECRET }),
  });
  return { ok: result.ok, body: await result.json() };
}

function tokenLifetime(value, fallback) {
  const lifetime = Number(value);
  return Number.isFinite(lifetime) && lifetime > 0 ? Math.floor(lifetime) : fallback;
}

async function beginLogin(url, key) {
  const state = randomValue(24);
  const verifier = randomValue(48);
  const challenge = encodeBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
  const page = url.searchParams.get('page');
  const transaction = await seal(key, stateCookie, {
    state, verifier, page, expiresAt: Date.now() + stateLifetime * 1000,
  });
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: googleConfig.scope,
    access_type: 'offline',
    include_granted_scopes: 'false',
    prompt: 'consent select_account',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return redirect(google.href, [cookie(stateCookie, transaction, stateLifetime)]);
}

async function finishLogin(request, url, env, key, send) {
  const pending = await openCookie(request, stateCookie, key);
  const deleteState = cookie(stateCookie, '', 0);
  const code = url.searchParams.get('code');
  if (!pending || url.searchParams.get('state') !== pending.state || !code) {
    return redirect(returnPath(pending?.page, true), [deleteState]);
  }
  try {
    const { ok, body } = await exchange({
      grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: callbackUrl,
    }, env, send);
    if (!ok || typeof body.refresh_token !== 'string' ||
        !body.scope?.split(/\s+/).includes(googleConfig.scope)) {
      return redirect(returnPath(pending.page, true), [deleteState]);
    }
    const seconds = Math.min(sessionLifetime, tokenLifetime(body.refresh_token_expires_in, sessionLifetime));
    const encrypted = await seal(key, sessionCookie, {
      refresh: body.refresh_token, id: randomValue(24), expiresAt: Date.now() + seconds * 1000,
    });
    return redirect(returnPath(pending.page), [deleteState, cookie(sessionCookie, encrypted, seconds)]);
  } catch {
    return redirect(returnPath(pending.page, true), [deleteState]);
  }
}

async function restoreSession(request, env, key, send) {
  const saved = await openCookie(request, sessionCookie, key);
  if (!saved) {
    const cookies = readCookie(request, sessionCookie) ? [cookie(sessionCookie, '', 0)] : [];
    return response({ persistent: true, session: null, expired: cookies.length > 0 }, 200, cookies);
  }
  const expected = request.headers.get('X-Bibliography-Session');
  if (expected && expected !== saved.id) return response({ persistent: true, session: null, changed: true }, 409);
  try {
    const { ok, body } = await exchange({ grant_type: 'refresh_token', refresh_token: saved.refresh }, env, send);
    if (!ok && body.error === 'invalid_grant') {
      return response({ persistent: true, session: null, expired: true }, 200, [cookie(sessionCookie, '', 0)]);
    }
    if (!ok || typeof body.access_token !== 'string' || !tokenLifetime(body.expires_in, 0)) {
      return response({ persistent: true, session: null }, 503);
    }
    const cookies = [];
    if (typeof body.refresh_token === 'string' && body.refresh_token !== saved.refresh) {
      const remaining = Math.floor((saved.expiresAt - Date.now()) / 1000);
      const encrypted = await seal(key, sessionCookie, { ...saved, refresh: body.refresh_token });
      cookies.push(cookie(sessionCookie, encrypted, Math.max(0, remaining)));
    }
    return response({ persistent: true, session: {
      id: saved.id, token: body.access_token, expiresAt: Date.now() + tokenLifetime(body.expires_in, 0) * 1000,
    } }, 200, cookies);
  } catch {
    return response({ persistent: true, session: null }, 503);
  }
}

async function forgetSession(request, key, send) {
  const saved = await openCookie(request, sessionCookie, key);
  const expected = request.headers.get('X-Bibliography-Session');
  if (saved && expected !== saved.id) return response({ persistent: true, session: null, changed: true }, 409);
  if (saved) {
    try {
      await send('https://oauth2.googleapis.com/revoke', {
        method: 'POST', body: new URLSearchParams({ token: saved.refresh }),
      });
    } catch {
      // 通信の成否にかかわらず、このブラウザの接続は解除する。
    }
  }
  return response({ persistent: true, session: null }, 200, [cookie(sessionCookie, '', 0)]);
}

export async function handleBibliographyAuth(request, env, send = fetch) {
  const url = new URL(request.url);
  if (url.origin !== googleConfig.origin) {
    return response({ persistent: false, session: null });
  }
  const action = url.pathname.slice(authPath.length);
  if (action === 'session' || action === 'logout') {
    if (request.method !== 'POST' || request.headers.get('Origin') !== googleConfig.origin) {
      return response({ error: 'invalid_request' }, 403);
    }
  } else if (!['status', 'login', 'callback'].includes(action) || request.method !== 'GET') {
    return response({ error: 'not_found' }, 404);
  }
  const key = await encryptionKey(env);
  if (action === 'status') return response({ persistent: Boolean(key) });
  if (!key) {
    if (action === 'session') return response({ persistent: false, session: null });
    return response({ error: 'persistence_unavailable' }, 503);
  }
  if (action === 'login') return beginLogin(url, key);
  if (action === 'callback') return finishLogin(request, url, env, key, send);
  if (action === 'session') return restoreSession(request, env, key, send);
  return forgetSession(request, key, send);
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith(authPath)) return handleBibliographyAuth(request, env);
    return env.ASSETS.fetch(request);
  },
};
