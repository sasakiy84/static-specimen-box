import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.md' } },
  plugins: [{
    name: 'turris-altissima-pages',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset') this.error('turris-altissima の index.html がありません。');
        // JS の読み込み位置を揃え、直接開いた場合も同じ画面を起動する。
        const document = String(html.source).replaceAll('="./assets/', '="../assets/');
        for (const [page, title] of Object.entries({ new: '文献を追加', prompt: 'LLM 用プロンプト', settings: '設定' })) {
          const source = document.replace('data-page="library">', 'data-page="library" hidden>')
            .replace(`data-page="${page}" hidden>`, `data-page="${page}">`)
            .replace('<title>', `<title>${title} | `);
          this.emitFile({ type: 'asset', fileName: page + '/index.html', source });
        }
      },
    },
  }],
});
