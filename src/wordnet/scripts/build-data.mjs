import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { entryBucket, normalize, synsetBucket } from '../src/search.js';

const input = new URL('../data/', import.meta.url);
const work = new URL('../.generated/', import.meta.url);
const dictionary = readFileSync(new URL('dictionary.json.gz', input));
const xmlGzip = readFileSync(new URL('wordnet-2.1.xml.gz', input));
const version = createHash('sha256')
  .update(dictionary)
  .update(xmlGzip)
  .update(readFileSync(new URL('LICENSE.txt', input)))
  .update(readFileSync(new URL('../src/search.js', import.meta.url)))
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex').slice(0, 16);
const output = new URL(`public/data/${version}/`, work);
const { entries, synsets, order, stats } = JSON.parse(gunzipSync(dictionary));
const entryOrder = order.map(index => entries[index]);
const members = synsets.map(() => []);
const entryDetails = [];
const terms = entryOrder.map(([id, label, pos, forms, senses, tags], index) => {
  const seenSynsets = new Set();
  const links = senses.map(([synsetIndex, , counts, senseId]) => {
    if (!seenSynsets.has(synsetIndex)) members[synsetIndex].push(index);
    seenSynsets.add(synsetIndex);
    return [synsets[synsetIndex][0], senseId, counts];
  });
  entryDetails.push([id, label, pos, forms, links, tags]);
  const key = normalize(label);
  const aliases = [...new Set(forms.map(([, form]) => normalize(form)))].filter(form => form && form !== key);
  if (!aliases.length) return [label, pos];
  return [label, pos, aliases.length === 1 ? aliases[0] : aliases];
});

const synsetDetails = synsets.map(([id, pos, definitions, examples, relations, ili], index) => [
  id, pos, definitions, examples,
  relations.map(([type, targetIndex, target]) => [
    type, target, members[targetIndex]?.slice(0, 3).map(entry => terms[entry][0]).join('、') || synsets[targetIndex]?.[2][0],
  ]),
  ili,
  members[index].map(entry => [entry, terms[entry][0]]),
]);

const text = synsets.flatMap(([id, , definitions, examples], index) => {
  const lines = [...definitions, ...examples].map(normalize).filter(Boolean);
  return lines.length ? [[id, lines, members[index]]] : [];
});

const xml = gunzipSync(xmlGzip).toString('utf8');
const xmlEntries = new Map([...xml.matchAll(/<LexicalEntry id="([^"]+)"[^>]*>[\s\S]*?<\/LexicalEntry>/g)]
  .map(([record, id]) => [id, record]));
const xmlSynsets = new Map([...xml.matchAll(/<Synset id="([^"]+)"[^>]*?(?:\/>|>[\s\S]*?<\/Synset>)/g)]
  .map(([record, id]) => [id, record]));

function writeGroup(directory, rows, bucketFor, keyFor, valueFor, compressed = false) {
  const buckets = new Map();
  for (const [index, row] of rows.entries()) {
    const bucket = bucketFor(index, row);
    if (!buckets.has(bucket)) buckets.set(bucket, Object.create(null));
    buckets.get(bucket)[keyFor(index, row)] = valueFor(row);
  }
  const destination = new URL(`${directory}/`, output);
  mkdirSync(destination, { recursive: true });
  for (const [bucket, values] of buckets) {
    const json = JSON.stringify(values);
    writeFileSync(new URL(`${bucket}.json${compressed ? '.gz' : ''}`, destination), compressed ? gzipSync(json) : json);
  }
}

rmSync(work, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
writeFileSync(new URL('search.json', output), JSON.stringify(terms));
writeFileSync(new URL('text.json', output), JSON.stringify(text));
copyFileSync(new URL('LICENSE.txt', input), new URL('LICENSE.txt', output));
writeGroup('entries', entryDetails, entryBucket, index => index, row => row);
writeGroup('synsets', synsetDetails, (_, [id]) => synsetBucket(id), (_, [id]) => id, row => row);
writeGroup('entry-xml', entryDetails, entryBucket, (_, [id]) => id, ([id]) => xmlEntries.get(id), true);
writeGroup('synset-xml', synsetDetails, (_, [id]) => synsetBucket(id), (_, [id]) => id, ([id]) => xmlSynsets.get(id), true);
writeFileSync(new URL('metadata.json', work), JSON.stringify({
  version,
  stats: {
    ...stats,
    definitions: synsets.reduce((total, row) => total + row[2].length, 0),
    examples: synsets.reduce((total, row) => total + row[3].length, 0),
  },
}));
