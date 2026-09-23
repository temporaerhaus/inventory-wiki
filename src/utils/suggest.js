// Suggests Kennbuchstaben by looking at how comparable items were classified in
// the past, instead of matching the query against the wording of the norm.
//
// Item titles in this inventory are brand and model strings, which share almost
// no vocabulary with the DIN 6779 / EN IEC 81346 category texts. Matching a title against the existing
// ~1500 classified items works far better, and it also picks up the house
// conventions that the norm text does not describe (workstations are filed as
// AF, hand tools as TM, ...).
//
// The index is a plain TF-IDF vector space over word and character n-grams with
// cosine similarity; the character n-grams are what make it survive typos,
// compound words and model numbers. A weighted k-nearest-neighbour vote over the
// matches turns the ranked items into ranked Kennbuchstaben.

const WORD_REGEX = /[0-9a-zäöüßà-ÿ]+/g;
// Supporting text — the generated item description, or the short description
// typed into the form — counts, but must not drown out the name itself.
const EXTRA_WEIGHT = 0.6;
const NGRAM_SIZES = [3, 4];
const NEIGHBOURS = 10;
const MIN_SIMILARITY = 0.02;
// Below this the best match is noise rather than a comparable item: character
// n-grams always find *something*, so a floor is what keeps a typo like
// "qwertzuiop" from producing a confident looking suggestion. Measured against
// the existing inventory, 0.1 suppresses roughly half of the nonsense queries
// and 2.7 % of the real ones, and costs 0.4 points of top-3 accuracy.
const MIN_TOP_SIMILARITY = 0.1;

function tokenize(text) {
  const normalized = String(text || '').toLowerCase();
  const terms = new Map();
  const add = (term) => terms.set(term, (terms.get(term) || 0) + 1);

  for (const word of normalized.match(WORD_REGEX) || []) {
    add(`w:${word}`);
  }

  const padded = ` ${normalized.replace(/\s+/g, ' ').trim()} `;
  for (const size of NGRAM_SIZES) {
    for (let i = 0; i + size <= padded.length; i += 1) {
      add(`c:${padded.slice(i, i + size)}`);
    }
  }

  return terms;
}

// A query or a document is either a plain name or a name plus supporting text.
function terms(input) {
  if (typeof input === 'string' || !input) {
    return tokenize(input);
  }

  const combined = tokenize(input.title);
  for (const [term, frequency] of tokenize(input.extra)) {
    combined.set(term, (combined.get(term) || 0) + frequency * EXTRA_WEIGHT);
  }

  return combined;
}

function weight(frequency) {
  // sub-linear in the count; clamped so a down-weighted term stays positive
  return Math.max(0.1, 1 + Math.log(frequency));
}

function normalize(vector) {
  let length = 0;
  for (const value of vector.values()) {
    length += value * value;
  }

  length = Math.sqrt(length) || 1;
  for (const [term, value] of vector) {
    vector.set(term, value / length);
  }

  return vector;
}

// entries: [{ title, code, id, extra }] — `extra` is optional supporting text
export function buildIndex(entries) {
  const documents = entries
    .filter(e => e && e.title && e.code)
    .map(e => ({ ...e, terms: terms(e) }));

  const documentFrequency = new Map();
  for (const document of documents) {
    for (const term of document.terms.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const idf = new Map();
  for (const [term, frequency] of documentFrequency) {
    idf.set(term, Math.log(documents.length / (1 + frequency)));
  }

  // inverted index, so a query only touches the documents it shares a term with
  const postings = new Map();
  documents.forEach((document, index) => {
    const vector = normalize(new Map(
      [...document.terms].map(([term, frequency]) => [term, weight(frequency) * idf.get(term)])
    ));

    for (const [term, value] of vector) {
      if (!postings.has(term)) {
        postings.set(term, []);
      }
      postings.get(term).push([index, value]);
    }
  });

  return { documents, idf, postings, size: documents.length };
}

export function similarItems(index, query, limit = NEIGHBOURS) {
  if (!index || !index.size || !String(query?.title ?? query ?? '').trim()) {
    return [];
  }

  const fallbackIdf = Math.log(index.size);
  const vector = normalize(new Map(
    [...terms(query)].map(([term, frequency]) => [
      term,
      weight(frequency) * (index.idf.has(term) ? index.idf.get(term) : fallbackIdf)
    ])
  ));

  const scores = new Map();
  for (const [term, value] of vector) {
    for (const [documentIndex, documentValue] of index.postings.get(term) || []) {
      scores.set(documentIndex, (scores.get(documentIndex) || 0) + value * documentValue);
    }
  }

  return [...scores]
    .filter(([, score]) => score > MIN_SIMILARITY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([documentIndex, score]) => ({ ...index.documents[documentIndex], score }));
}

// Returns the most plausible Kennbuchstaben for a title, each with the items
// that voted for it, so the dialog can show *why* it suggests something.
export function suggest(index, query, { limit = 3, neighbours = NEIGHBOURS } = {}) {
  const matches = similarItems(index, query, neighbours);
  if (!matches.length || matches[0].score < MIN_TOP_SIMILARITY) {
    return [];
  }

  const votes = new Map();
  let total = 0;
  for (const match of matches) {
    if (!votes.has(match.code)) {
      votes.set(match.code, { code: match.code, score: 0, items: [] });
    }

    const vote = votes.get(match.code);
    vote.score += match.score;
    vote.items.push(match);
    total += match.score;
  }

  return [...votes.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(vote => ({
      code: vote.code,
      score: vote.score,
      confidence: total ? vote.score / total : 0,
      items: vote.items
    }));
}
