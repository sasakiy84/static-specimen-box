export const partsOfSpeech = {
  n: '名詞',
  v: '動詞',
  a: '形容詞',
  s: '形容詞',
  r: '副詞',
};

export function normalize(value) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[ァ-ヶ]/g, character => (
    String.fromCharCode(character.charCodeAt(0) - 0x60)
  ));
}

export function indexTerms(rows) {
  return rows.map(([label, pos, aliases], id) => ({
    id,
    label,
    pos,
    aliases: typeof aliases === 'string' ? [aliases] : aliases ?? [],
    key: normalize(label),
  }));
}

export function searchTerms(terms, query, pos, textRows) {
  const matches = [[], [], [], []];
  const textHits = new Set();
  const synsets = [];
  if (query && textRows) {
    for (const [id, text, members] of textRows) {
      if (!text.some(line => line.includes(query))) continue;
      for (const member of members) textHits.add(member);
      if (!members.length && (pos === 'all' || id.endsWith(`-${pos}`))) {
        synsets.push({ id, label: id, pos: id.at(-1), aliases: [], kind: 'synset' });
      }
    }
  }

  for (const term of terms) {
    if (pos !== 'all' && term.pos !== pos) continue;
    const { key, aliases } = term;
    if (!query || key === query || aliases.includes(query)) matches[0].push(term);
    else if (key.startsWith(query) || aliases.some(alias => alias.startsWith(query))) matches[1].push(term);
    else if (key.includes(query) || aliases.some(alias => alias.includes(query))) matches[2].push(term);
    else if (textHits.has(term.id)) matches[3].push(term);
  }
  return matches.flat().concat(synsets);
}

export const isSynsetId = value => /^wnja-\d{8}-[a-z]$/.test(value);
export const entryBucket = id => Math.floor(id / 512);
export const synsetBucket = id => Number(id.slice(5, 13)) % 256;
