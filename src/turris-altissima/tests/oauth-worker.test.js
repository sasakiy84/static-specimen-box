import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DriveSession, handleDriveAuth } from '../oauth-worker.js';
import { googleConfig } from '../src/google-config.js';

const { origin, scope } = googleConfig;
const path = '/turris-altissima/auth/';
const prefix = origin + path;

function fixture(send) {
  let stored;
  const storage = {
    setAlarm: async () => {},
    deleteAlarm: async () => {},
    get: async () => structuredClone(stored),
    put: async (_key, value) => { stored = structuredClone(value); },
    delete: async () => { stored = undefined; },
    deleteAll: async () => { stored = undefined; },
    transaction: operation => operation(storage),
  };
  const env = { BIBLIOGRAPHY_GOOGLE_CLIENT_SECRET: 'test-only' };
  const object = new DriveSession({ storage, waitUntil: () => {} }, env, send);
  env.DRIVE_SESSIONS = {
    idFromName: name => name,
    get: () => ({ fetch: (url, options) => object.fetch(new Request(url, options)) }),
  };
  const request = (address, headers, method = 'GET') =>
    handleDriveAuth(new Request(prefix + address, { method, headers }), env, send);
  const post = (address, Cookie, headers = {}) => request(address, { Origin: origin, Cookie, ...headers }, 'POST');

  async function signIn() {
    const login = await request('login?page=settings');
    const google = new URL(login.headers.get('Location'));
    const Cookie = login.headers.getSetCookie()[0].split(';')[0];
    const state = google.searchParams.get('state');
    const reply = await request('callback?code=google-code&state=' + state, { Cookie });
    return { google, reply };
  }
  return { request, post, signIn, readStorage: () => storage.get('session') };
}

const googleTokens = (access_token = 'initial-access', expires_in = 3600) => Response.json({
  access_token, expires_in, refresh_token: 'private-refresh', scope, refresh_token_expires_in: 604800,
});

function browserCookie(reply) {
  const sessionCookie = reply.headers.getSetCookie().find(value => value.startsWith('__Host-turris-session='));
  assert.match(sessionCookie, /Max-Age=604800; Secure; HttpOnly; SameSite=Lax/);
  assert(!sessionCookie.includes('private-refresh'));
  return sessionCookie.split(';')[0];
}

test('keeps the refresh token in Worker storage and restores the cached access token', async () => {
  const auth = fixture(async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.body.get('grant_type'), 'authorization_code');
    assert.equal(options.body.get('redirect_uri'), prefix + 'callback');
    assert.match(options.body.get('code_verifier'), /^[\w-]{64}$/);
    return googleTokens();
  });
  const { google, reply } = await auth.signIn();
  assert.equal(google.origin, 'https://accounts.google.com');
  assert.equal(google.searchParams.get('access_type'), 'offline');
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(reply.headers.get('Location'), '/turris-altissima/settings/');
  const cookie = browserCookie(reply);
  assert.equal((await auth.readStorage()).refresh, 'private-refresh');
  const restored = await auth.post('session', cookie);
  assert.equal(restored.headers.get('Cache-Control'), 'private, no-store');
  const { session } = await restored.json();
  assert.equal(session.token, 'initial-access');
  assert.equal(session.refresh, undefined);
  assert(!cookie.includes(session.id));
});

test('refreshes an expired access token once for concurrent requests and stores a replacement refresh token', async () => {
  let refreshes = 0;
  const auth = fixture(async (_url, { body }) => {
    if (body.get('grant_type') === 'authorization_code') return googleTokens('expiring-access', 10);
    refreshes++;
    assert.equal(body.get('refresh_token'), 'private-refresh');
    await new Promise(resolve => setImmediate(resolve));
    return Response.json({ access_token: 'new-access', expires_in: 3600, refresh_token: 'replacement' });
  });
  const cookie = browserCookie((await auth.signIn()).reply);
  const results = await Promise.all([auth.post('session', cookie), auth.post('session', cookie)]);
  for (const result of results) assert.equal((await result.json()).session.token, 'new-access');
  assert.equal(refreshes, 1);
  assert.equal((await auth.readStorage()).refresh, 'replacement');
});

test('removes a revoked Google session and leaves a transient refresh failure recoverable', async () => {
  const errors = [
    Response.json({ error: 'temporarily_unavailable' }, { status: 503 }),
    Response.json({ error: 'invalid_grant' }, { status: 400 }),
  ];
  const auth = fixture((_url, { body }) => body.get('grant_type') === 'authorization_code'
    ? googleTokens('expiring-access', 10) : errors.shift());
  const cookie = browserCookie((await auth.signIn()).reply);
  assert.equal((await auth.post('session', cookie)).status, 503);
  assert.equal((await auth.readStorage()).refresh, 'private-refresh');
  assert.equal((await (await auth.post('session', cookie)).json()).session, null);
  assert.equal(await auth.readStorage(), undefined);
});

test('rejects cross-origin requests, mismatched authorization state, and logout from an old tab', async () => {
  const auth = fixture((url, { body }) => {
    if (url.endsWith('/revoke')) {
      assert.equal(body.get('token'), 'private-refresh');
      return Promise.resolve(new Response());
    }
    assert.equal(body.get('code'), 'google-code');
    return googleTokens();
  });
  const login = await auth.request('login');
  const pending = login.headers.getSetCookie()[0].split(';')[0];
  const invalid = await auth.request('callback?state=unrelated&code=wrong', { Cookie: pending });
  assert.equal(invalid.headers.get('Location'), '/turris-altissima/?auth=failed');
  const cookie = browserCookie((await auth.signIn()).reply);
  assert.equal((await auth.post('session', cookie, { Origin: 'https://example.org' })).status, 403);
  assert.equal((await auth.post('logout', cookie, { 'X-Bibliography-Session': 'previous-tab' })).status, 409);
  const { session } = await (await auth.post('session', cookie)).json();
  const loggedOut = await auth.post('logout', cookie, { 'X-Bibliography-Session': session.id });
  assert.match(loggedOut.headers.getSetCookie()[0], /Max-Age=0/);
  assert.equal((await (await auth.post('session', cookie)).json()).session, null);
});

test('preserves short sessions on deployments without the Google client secret', async () => {
  const result = await handleDriveAuth(new Request(prefix + 'session', { method: 'POST', headers: { Origin: origin } }), {});
  assert.deepEqual(await result.json(), { persistent: false, session: null });
});
