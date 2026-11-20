import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { forgetDriveSession, loadDriveSession, saveDriveSession } from '../src/drive-session.js';

const key = 'bibliography-control:drive-session';
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let entries;

beforeEach(() => {
  entries = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: name => entries.get(name) ?? null,
    setItem: (name, value) => entries.set(name, value),
    removeItem: name => entries.delete(name),
  } });
});

after(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

test('stores an access token and restores it with its original expiration time', () => {
  const session = { token: 'test-access', expiresAt: Date.now() + 60_000 };
  saveDriveSession({ ...session, extra: 'not part of a browser session' });
  assert.deepEqual(JSON.parse(entries.get(key)), session);
  assert.deepEqual(loadDriveSession(), session);
});

test('removes an expired token before it can be reused', () => {
  saveDriveSession({ token: 'expired-access', expiresAt: Date.now() - 1 });
  assert.equal(loadDriveSession(), null);
  assert.equal(entries.has(key), false);
});

test('disconnecting an older tab leaves a newer account session in storage', () => {
  const expiresAt = Date.now() + 60_000;
  const older = { token: 'older-access', expiresAt };
  const newer = { token: 'newer-access', expiresAt };
  saveDriveSession(newer);
  forgetDriveSession(older);
  assert.deepEqual(loadDriveSession(), newer);
  forgetDriveSession(newer);
  assert.equal(loadDriveSession(), null);
});
