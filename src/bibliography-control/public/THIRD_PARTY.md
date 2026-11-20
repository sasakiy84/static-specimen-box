# 参考文献の書式と使用ライブラリ

## 書式の根拠

| 画面で選ぶ書式 | 根拠・実装 |
| --- | --- |
| SIST 02（2007） | JST『SIST 02-2007 参照文献の書き方』。CSLリポジトリの `sist02.csl` を使用し、和文／欧文の著者区切り、巻号・ページのラベル、DOIリンクの取り扱いをアプリ側で調整 |
| 日本図書館情報学会誌（2025） | 学会の2025年1月1日改訂「執筆要綱」§5・§7に基づき、`Library/CitationStyles.html` にCSL定義を実装 |
| APA第7版 | CSLリポジトリの `apa.csl` |
| Chicago第18版・著者–年 | CSLリポジトリの `chicago-author-date.csl` |
| MLA第9版 | CSLリポジトリの `modern-language-association.csl` |
| IEEE | CSLリポジトリの `ieee.csl` |

- [SIST 02-2007（JST原本・富山県立大学の公開コピー）](https://eddy.pu-toyama.ac.jp/SIST/SIST02-2007.pdf)
- [日本図書館情報学会誌 執筆要綱（学会公式）](https://jslis.jp/wp-content/uploads/2024/06/shippitsuyoko20250101.pdf)
- [APA Style References](https://apastyle.apa.org/style-grammar-guidelines/references)
- [Chicago Author-Date Citation Guide](https://www.chicagomanualofstyle.org/tools_citationguide/citation-guide-2.html)
- [MLA Works Cited](https://style.mla.org/works-cited/works-cited-a-quick-guide/)
- [IEEE Author Center](https://journals.ieeeauthorcenter.ieee.org/your-role-in-article-production/ieee-editorial-style-manual/)

日本図書館情報学会誌の定義は、このアプリの実装であり、学会が配布・認定したCSLではありません。要綱の主要な雑誌論文・図書・章・ウェブ資料の構成を実装しています。会議論文・学位論文・報告書には章・図書の形式を適用した旨を画面に表示します。本文中の引用番号や同一文献の再引用は扱いません。

APA・Chicago・MLA・IEEEには、このアプリで英語出力用のデータを渡します。非ラテン文字の翻字・翻訳は自動生成せず、ユーザーがBibに明示した表記を使用します。未入力の箇所はプレースホルダーにします。英語出力用のデータ変換はアプリ側で実装しています。

## エンジンと同梱方法

[Frank Bennettのciteproc-js](https://github.com/Juris-M/citeproc-js) を使用します。CSL書式とロケールは [Citation Style Language](https://github.com/citation-style-language) のリポジトリを使用します。

`build-citations.cjs` が固定版の公開ソースとライセンスを取得し、`Library/CitationVendor.html` に同梱します。実行時に外部の整形サービスは使わず、Bib本文を外部送信しません。取得した元の著作権表示・ライセンス情報は同梱ファイルと画面の「ライセンス」に保持します。固定版の指定はビルドスクリプトで管理します。

citeproc-jsはCPAL 1.0またはAGPL v3のデュアルライセンスです。この配布ではCPALによる利用を選び、著者名とプロジェクトへのリンクを画面に表示し、取得したソースを読み取り可能な形で同梱します。CSLの上流書式・ロケールは各XML内の著作権表示とCC BY-SA 3.0を保持します。独自の学会誌CSL定義はCC BY-SA 4.0で提供します。

- [citeproc-jsのライセンス](https://github.com/Juris-M/citeproc-js/blob/master/LICENSE)
- [CPAL](https://github.com/Juris-M/citeproc-js/blob/master/CPAL)
- [CSL書式](https://github.com/citation-style-language/styles)
- [CSLロケール](https://github.com/citation-style-language/locales)
- [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
