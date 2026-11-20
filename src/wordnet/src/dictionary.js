import { entryBucket, synsetBucket } from './search.js';

const root = new URL(`./data/${WORDNET_DATA_VERSION}/`, document.baseURI);
const requests = new Map();

function load(path) {
  if (!requests.has(path)) {
    const request = fetch(new URL(path, root)).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (path.endsWith('.gz')) {
        const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).json();
      }
      return response.json();
    }).catch(error => {
      requests.delete(path);
      throw error;
    });
    requests.set(path, request);
  }
  return requests.get(path);
}

export const loadSearch = () => load('search.json');
export const loadText = () => load('text.json');
export const loadEntry = async id => (await load(`entries/${entryBucket(id)}.json`))[id];
export const loadSynset = async id => (await load(`synsets/${synsetBucket(id)}.json`))[id];
export const loadEntryXml = async (index, id) => (await load(`entry-xml/${entryBucket(index)}.json.gz`))[id];
export const loadSynsetXml = async id => (await load(`synset-xml/${synsetBucket(id)}.json.gz`))[id];
