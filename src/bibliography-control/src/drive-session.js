const key = 'bibliography-control:drive-session';

export function loadDriveSession() {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const session = JSON.parse(value);
    if (typeof session?.token === 'string' && session.token &&
        Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()) {
      return { token: session.token, expiresAt: session.expiresAt };
    }
    localStorage.removeItem(key);
  } catch {
    // ストレージが使えない場合も、開いている画面では接続できる。
  }
  return null;
}

export function saveDriveSession({ token, expiresAt }) {
  try { localStorage.setItem(key, JSON.stringify({ token, expiresAt })); }
  catch { /* ストレージが使えない場合は、開いている画面で接続を保つ。 */ }
}

export function forgetDriveSession(session) {
  if (!session) return;
  try {
    if (loadDriveSession()?.token === session.token) localStorage.removeItem(key);
  } catch { /* ストレージを使えない場合も、画面上の接続は解除できる。 */ }
}
