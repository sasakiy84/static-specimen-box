import { CitationStyles } from './citation-styles.js';
import { LibraryCore } from './library-core.js';
'use strict';
const ReferenceFormats = (() => {
    const styles = [
        { id: 'sist02', label: 'SIST 02（2007）', source: 'https://eddy.pu-toyama.ac.jp/SIST/SIST02-2007.pdf', original: true },
        { id: 'jslis', label: '日本図書館情報学会誌（2025）', source: 'https://jslis.jp/wp-content/uploads/2024/06/shippitsuyoko20250101.pdf', original: true },
        { id: 'apa', label: 'APA 第7版（英語出力）', source: 'https://apastyle.apa.org/style-grammar-guidelines/references', original: false },
        { id: 'chicago-author-date', label: 'Chicago 第18版・著者–年（英語出力）', source: 'https://www.chicagomanualofstyle.org/tools_citationguide/citation-guide-2.html', original: false },
        { id: 'modern-language-association', label: 'MLA 第9版（英語出力）', source: 'https://style.mla.org/works-cited/works-cited-a-quick-guide/', original: false },
        { id: 'ieee', label: 'IEEE（英語出力）', source: 'https://journals.ieeeauthorcenter.ieee.org/your-role-in-article-production/ieee-editorial-style-manual/', original: false }
    ];
    const typeMap = { article: 'article-journal', book: 'book', booklet: 'book', collection: 'book', proceedings: 'book',
        inbook: 'chapter', incollection: 'chapter', inproceedings: 'paper-conference', conference: 'paper-conference',
        thesis: 'thesis', phdthesis: 'thesis', mastersthesis: 'thesis', report: 'report', techreport: 'report',
        online: 'webpage', electronic: 'webpage', www: 'webpage', misc: 'article', unpublished: 'manuscript', patent: 'patent', manual: 'book' };
    function plain(value) {
        return String(value || '').replace(/\\([&%_#{}$])/g, '$1')
            .replace(/\\(?:emph|textit|textbf)\s*\{/g, '{').replace(/[{}]/g, '').replace(/~/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function languageCode(value) {
        const normalized = plain(value).toLowerCase().replace(/_/g, '-');
        if (/^(japanese|jpn|ja(?:-jp)?|日本語)$/.test(normalized))
            return 'ja-JP';
        if (/^(english|american|british|eng|en(?:-[a-z]{2})?|英語)$/.test(normalized))
            return normalized === 'british' || normalized === 'en-gb' ? 'en-GB' : 'en-US';
        if (/^(chinese|zho|zh.*|中国語)$/.test(normalized))
            return 'zh-CN';
        return normalized || 'und';
    }
    /** 人名のand区切りは、波括弧の外だけで判定する。 */
    function splitNames(value) {
        const names = [];
        let start = 0, depth = 0;
        for (let i = 0; i < value.length; i++) {
            if (value[i] === '\\') {
                i++;
                continue;
            }
            if (value[i] === '{')
                depth++;
            if (value[i] === '}')
                depth--;
            if (depth === 0 && /^\s+and\s+/i.test(value.slice(i))) {
                const separator = /^\s+and\s+/i.exec(value.slice(i))[0];
                names.push(value.slice(start, i).trim());
                i += separator.length - 1;
                start = i + 1;
            }
        }
        names.push(value.slice(start).trim());
        return names.filter(Boolean);
    }
    /** @param {string} source @returns {object[]} */
    function parseNames(source) {
        return splitNames(source || '').map(name => {
            if (/^\{[\s\S]*\}$/.test(name))
                return { literal: plain(name) };
            const parts = name.split(',').map(plain);
            if (parts.length === 2)
                return { family: parts[0], given: parts[1] };
            if (parts.length === 3)
                return { family: parts[0], suffix: parts[1], given: parts[2] };
            const text = plain(name);
            if (/[^\u0000-\u024f\s\p{P}\p{N}]/u.test(text))
                return { literal: text };
            const words = text.split(/\s+/);
            if (words.length === 1)
                return { family: text };
            let familyAt = words.length - 1;
            while (familyAt > 0 && /^[a-z]/.test(words[familyAt - 1]))
                familyAt--;
            return { family: words.slice(familyAt).join(' '), given: words.slice(0, familyAt).join(' ') };
        });
    }
    function dateParts(value) {
        const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(plain(value));
        if (!match)
            return null;
        const parts = match.slice(1).filter(Boolean).map(Number);
        if (parts.length >= 2 && (parts[1] < 1 || parts[1] > 12))
            return null;
        if (parts.length >= 3 && (parts[2] < 1 || parts[2] > new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate()))
            return null;
        return { 'date-parts': [parts] };
    }
    function escapeMarkup(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function containsNonLatin(value) { return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(value); }
    /** 原文を変更せず、選んだ英語出力用の不足表記だけをプレースホルダーにする。 */
    function prepare(entry, styleId) {
        const style = styles.find(style => style.id === styleId);
        if (!style)
            throw new Error('参考文献スタイルが見つかりません。');
        const fields = entry.bib_fields || {};
        const rawLanguage = plain(fields.language || fields.langid || entry.language);
        const language = languageCode(rawLanguage);
        const missing = [];
        const notices = [];
        const need = (label, english) => { missing.push(label); return '[' + english + ' missing]'; };
        const knownType = Object.prototype.hasOwnProperty.call(typeMap, entry.entrytype);
        const type = knownType ? typeMap[entry.entrytype] : 'article';
        // 1件ずつ整形するため、任意の文献IDをciteproc内部の辞書キーに渡す必要はない。
        const item = { id: 'reference', type, language };
        // 言語情報はundのまま保持する。原文用の和文書式には明示的な既定値を使う。
        const japanese = language === 'ja-JP' || language.startsWith('zh') || (style.original && language === 'und');
        if (!rawLanguage)
            notices.push(style.original
                ? 'language が未設定のため、和文の既定書式で表示しています。'
                : 'language が未設定です。原文の言語は推定していません。');
        const englishOutput = !style.original;
        function textField(key, label, alternative = '') {
            const raw = plain(fields[key] || alternative);
            if (!englishOutput || !containsNonLatin(raw))
                return raw;
            const supplied = plain(fields['_' + key + '_latin'] || (key !== 'title' ? fields['_' + key + '_en'] : ''));
            return supplied || need(label + '（ローマ字・英語表記）', key + ' in Latin letters');
        }
        for (const role of ['author', 'editor', 'translator']) {
            let source = fields[role] || (role === 'author' && !Object.keys(fields).length ? entry.author : '');
            if (!source)
                continue;
            if (englishOutput && containsNonLatin(source)) {
                source = fields['_' + role + '_latin'] || fields['_' + role + '_en'];
                if (!source) {
                    item[role] = [{ literal: need(role + '（ローマ字）', role + ' romanization') }];
                    continue;
                }
            }
            const listedNames = splitNames(source);
            const truncated = listedNames.length > 1 && listedNames[listedNames.length - 1] === 'others';
            item[role] = parseNames(truncated ? listedNames.slice(0, -1).join(' and ') : source);
            if (truncated)
                item[role].push({ literal: need(role + '（省略された名前）', 'Additional ' + role + 's') });
            if (style.original && japanese) {
                item[role] = item[role].map(person => containsNonLatin([person.literal, person.family, person.given].join(' '))
                    ? { literal: person.literal || (person.family || '') + (person.given || '') } : person);
            }
        }
        item.title = textField('title', 'タイトル', entry.title) || need('タイトル', 'Title');
        if (!item.author?.length && !item.editor?.length)
            item.author = [{ literal: need('著者・編者', 'Author') }];
        // 英語出力では、原文が英語以外なら、明示された英訳だけを使用する。
        if (englishOutput && language !== 'und' && !language.startsWith('en')) {
            const translation = plain(fields._title_en);
            if (translation)
                item.title += ' [' + translation + ']';
            else
                item.title += ' ' + need('タイトル英訳', 'English title');
        }
        const containerKey = fields.journaltitle ? 'journaltitle' : fields.journal ? 'journal' : 'booktitle';
        const container = textField(containerKey, '掲載先', entry.publication);
        if (container)
            item['container-title'] = container;
        else if (['article-journal', 'chapter', 'paper-conference'].includes(type))
            item['container-title'] = need('掲載先', 'Container title');
        const publisher = textField('publisher', '出版社', fields.institution || fields.school || entry.publisher);
        if (publisher)
            item.publisher = publisher;
        else if (['book', 'chapter', 'thesis', 'report'].includes(type))
            item.publisher = need('出版社・発行機関', 'Publisher');
        const place = textField('location', '出版地', fields.address);
        if (place)
            item['publisher-place'] = place;
        const issued = dateParts(fields.date || fields.year || entry.date || entry.year);
        if (issued)
            item.issued = issued;
        else
            item.issued = { literal: need('出版年月日', 'Year') };
        const eventDate = dateParts(fields.eventdate);
        if (eventDate)
            item['event-date'] = eventDate;
        const accessed = dateParts(fields.urldate);
        if (accessed)
            item.accessed = accessed;
        for (const [key, csl] of [['volume', 'volume'], ['number', 'issue'], ['pages', 'page'], ['pagetotal', 'number-of-pages'], ['edition', 'edition'],
            ['isbn', 'ISBN'], ['issn', 'ISSN'], ['series', 'collection-title'], ['type', 'genre'], ['eventtitle', 'event-title'], ['venue', 'event-place'], ['origtitle', 'original-title'], ['seriesnumber', 'collection-number']]) {
            const value = ['series', 'eventtitle', 'venue'].includes(key) ? textField(key, key, entry[key]) : plain(fields[key] || entry[key]);
            if (value)
                item[csl] = key === 'pages' ? value.replace(/--/g, '–') : value;
        }
        if (['report', 'patent'].includes(type) && fields.number)
            item.number = plain(fields.number);
        if (fields.eid && !item.page)
            item.page = plain(fields.eid);
        if (['article-journal', 'chapter', 'paper-conference'].includes(type) && !item.page)
            item.page = need('ページ・記事番号', 'Pages or article number');
        const doi = plain(fields.doi || entry.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
        if (doi)
            item.DOI = doi;
        const url = LibraryCore.safeUrl(plain(fields.url || entry.url));
        if (url)
            item.URL = url;
        if (type === 'webpage' && !url && !doi)
            item.URL = need('URL', 'URL');
        if (type === 'webpage' && !accessed) {
            item.accessed = { literal: need('参照日', 'Access date') };
        }
        if (!knownType)
            notices.push('この資料種別は汎用の文献表記で表示しています。');
        // 学会要綱で個別例のない資料は、章・図書の構成を利用した出力であることを表示する。
        if (styleId === 'jslis' && ['paper-conference', 'thesis', 'report'].includes(type))
            notices.push('この資料種別は執筆要綱の章・図書の記載形式を適用しています。');
        // citeprocはインライン装飾を解釈するため、Bibに含まれるHTMLを先に文字化する。
        for (const key of Object.keys(item)) {
            if (typeof item[key] === 'string')
                item[key] = escapeMarkup(item[key]);
            if (['author', 'editor', 'translator'].includes(key))
                item[key] = item[key].map(person => Object.fromEntries(Object.entries(person).map(([k, value]) => [k, escapeMarkup(value)])));
        }
        return { item, missing: [...new Set(missing)], notices, style, japanese };
    }
    function render(entry, styleId) {
        if (!globalThis.CSL || !globalThis.CitationAssets?.ready)
            throw new Error('参考文献エンジンが未準備です。deploy.sh を実行してください。');
        const prepared = prepare(entry, styleId);
        const locale = prepared.style.original && prepared.japanese ? 'ja-JP' : 'en-US';
        const latinNames = Object.fromEntries(['author', 'editor', 'translator'].map(role => [role,
            !containsNonLatin(JSON.stringify(prepared.item[role] || []))]));
        let xml = styleId === 'jslis' ? CitationStyles.jslis(prepared.japanese, latinNames) : CitationAssets.styles[styleId];
        if (!xml)
            throw new Error('スタイル定義がありません。');
        if (styleId === 'sist02') {
            // 書籍の編者だけが登録された場合も落とさず、著者と編者の役割を保つ。
            xml = xml.replace(/<macro name="author">[\s\S]*?<\/macro>/,
                '<macro name="author"><choose><if variable="author"><names variable="author" suffix=". ">' +
                '<name initialize="false" initialize-with=". " name-as-sort-order="all"/></names></if>' +
                '<else><names variable="editor" suffix=". "><name initialize="false" initialize-with=". " name-as-sort-order="all"/>' +
                '<label form="short" prefix=" "/></names></else></choose></macro>');
            // 日本語の一般CSLロケールは「巻・号・ページ」なので、SISTのラベルへ明示する。
            if (prepared.japanese) {
                xml = xml.replace('</info>', '</info><locale xml:lang="ja-JP"><terms>' +
                    '<term name="volume" form="short">vol.</term><term name="issue" form="short">no.</term>' +
                    '<term name="page" form="short">p</term><term name="open-quote">“</term>' +
                    '<term name="close-quote">”</term></terms></locale>');
            }
            xml = xml.replace(/<macro name="page">[\s\S]*?<\/macro>/, '<macro name="page"><choose><if variable="page"><text variable="page" prefix="p. "/></if>' +
                '<else-if variable="number-of-pages"><text variable="number-of-pages" suffix="p."/></else-if></choose></macro>');
            // SIST 02 §4.1.1: 和文著者はコンマ、欧文著者はセミコロンで区切る。
            xml = xml.replace(/<name initialize="false"/g, '<name delimiter="' + (prepared.japanese ? ', ' : '; ') + '" initialize="false"');
            if (prepared.item.DOI && !prepared.item.URL)
                prepared.item.URL = 'https://doi.org/' + prepared.item.DOI;
        }
        const sys = {
            retrieveLocale: language => CitationAssets.locales[language] || CitationAssets.locales[language.split('-')[0]] || CitationAssets.locales['en-US'],
            retrieveItem: () => prepared.item
        };
        const engine = new CSL.Engine(sys, xml, locale, true);
        engine.updateItems([prepared.item.id]);
        const bibliography = engine.makeBibliography();
        if (!bibliography || !bibliography[1]?.length)
            throw new Error('参考文献を整形できませんでした。');
        // 1文献ずつコピーするため、参考文献一覧全体に付く連番は付けない。
        const html = bibliography[1].join('\n').replace(/<div class="csl-left-margin">[\s\S]*?<\/div>/g, '');
        return { html, missing: prepared.missing, notices: prepared.notices };
    }
    return { styles, plain, languageCode, splitNames, parseNames, dateParts, prepare, render };
})();
export { ReferenceFormats };
