let loading;

export function citationAssets() {
  if (globalThis.CitationAssets?.ready) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}citation-vendor.js`;
    script.onload = () => {
      if (globalThis.CitationAssets?.ready) resolve();
      else reject(new Error('参考文献のデータを読み込めませんでした。'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('参考文献のデータを読み込めませんでした。'));
    };
    document.head.append(script);
  }).catch(error => {
    loading = undefined;
    throw error;
  });
  return loading;
}
