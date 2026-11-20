# Static Specimen Box

静的なWebツールをアプリごとに開発し、ひとつの Cloudflare Workerで公開します。公開サイトのトップページは `site/index.html` です。

## 日本語 WordNet

```sh
cd src/wordnet
npm ci
npm run dev
```

`npm run build` でアプリの配布ファイルを `src/wordnet/dist/` に作ります。ビルドには Node.js 22.12 以降を使用してください。`npm run preview` でビルド結果を確認できます。

通常検索は、最初の検索時に見出し語・読み・別表記・品詞の索引を読み込みます。定義・例文の検索データ、語義の詳細、原文XMLは、それぞれの操作に応じて取得します。

辞書は [日本語 WordNet 2.1](https://github.com/bond-lab/wnja/releases/tag/v2.1) です。検索と詳細は添付のHTMLに収録されていた辞書データと並び順を使い、原文XMLは公式リリースのものを使っています。データの [ライセンス](src/wordnet/data/LICENSE.txt) は配布ファイルとアプリの About にも含まれます。

## 動画圧縮ツール

```sh
cd src/video-compressor
npm ci
npm run dev
```

`npm run build` で型を検査し、配布ファイルを `src/video-compressor/dist/` に作ります。動画の圧縮とトリミングはブラウザ内の Web Worker で実行します。利用できる保存形式とコーデックはブラウザや端末によって異なります。ライブラリのライセンスとソースの参照先は [THIRD-PARTY-NOTICES.txt](src/video-compressor/public/THIRD-PARTY-NOTICES.txt) にあります。

## 一期一会

```sh
cd src/ichigo-ichie
npm run build
```

`index.html`、`app.js`、`style.css` を `dist/` にコピーします。人物データの抽出には、ブラウザから Hugging Face の公開APIを使います。 [NVIDIA Nemotron Personas](https://huggingface.co/collections/nvidia/nemotron-personas)

## img2pdf

```sh
cd src/img2pdf
npm ci
npm run dev
```

画像の読み込み、並べ替え、PDFへの変換はブラウザ内で行います。`npm run build` で配布ファイルを `src/img2pdf/dist/` に作ります。

## アプリの追加と公開

アプリごとに `src/<アプリ名>/` を作り、独立した `package.json` を置きます。手元で変更したアプリの `npm run build` を実行し、ソースと `dist/` を一緒にコミットします。追加時は `site/index.html` にリンクを足します。

GitHub Actions は `site/` と各アプリの `dist/` を `_site/` に集約します。アプリの `dist/` は `_site/<アプリ名>/` に置きます。Actions は `_site/` を Wrangler で `static-specimen-box` Worker に送ります。

GitHub のリポジトリに以下の Actions シークレットを登録します。公開対象は `main` ブランチです。

| 種別 | 名前 | 値 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 対象 Worker をデプロイできる API トークン |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウントID |

独自ドメインは Cloudflare ダッシュボードで `static-specimen-box` を開き、**Settings → Domains & Routes → Add → Custom domain** から登録します。
