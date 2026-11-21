const databaseName = 'bibliography-control-catalog';
const storeName = 'builds-v1';

function accessCache(key, mode, record) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    let blocked = false;
    open.onupgradeneeded = () => open.result.createObjectStore(storeName);
    open.onerror = () => reject(open.error);
    open.onblocked = () => {
      blocked = true;
      reject(new Error('CSV のキャッシュを開けませんでした。'));
    };
    open.onsuccess = () => {
      const database = open.result;
      if (blocked) {
        database.close();
        return;
      }
      try {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = mode === 'readonly' ? store.get(key) : store.put(record, key);
        transaction.oncomplete = () => {
          database.close();
          resolve(request.result);
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      } catch (error) {
        database.close();
        reject(error);
      }
    };
  });
}

export function browserCatalogCache(key) {
  const publishedKey = [key, 'published'];
  return {
    read: () => accessCache(key, 'readonly'),
    write: record => accessCache(key, 'readwrite', record),
    readPublished: () => accessCache(publishedKey, 'readonly'),
    writePublished: record => accessCache(publishedKey, 'readwrite', record),
  };
}
