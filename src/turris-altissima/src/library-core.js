'use strict';
const LibraryCore = (() => {
    /** @param {string} source @returns {Array<{type:string,value:string,start:number,end:number}>} */
    function tokenize(source) {
        const tokens = [];
        for (let i = 0; i < source.length;) {
            if (/\s/.test(source[i])) {
                i++;
                continue;
            }
            const start = i;
            if (source[i] === '(' || source[i] === ')' || source[i] === ',') {
                const char = source[i++];
                tokens.push({ type: char === ',' ? 'OR' : char, value: char, start, end: i });
            }
            else if (source[i] === '"') {
                let value = '';
                i++;
                let closed = false;
                while (i < source.length) {
                    if (source[i] === '\\' && ['"', '\\'].includes(source[i + 1])) {
                        value += source[i + 1];
                        i += 2;
                    }
                    else if (source[i] === '"') {
                        i++;
                        closed = true;
                        break;
                    }
                    else
                        value += source[i++];
                }
                if (!closed)
                    throw new Error('タグを囲む引用符を閉じてください。');
                if (!value)
                    throw new Error('空のタグは指定できません。');
                tokens.push({ type: 'TAG', value, start, end: i });
            }
            else {
                while (i < source.length && !/[\s(),"]/.test(source[i]))
                    i++;
                const value = source.slice(start, i);
                tokens.push({ type: value === 'AND' || value === 'OR' ? value : 'TAG', value, start, end: i });
            }
            if (tokens.length > 300)
                throw new Error('タグ式が長すぎます。');
        }
        return tokens;
    }
    /** @param {string} source @returns {object|null} */
    function parseTagQuery(source) {
        const tokens = tokenize(source);
        let at = 0;
        let depth = 0;
        if (!tokens.length)
            return null;
        function atom() {
            const token = tokens[at++];
            if (!token)
                throw new Error('演算子の後にタグを入力してください。');
            if (token.type === 'TAG')
                return { type: 'TAG', value: token.value };
            if (token.type === '(') {
                if (++depth > 30)
                    throw new Error('括弧の入れ子が深すぎます。');
                const expression = or();
                if (!tokens[at] || tokens[at++].type !== ')')
                    throw new Error('閉じ括弧 ) が必要です。');
                depth--;
                return expression;
            }
            throw new Error('タグまたは開き括弧 ( を入力してください。');
        }
        function and() {
            let result = atom();
            while (tokens[at]?.type === 'AND') {
                at++;
                result = { type: 'AND', left: result, right: atom() };
            }
            return result;
        }
        function or() {
            let result = and();
            while (tokens[at] && tokens[at].type !== ')') {
                if (tokens[at].type === 'OR')
                    at++;
                // 隣接するタグ・括弧は暗黙のOR。ANDはand()側で先に結合する。
                result = { type: 'OR', left: result, right: and() };
            }
            return result;
        }
        const result = or();
        if (at !== tokens.length)
            throw new Error('対応する開き括弧がありません。');
        return result;
    }
    /** @param {object|null} ast @param {string[]} tags @returns {boolean} */
    function matchesTags(ast, tags) {
        if (!ast)
            return true;
        if (ast.type === 'TAG')
            return tags.includes(ast.value);
        if (ast.type === 'AND')
            return matchesTags(ast.left, tags) && matchesTags(ast.right, tags);
        return matchesTags(ast.left, tags) || matchesTags(ast.right, tags);
    }
    /** @param {string} tag @returns {string} */
    function quoteTag(tag) {
        return /[\s(),"\\]/.test(tag) || /^(AND|OR)$/.test(tag) ? '"' + tag.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : tag;
    }
    /** @param {string} query @param {string} tag @returns {string} */
    function appendTag(query, tag) {
        if (!query.trim())
            return quoteTag(tag);
        const ast = parseTagQuery(query);
        function alreadySelected(node) {
            if (node.type === 'TAG')
                return node.value === tag;
            return node.type === 'OR' && (alreadySelected(node.left) || alreadySelected(node.right));
        }
        if (alreadySelected(ast))
            return query;
        return '(' + query.trim() + ') OR ' + quoteTag(tag);
    }
    /** 入力中の最後の項を候補で置換する範囲を返す。引用符が未完でも補完できる。 */
    function completionRange(query, caret) {
        const endAt = Math.max(0, Math.min(caret, query.length));
        let start = 0, quoted = false, escaped = false;
        for (let i = 0; i < endAt; i++) {
            const char = query[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\' && quoted) {
                escaped = true;
                continue;
            }
            if (char === '"') {
                if (!quoted)
                    start = i;
                quoted = !quoted;
                continue;
            }
            if (!quoted && /[\s(),]/.test(char))
                start = i + 1;
        }
        let end = endAt;
        let inQuote = quoted;
        while (end < query.length) {
            const char = query[end];
            if (char === '\\' && inQuote) {
                end += 2;
                continue;
            }
            if (char === '"' && inQuote) {
                end++;
                break;
            }
            if (!inQuote && /[\s(),]/.test(char))
                break;
            end++;
        }
        const fragment = query.slice(start, endAt).replace(/^"/, '').replace(/"$/, '').replace(/\\(["\\])/g, '$1');
        return { start, end, fragment };
    }
    /** @param {string} query @param {number} caret @param {string} tag @returns {string} */
    function completeTag(query, caret, tag) {
        const range = completionRange(query, caret);
        if (['AND', 'OR'].includes(range.fragment))
            return query + ' ' + quoteTag(tag);
        return query.slice(0, range.start) + quoteTag(tag) + query.slice(range.end);
    }
    /** @param {object[]} entries @returns {{tag:string,count:number,lastUsed:number}[]} */
    function tagCatalog(entries) {
        const tags = new Map();
        for (const entry of entries) {
            const time = Date.parse(entry.bib_modified_at || '') || 0;
            for (const tag of new Set(entry.tags || [])) {
                const info = tags.get(tag) || { tag, count: 0, lastUsed: 0 };
                info.count++;
                info.lastUsed = Math.max(info.lastUsed, time);
                tags.set(tag, info);
            }
        }
        return [...tags.values()];
    }
    function recentTags(entries, limit = 10) {
        return tagCatalog(entries).filter(info => info.lastUsed > 0)
            .sort((a, b) => b.lastUsed - a.lastUsed || a.tag.localeCompare(b.tag, 'ja')).slice(0, limit);
    }
    const entryCollator = new Intl.Collator('ja', { numeric: true, sensitivity: 'variant' });
    /** @param {object} a @param {object} b @param {string=} order @returns {number} */
    function compareEntries(a, b, order = 'id-desc') {
        // 数値として同じでも、先頭ゼロ・表記の異なるIDは確定した順序を持たせる。
        const ids = entryCollator.compare(a.id, b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        if (order === 'id') return ids;
        if (order === 'title') return entryCollator.compare(a.title, b.title) || ids;
        if (order === 'newest' || order === 'oldest') {
            const years = entryCollator.compare(a.year || '0000', b.year || '0000');
            return (order === 'oldest' ? years : -years) || ids;
        }
        return -ids;
    }
    function normalize(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase('ja'); }
    function safeUrl(value) {
        try {
            const url = new URL(value);
            return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
        }
        catch (_) {
            return '';
        }
    }
    return { tokenize, parseTagQuery, matchesTags, quoteTag, appendTag, completionRange, completeTag,
        tagCatalog, recentTags, compareEntries, normalize, safeUrl };
})();
export { LibraryCore };
