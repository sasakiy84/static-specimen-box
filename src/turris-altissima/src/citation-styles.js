'use strict';
// 日本図書館情報学会誌 執筆要綱（2025-01-01）§5・§7の参照表記をCSLで定義する。
const CitationStyles = (() => {
    /** @param {boolean} japanese @param {object=} latinNames @returns {string} */
    function jslis(japanese, latinNames = {}) {
        function name(role) {
            return japanese && !latinNames[role]
                ? '<name initialize="false" delimiter="・" name-as-sort-order="all"/>'
                : '<name initialize="false" name-as-sort-order="all" sort-separator=", " delimiter="; " and="text" delimiter-precedes-last="always"/>';
        }
        const articleTitle = japanese ? '<text variable="title" prefix="「" suffix="」"/>' : '<text variable="title" quotes="true" suffix=", "/>';
        const bookTitle = japanese ? '<text variable="title" prefix="『" suffix="』"/>' : '<text variable="title" font-style="italic" suffix=". "/>';
        const container = japanese ? '<text variable="container-title" prefix="『" suffix="』"/>' : '<text variable="container-title" font-style="italic" suffix=". "/>';
        const journal = japanese ? '<text variable="container-title" prefix="『" suffix="』"/>' : '<text variable="container-title" font-style="italic" suffix=", "/>';
        const authorSuffix = japanese ? '' : '. ';
        const separator = japanese ? '，' : ', ';
        return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="note" default-locale="${japanese ? 'ja-JP' : 'en-US'}">
  <info>
    <title>日本図書館情報学会誌（2025）${japanese ? '和文' : '欧文'}</title>
    <id>https://jslis.jp/lisjournal/submission/#library-${japanese ? 'ja' : 'en'}</id>
    <link href="https://jslis.jp/wp-content/uploads/2024/06/shippitsuyoko20250101.pdf" rel="documentation"/>
    <updated>2026-11-16T00:00:00+00:00</updated>
    <rights license="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</rights>
  </info>
  <locale><terms><term name="open-quote">“</term><term name="close-quote">”</term>${japanese ? '<term name="editor" form="short">編</term><term name="translator" form="short">訳</term>' : ''}</terms></locale>
  <macro name="author">
    <choose><if variable="author"><names variable="author" suffix="${authorSuffix}">${name('author')}</names></if>
      <else><names variable="editor" suffix="${authorSuffix}">${name('editor')}<label form="short" prefix="${japanese ? '' : ' ('}" suffix="${japanese ? '' : ')'}"/></names></else></choose>
  </macro>
  <macro name="editor"><names variable="editor">${name('editor')}<label form="short" prefix="${japanese ? '' : ' '}" suffix="${japanese ? '' : ' '}"/></names></macro>
  <macro name="translator"><names variable="translator">${name('translator')}<label form="short" prefix="${japanese ? '' : ' '}" suffix="${japanese ? '，' : '. '}"/></names></macro>
  <macro name="issued"><date variable="issued"><date-part name="year"/></date></macro>
  <macro name="page"><choose><if variable="page"><text variable="page" prefix="p. "/></if><else-if variable="number-of-pages"><text variable="number-of-pages" suffix="p."/></else-if></choose></macro>
  <macro name="edition"><choose><if is-numeric="edition"><number variable="edition" form="${japanese ? 'numeric' : 'ordinal'}" prefix="${japanese ? '第' : ''}" suffix="${japanese ? '版' : ' ed.'}"/></if><else><text variable="edition"/></else></choose></macro>
  <macro name="title">${articleTitle}</macro>
  <macro name="book">${bookTitle}<text variable="original-title" prefix="［" suffix="］" font-style="italic"/><text macro="translator"/></macro>
  <macro name="container">${container}<group prefix="${japanese ? '（' : '('}" suffix="${japanese ? '）' : ') '}" delimiter=" "><text variable="collection-title"/><text variable="collection-number"/></group></macro>
  <macro name="journal">${journal}</macro>
  <macro name="access"><choose><if variable="DOI URL" match="any"><group prefix=" " delimiter=""><choose><if variable="DOI"><text variable="DOI" prefix="https://doi.org/"/></if><else><text variable="URL"/></else></choose>
    <choose><if variable="accessed"><group prefix=", ${japanese ? '（参照 ' : '(accessed '}" suffix="${japanese ? '）' : ')'}"><date variable="accessed" delimiter="-"><date-part name="year"/><date-part name="month" form="numeric-leading-zeros"/><date-part name="day" form="numeric-leading-zeros"/></date></group></if></choose></group></if></choose></macro>
  <macro name="entry"><text macro="author"/><choose>
    <if type="article-journal article-magazine article-newspaper" match="any"><text macro="title"/><text macro="journal"/><group delimiter=", "><text variable="volume" prefix="vol. "/><text variable="issue" prefix="no. "/><text macro="issued"/><text macro="page"/></group></if>
    <else-if type="chapter paper-conference" match="any"><text macro="title"/><text macro="editor"/><text macro="container"/><group delimiter="${separator}"><text variable="publisher"/><text macro="issued"/><text macro="page"/></group></else-if>
    <else-if type="book thesis report" match="any"><text macro="book"/><text macro="edition" suffix="${japanese ? '，' : ' '}"/><group delimiter="${separator}"><text variable="publisher"/><text macro="issued"/><text macro="page"/></group></else-if>
    <else><text macro="title"/><text macro="journal"/><group delimiter=", "><text variable="volume" prefix="vol. "/><text variable="issue" prefix="no. "/><text variable="publisher"/><text macro="issued"/></group></else>
  </choose><text value="."/><text macro="access"/></macro>
  <citation><layout><text macro="entry"/></layout></citation>
  <bibliography><layout suffix="."><text macro="entry"/></layout></bibliography>
</style>`;
    }
    return { jslis };
})();
export { CitationStyles };
