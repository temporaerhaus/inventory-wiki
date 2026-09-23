// Access to the generated descriptions of the inventory.
//
// Item names here are brand and model strings, which carry no everyday
// vocabulary: a power strip named only by its model number is not found by
// anybody searching for "Steckdosenleiste".
// A separate, non-public project generates one sentence and a handful of common
// German nouns per item name and uploads the result to the wiki.
//
// The data deliberately does not ship with this bundle. This repository is
// public and its CI deploys every build to GitHub Pages, so anything embedded
// here is world-readable, while the inventory itself sits behind the wiki's
// login. Reading it from the wiki keeps it under the same access control as the
// items it describes — and, since the app already runs inside the wiki, the
// request is same-origin and carries the reader's own session.
//
// It is fetched once the create dialog opens, not on every wiki page. Until it
// arrives — or if it is missing entirely, which is the normal state for a fresh
// installation — every accessor returns nothing and the suggestions fall back
// to matching item names alone.

import { PREFIX, SEP } from '@/utils/api.js';

export const ENRICHMENT_PAGE = `${PREFIX}${SEP}enrichment`;

let data = { items: {}, codes: {} };
let pending = null;

export function loadEnrichment() {
  if (!pending) {
    pending = fetch(`/${ENRICHMENT_PAGE}?do=export_raw`)
      .then(res => (res.ok ? res.json() : { items: {}, codes: {} }))
      .then((loaded) => {
        data = loaded && loaded.items ? loaded : { items: {}, codes: {} };
        return data;
      })
      .catch(() => {
        // a missing or unreadable page is not an error worth surfacing: the
        // suggestions simply stay name-based
        pending = null;
        return data;
      });
  }

  return pending;
}

// Supporting text for one item name, for the suggestion index.
export function itemText(title) {
  const entry = data.items[title];
  if (!entry) {
    return '';
  }

  return [entry.description, ...(entry.keywords || [])].filter(Boolean).join(' ');
}

// What the house actually files under a Kennbuchstabe: a hand-written note
// where one exists, the generated summary otherwise, plus the search words.
export function codeNote(code) {
  const entry = data.codes[code];
  if (!entry) {
    return '';
  }

  const head = entry.note ? `Hausgebrauch: ${entry.note}` : entry.summary;
  return [head, (entry.keywords || []).join(', ')].filter(Boolean).join('\n');
}

// Codes the house uses that the norm list does not contain, so the dialog can
// offer them rather than relying on the free-text escape hatch.
export function codeAdditions() {
  return Object.entries(data.codes)
    .filter(([, entry]) => entry.group && entry.text)
    .map(([value, entry]) => ({ group: entry.group, value, text: entry.text, example: '' }));
}
