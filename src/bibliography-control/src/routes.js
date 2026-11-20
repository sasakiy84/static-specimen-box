// 開発時の src/ と配布時の assets/ は、どちらもアプリの URL の一つ下にある。
export const appRoot = new URL('../', new URL(import.meta.url));

export function readRoute(url = new URL(location.href)) {
  const path = url.pathname.slice(appRoot.pathname.length).replace(/\/$/, '');
  return {
    page: path === 'new' || path === 'prompt' ? path : 'library',
    sample: url.searchParams.get('sample') === '1',
  };
}

export function pageUrl(page, sample) {
  const target = new URL(page === 'library' ? '' : page + '/', appRoot);
  if (sample) target.searchParams.set('sample', '1');
  return target;
}
