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

## 画像圧縮ツール

```sh
cd src/image-compressor
npm ci
npm run dev
```

JPEG・PNG・WebP・AVIF の静止画をブラウザ内で圧縮します。形式に合わせて圧縮方法を選び、幅と高さの割合または長辺の上限を指定できます。圧縮後のファイルサイズは KB や MB などの単位で表示します。プレビューを選ぶと、元の画像と圧縮後の画像をそれぞれ全画面で確認できます。`npm run build` で配布ファイルを `src/image-compressor/dist/` に作ります。

## 文献ライブラリ

```sh
cd src/bibliography-control
npm ci
npm run dev
```

現行の26列 CSV を読み込み、キーワードやタグ式で検索できます。新規の Bib は同じ画面の Bib Formatter で作成します。既存 Bib と Markdown ノートは Drive 上の原本を編集でき、PDF などの原文も登録できます。原本の変更後に「一覧・CSV を更新」で一覧に反映します。

Google Drive 接続の対象は `https://static-specimen-box.sasakiy84.net` です。OAuth の「テストユーザー」に登録した Google アカウントで接続し、直下に `Bibs/`、`Originals/`、`Notes/`、`Scripts/` があるルートを選びます。新規 CSV は `Scripts/_entries.csv` に作成します。既存の CSV は同じファイル ID で更新します。書き込み直前に変更を確認するため、初版の編集・採番は一つのルートを一人ずつ操作する運用を想定しています。

「サンプルを見る」では、一時データで編集や登録を試せます。文献追加は `/bibliography-control/new/?sample=1` から変換済みの例を開けます。LLM 用プロンプトは `/bibliography-control/prompt/` にあります。サンプルで保存した内容は、サンプルを開いている間だけ保持されます。添付の実データは配布に含めません。型検査と配布ファイルの生成は `npm run build`、回帰テストは `npm test`（Node.js と Bun）が担当します。

参考文献の出典とライセンスは [THIRD_PARTY.md](src/bibliography-control/public/THIRD_PARTY.md) にあります。Bib 変換と PDF メタデータの処理は [Bib Formatter](https://github.com/sasakiy84/bib-formatter/tree/954072af0237d122dfcc44e929626c20d6943038) のソースを統合しています。

### ブラウザの再起動後にも Drive に接続する

Google Cloud で同じ OAuth クライアントの「承認済みのリダイレクト URI」に `https://static-specimen-box.sasakiy84.net/bibliography-control/auth/callback` を追加します。Cloudflare の Worker `static-specimen-box` で、**Settings → Variables and Secrets** に次を Secret として登録します。

| 名前 | 値 |
| --- | --- |
| `BIBLIOGRAPHY_GOOGLE_CLIENT_SECRET` | 上記の OAuth クライアントのシークレット |
| `BIBLIOGRAPHY_SESSION_KEY` | `openssl rand -hex 32` で生成した64桁の値 |

登録後の初回接続で Google の認可を行うと、ブラウザの再起動後も同じアカウントと最後に選んだフォルダを復帰します。接続復帰用の情報は、暗号化した HttpOnly Cookie で保持します。Cloudflare Worker は Google OAuth のトークン交換と更新を担当し、Drive の文献データはブラウザから直接読み書きします。「外部・テスト」の Google Cloud プロジェクトでは Drive の認可は最大7日です。 [Google OAuth の有効期限](https://developers.google.com/identity/protocols/oauth2#expiration)

## アプリの追加と公開

アプリごとに `src/<アプリ名>/` を作り、独立した `package.json` を置きます。手元で変更したアプリの `npm run build` を実行し、ソースと `dist/` を一緒にコミットします。追加時は `site/index.html` にリンクを足します。

GitHub Actions は `site/` と各アプリの `dist/` を `_site/` に集約します。アプリの `dist/` は `_site/<アプリ名>/` に置きます。Actions は `_site/` を Wrangler で `static-specimen-box` Worker に送ります。

GitHub のリポジトリに以下の Actions シークレットを登録します。公開対象は `main` ブランチです。

| 種別 | 名前 | 値 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 対象 Worker をデプロイできる API トークン |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウントID |

独自ドメインは Cloudflare ダッシュボードで `static-specimen-box` を開き、**Settings → Domains & Routes → Add → Custom domain** から登録します。
