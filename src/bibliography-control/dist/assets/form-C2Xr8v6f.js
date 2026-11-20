var e=`<header>


    <div class="tabs" role="tablist" aria-label="ツール">
      <button id="converter-tab" type="button" role="tab" aria-selected="true" aria-controls="converter-panel">変換</button>
      <button id="prompt-tab" type="button" role="tab" aria-selected="false" aria-controls="prompt-panel" tabindex="-1">LLM用プロンプト</button>
    </div>
  </header>
  <div class="formatter-content">
    <div id="converter-panel" role="tabpanel" aria-labelledby="converter-tab">
    <section id="filename-section" aria-labelledby="filenames-title">
      <div class="result-head"><h2 id="filenames-title">ファイル名</h2><button id="copy-names" disabled>すべてコピー</button></div>
      <div id="filenames"></div>
    </section>
    <div class="panes">
      <section class="pane" aria-labelledby="input-title">
        <h2 id="input-title"><label for="source">入力する .bib</label></h2>
        <div class="pane-actions">
        <div class="toolbar">
          <input id="file" type="file" accept=".bib,.bibtex,.pdf,text/plain,application/pdf" aria-label=".bib または PDF ファイルを開く">
          <button id="example" type="button">サンプルを入力</button>
        </div>
        <div class="toolbar">
          <span id="language-label">言語</span>
          <div class="language-buttons" role="group" aria-labelledby="language-label">
            <button id="language-japanese" type="button" aria-pressed="true">日本語</button>
            <button id="language-english" type="button" aria-pressed="false">英語</button>
            <button id="language-other" type="button" aria-pressed="false">その他</button>
          </div>
          <label id="other-language-label" hidden>言語名 <input id="other-language" type="text" size="12"></label>
        </div>
        </div>
        <textarea id="source" spellcheck="false" placeholder="@article{key,&#10;  author = {Smith, Jane},&#10;  title = {An Example},&#10;  year = {2024},&#10;}"></textarea>
        <div class="toolbar">
          <button id="convert" type="button">biblatex に変換</button>
          <button id="clear" type="button">下書きを消去</button>
        </div>
      </section>
      <section class="pane" aria-labelledby="output-title">
        <h2 id="output-title"><label for="output">変換した biblatex</label></h2>
        <div class="pane-actions">
        <div class="toolbar">
          <button id="copy" type="button" disabled>結果をコピー</button>
          <button id="download" type="button" disabled>.bib をダウンロード</button><button id="drive-save" type="button" class="action-button" disabled>Drive に登録</button>
        </div>
        </div>
        <label id="drive-attach-label" hidden><input id="drive-attach" type="checkbox"> 読み込んだ PDF を原文として保存</label>
        <textarea id="output" spellcheck="false" placeholder="変換結果"></textarea>
        <div class="editor-tools">
        <fieldset id="tag-candidates" class="field-group" hidden>
          <legend>タグ候補</legend>
          <div id="tag-candidate-buttons"></div>
          <p id="tag-candidate-reason" hidden>カンマを含むタグは、カンマ区切りの _tags に追加できません。</p>
        </fieldset>
        <div id="entry-tools" aria-label="文献種別の編集"></div>
        <div id="field-tools" hidden>
          <div id="field-buttons" aria-label="フィールド操作"></div>
        </div>
        </div>
      </section>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
    <ul id="warnings" aria-label="確認する項目"></ul>
    <details>
      <summary>変換ルール</summary>
      <p>PDF は文書情報と XMP メタデータから著者・タイトル・出版日・掲載誌・DOI を読み取って変換します。XMP を優先し、出版日のない PDF は年なしとして出力します。PDF の作成日・更新日は出版年として使いません。紙面からの推定や OCR は行いません。</p>
      <p>LaTeX の大文字保護・数式を保持し、フィールド名・並び順・波括弧の形式を統一します。author・editor・translator などの人名フィールドは10人以内なら1行、11人以上なら人名ごとに改行します。journal → journaltitle、school → institution、year / month → date など、BibTeX の表記を biblatex に寄せます。</p>
      <p>著者・タイトル・出版情報・ページ・DOI・URL・識別子と、アンダーバー（_）で始まる独自フィールドを残します。変換時に _download_at へ端末の現地日付（YYYY-MM-DD）を入れます。abstract・keywords・file・note・location・address と、crossref・xref・xdata・related などの文献間参照フィールドは削除します。@string は展開し、@preamble は保持します。欠けた情報は補いません。</p>
      <p>入力の引用キーに含まれる空白は解析前に取り除きます。引用キーは既存のものも第一著者の姓＋出版年（例：山田2026）に統一します。incollection だけは開始ページを末尾に付けます（例：山田2026p123）。ページが不明なら付けません。著者または出版年が不明なら既存キーを保持し、空欄なら空欄のままにします。</p>
      <p>ファイル名は Year_Authors_Title の形式で、拡張子は付けません。.bib の保存名には同じ名前に .bib を付けます。著者は最大3人で、4人以上は et-al を付けます。ファイル名には著者の姓（著者がなければ編者）を使います。日本語の姓名を分けたい場合は「姓, 名」で入力してください。空白とファイル名に使えない文字はハイフンにし、長すぎる名前は UTF-8 で240バイト以内に短縮します。出版年なしは nd、著者なしは Unknown と表示します。</p>
    </details>
    </div>
    <div id="prompt-panel" role="tabpanel" aria-labelledby="prompt-tab" hidden>
      <div class="result-head"><h2><label for="llm-prompt">LLM用プロンプト</label></h2><button id="copy-prompt" type="button">プロンプトをコピー</button></div>
      <textarea id="llm-prompt" readonly spellcheck="false">以下の書誌情報をルールに則って biblatex フォーマットにして、コードブロックで出力してください。

ルール:
1. 引用表記、参考文献リスト、文章などから書誌情報を読み取り、文献ごとに1つのエントリを作ってください。出力は bib のコードブロック1つだけにし、説明やファイル名は出力しないでください。
2. 入力で確認できる情報だけを使い、不明な著者・出版年・掲載誌・巻号・ページ・DOI・URLなどを推測で補わないでください。不明なフィールドは省略し、タイトルや著者名は翻訳しないでください。
3. 文献種別は、雑誌論文を @article、会議論文を @inproceedings、書籍を @book、書籍の章を @incollection、学位論文を @thesis、報告書を @report、Webページを @online にしてください。判別できない場合は @misc にしてください。博士論文・修士論文は type = {phdthesis}・type = {mathesis} で区別してください。
4. 引用キーは、既存のものも第一著者の姓＋出版年（例: 前川2026、Linell2019）に統一してください。article などにはページ番号を付けず、incollection だけは開始ページを末尾に付けてください（例: Smith2024p123）。ページが不明なら付けないでください。第一著者または出版年が不明なら既存キーを保持し、既存キーもない場合は空欄にしてください（例: @misc{,）。生成したキーが重複する場合も空欄にしてください。
5. author・editor は「姓, 名」の形に整え、複数名は and で区切って入力順に全員を残してください。日本語も同様です。団体名は二重の波括弧で保護してください。各人名フィールドは10人以内なら改行せず1行にまとめ、11人以上は人名ごとに改行してください。団体名の中の and は区切りにしないでください。原文が et al.・ほか等で省略されている場合は、確認できる著者の後に and others を付け、未知の著者名は作らないでください。
6. 出版年月日は date = {YYYY}、{YYYY-MM}、{YYYY-MM-DD} の形で、分かる範囲だけ記述してください。year・month より date を使ってください。PDFの作成日や更新日を出版日として使わないでください。
7. journal は journaltitle、school は institution に統一してください。location と address は削除してください。会議名や収録書籍名は booktitle にしてください。
8. 基本的なフィールド（author、editor、title、date、journaltitle、booktitle、publisher、institution、type、volume、number、pages、edition、doi、url、urldate、isbn、issn、language）を、情報がある場合だけ残してください。種別ごとの必須項目も、不明なら創作せず省略してください。
9. アンダーバー（_）で始まる独自フィールドは保持してください。_download_at = {YYYY-MM-DD} として変換日の年月日を追加し、既存の値があれば更新してください。ユーザー定義のタグは _tags、ノートは _notes にしてください。abstract、keywords、file、note、location、address、管理用メタデータ、および crossref・xref・xdata・related・relatedtype・relatedoptions・relatedstring・entryset・ids などの文献間参照フィールドは出力しないでください。各文献は独立したエントリにしてください。
10. language フィールドを各エントリに追加し、日本語文献は {japanese}、英語文献は {english}、その他は分かる言語名にしてください。言語を特定できない場合は language = {} にしてください。
11. DOI は https://doi.org/ などの接頭辞を除いた識別子にしてください。ページ範囲は 123--145 のようにハイフン2つにしてください。LaTeXの大文字保護・数式は保持してください。
12. 種別・フィールド名は小文字、値は波括弧で囲み、人名以外は1フィールド1行で末尾にカンマを付けてください。人名フィールドの改行は上記の人数のルールに従ってください。フィールドは概ね、著者・編者、タイトル、出版年月日、掲載先、出版者・機関、巻号・ページ、識別子・URL、言語、独自フィールドの順に並べてください。

書誌情報:
（ここに引用情報や参考文献を貼り付けてください）</textarea>
      <p id="prompt-status" role="status" aria-live="polite"></p>
    </div>
  </div>
`;export{e as default};