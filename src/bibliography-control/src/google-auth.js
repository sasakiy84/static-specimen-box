import { googleConfig } from './google-config.js';

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('Google の接続ライブラリを読み込めませんでした。'));
    };
    document.head.append(script);
  });
}

export async function loadIdentity() {
  if (!globalThis.google?.accounts?.oauth2) await loadScript('https://accounts.google.com/gsi/client');
}

export function authorize() {
  return new Promise((resolve, reject) => {
    const oauth = globalThis.google.accounts.oauth2;
    const client = oauth.initTokenClient({
      client_id: googleConfig.clientId,
      scope: googleConfig.scope,
      include_granted_scopes: false,
      callback(response) {
        if (!response.access_token || !oauth.hasGrantedAllScopes(response, googleConfig.scope)) {
          reject(new Error('Google Drive の読み書きが許可されていません。'));
          return;
        }
        resolve({ token: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 });
      },
      error_callback() { reject(new Error('Google の認可画面を開けなかったか、途中で閉じました。')); },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}

export function revoke(token) {
  if (token) globalThis.google?.accounts?.oauth2.revoke(token, () => {});
}

let pickerReady;
function loadPicker() {
  pickerReady ??= (async () => {
    if (!globalThis.gapi) await loadScript('https://apis.google.com/js/api.js');
    await new Promise((resolve, reject) => {
      globalThis.gapi.load('picker', { callback: resolve, onerror: reject, timeout: 12000, ontimeout: reject });
    });
  })().catch(() => {
    pickerReady = undefined;
    throw new Error('Google Picker を読み込めませんでした。');
  });
  return pickerReady;
}

export async function pickFolder(token) {
  await loadPicker();
  const picker = globalThis.google.picker;
  return new Promise((resolve, reject) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder');
    const dialog = new picker.PickerBuilder()
      .addView(view)
      .setAppId(googleConfig.projectNumber)
      .setDeveloperKey(googleConfig.pickerKey)
      .setOAuthToken(token)
      .setOrigin(location.origin)
      .setTitle('文献管理フォルダを選択')
      .setCallback(data => {
        if (data.action === picker.Action.PICKED) {
          dialog.setVisible(false);
          resolve(data.docs?.[0]?.id ?? null);
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null);
        } else if (data.action === 'error') {
          reject(new Error('Google Picker でフォルダを選択できませんでした。'));
        }
      })
      .build();
    dialog.setVisible(true);
  });
}
