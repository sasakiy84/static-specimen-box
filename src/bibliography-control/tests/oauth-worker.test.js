import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleBibliographyAuth } from '../oauth-worker.js';
import { googleConfig } from '../src/google-config.js';

const origin = googleConfig.origin;
const prefix = origin + '/bibliography-control/auth/';
const env = {
  BIBLIOGRAPHY_GOOGLE_CLIENT_SECRET: 'local-test-only',
  BIBLIOGRAPHY_SESSION_KEY: 'ab'.repeat(32),
};

function request(path, method = 'GET', headers = {}) {
  return new Request(prefix + path, { method, headers });
}

async function signIn(send, page = 'new') {
  const start = await handleBibliographyAuth(request('login?page=' + page), env);
  const google = new URL(start.headers.get('Location'));
  assert.equal(google.origin, 'https://accounts.google.com');
  assert.equal(google.searchParams.get('access_type'), 'offline');
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
  const lookup = start.headers.getSetCookie()[0].split(';')[0];
  const callback = request('callback?code=fake-code&state=' + google.searchParams.get('state'), 'GET', { Cookie: lookup });
  return handleBibliographyAuth(callback, env, send);
}

test('leaves in-page authorization available while Worker secrets are unconfigured', async () => {
  const result = await handleBibliographyAuth(request('session', 'POST', { Origin: origin }), {});
  assert.deepEqual(await result.json(), { persistent: false, session: null });
  const status = await handleBibliographyAuth(request('status'), env);
  assert.deepEqual(await status.json(), { persistent: true });
});

test('issues a secure persistent cookie, and exchanges it for a new browser access token', async () => {
  const callback = await signIn(async (_url, options) => {
    assert.equal(options.body.get('grant_type'), 'authorization_code');
    assert.equal(options.body.get('code'), 'fake-code');
    assert.match(options.body.get('code_verifier'), /^[\w-]{43,128}$/);
    return Response.json({ refresh_token: 'refresh-private-test', scope: googleConfig.scope });
  });
  assert.equal(callback.headers.get('Location'), '/bibliography-control/new/');
  const data = callback.headers.getSetCookie().find(value => value.startsWith('__Host-bibliography-session='));
  assert.match(data, /Max-Age=604800; Secure; HttpOnly; SameSite=Lax/);
  assert(!data.includes('refresh-private-test'));
  const Cookie = data.split(';')[0];

  const renewed = await handleBibliographyAuth(request('session', 'POST', { Origin: origin, Cookie }), env, async (_url, options) => {
    assert.equal(options.body.get('grant_type'), 'refresh_token');
    assert.equal(options.body.get('refresh_token'), 'refresh-private-test');
    return Response.json({ access_token: 'browser-access-test', expires_in: 3600 });
  });
  const session = (await renewed.json()).session;
  assert.equal(session.token, 'browser-access-test');
  assert(session.expiresAt > Date.now());
  assert.equal(renewed.headers.get('Cache-Control'), 'private, no-store');

  const oldTab = await handleBibliographyAuth(request('session', 'POST', {
    Origin: origin, Cookie, 'X-Bibliography-Session': 'previous-browser-session',
  }), env, () => assert.fail('a tab with a different account must not receive this token'));
  assert.equal(oldTab.status, 409);

  const loggedOut = await handleBibliographyAuth(request('logout', 'POST', {
    Origin: origin, Cookie, 'X-Bibliography-Session': session.id,
  }), env, async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/revoke');
    assert.equal(options.body.get('token'), 'refresh-private-test');
    return new Response();
  });
  assert.match(loggedOut.headers.getSetCookie()[0], /Max-Age=0/);
});

test('rejects a callback with a mismatched OAuth state and a cross-origin session request', async () => {
  const start = await handleBibliographyAuth(request('login'), env);
  const result = await handleBibliographyAuth(request('callback?code=fake-code&state=wrong', 'GET', {
    Cookie: start.headers.getSetCookie()[0].split(';')[0],
  }), env, () => assert.fail('no exchange without a matching state'));
  assert.match(result.headers.get('Location'), /auth=failed/);
  const crossOrigin = await handleBibliographyAuth(request('session', 'POST', { Origin: 'https://example.org' }), env);
  assert.equal(crossOrigin.status, 403);
});

test('clears a persistent cookie when Google reports the authorization expired', async () => {
  const cb = await signIn(async () => Response.json({ refresh_token:'gone', scope:googleConfig.scope }), 'library');
  const Cookie = cb.headers.getSetCookie()[1].split(';')[0];
  const api = await handleBibliographyAuth(request('session', 'POST', { Origin:origin, Cookie }), env, async () =>
    Response.json({ error:'invalid_grant' }, { status:400 }));
  assert.deepEqual(await api.json(), { persistent:true, session:null, expired:true });
  assert.match(api.headers.getSetCookie()[0], /Max-Age=0/);
});
