import YAML from 'yaml';
import { v4 as uuidv4 } from 'uuid';

// lazy, so that code blocks in the content below the yaml block are not swallowed
const YAML_REGEX = /```yaml\n(.*?)\n```/s;
// marks a page for the commonmark plugin, every item page should start with it
const DOCTYPE = '<!DOCTYPE markdown>';
const REGEX = new RegExp(`^[SVL]-[A-Z]{2}([0-9]{6})-?[A-Z]?$`);

export const PREFIX = 'inventar';
export const SEP = '/';
// deleted items are moved here rather than deleted, so that they can be restored
export const TRASH = 'inv-trash';

const LOCK_TIMEOUT = 10 * 1000;
// shared with the label printer, which takes the same lock around emptying the print queue,
// see saveViaEditor for why both are not saved through the API
const LOCK_PAGE = `${PREFIX}:lock`;
const PRINT_QUEUE_PAGE = `${PREFIX}:print-queue`;

// call dokuwiki's JSON-RPC API, authenticated by the reader's own wiki session
export async function rpc(method, params = {}) {
  const res = await fetch(`/lib/exe/jsonrpc.php/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`${method}: HTTP ${res.status}`);
  }

  if (body.error?.code) {
    const error = new Error(body.error.message);
    error.code = body.error.code;
    throw error;
  }

  return body.result;
}

// page id of a wiki path such as /inventar/V-GM000376
export const pageId = (path) => decodeURIComponent(path).replace(/^\/+/, '').replaceAll('/', ':').toLowerCase();

async function pageExists(page) {
  try {
    await rpc('core.getPageInfo', { page });
    return true;
  } catch (e) {
    if (e.code === 121) {
      return false;
    }
    throw e;
  }
}

const inventorySyntaxOrder = Object.fromEntries([
  'inventory',
  'description',
  'serial',
  'invoice',
  'date',
  'category',
  'origin',
  'owner',
  'small',
  'container',
  'nominal',
  'temporary',
  'lastSeenAt',
].map((e, i) => [e, i + 1]));

const sortMapEntries = (a, b) => {
  if (!inventorySyntaxOrder[a.key.value] && !inventorySyntaxOrder[b.key.value]) {
    return 99 + String(a.key.value).localeCompare(b.key.value);
  }

  return (inventorySyntaxOrder[a.key.value] || 99) - (inventorySyntaxOrder[b.key.value] || 99);
};

// The print station reads and writes the lock page and the print queue through
// the wiki's editor, which keeps them locked for editing nearly all the time
// (it renews that lock on every look at an empty queue). The editor's save
// ignores such locks, the API's savePage refuses them ("The page is currently
// locked"), so these two pages are saved through the editor as well. Whether
// the save happened is checked in the page history afterwards: the content is
// no proof, the print station may already have emptied the queue again.
// the login of the reader, '' for a reader who is not logged in (allowed in
// by the wiki's IP allowlist), whose changes the history shows without one
let currentUser = null;

async function whoAmI() {
  if (currentUser === null) {
    try {
      currentUser = (await rpc('core.whoAmI')).login;
    } catch (e) {
      if (e.message !== 'No user available') {
        throw e;
      }
      currentUser = '';
    }
  }
  return currentUser;
}

async function saveViaEditor(page, update, summary) {
  const path = `/${page.replaceAll(':', '/')}`;
  const before = await rpc('core.getWikiTime');

  const res = await fetch(`${path}?do=edit`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const form = doc.querySelector('form#dw__editform');
  if (!form) {
    throw new Error(`${page} kann nicht bearbeitet werden`);
  }

  const data = new FormData(form);
  const text = String(data.get('wikitext') || '').replaceAll('\r\n', '\n');
  const updated = update(text);
  // there would be no new revision to find below
  if (updated === text) {
    return;
  }
  data.set('wikitext', updated);
  data.set('summary', summary);
  data.set('do[save]', '1');
  await fetch(`${path}?do=edit`, { method: 'post', body: data });

  const user = await whoAmI();
  const history = await rpc('core.getPageHistory', { page });
  if (!history.some(e => e.revision >= before && e.summary === summary && (e.author || '') === user)) {
    throw new Error(`${page} konnte nicht gespeichert werden`);
  }
}

// The lock is the content of a wiki page, "<token>/<date>", so that the label
// printer can take part in it too. A lock older than LOCK_TIMEOUT counts as stale.
//
// Reading, writing and re-reading that page is not atomic, so two attempts at
// the same moment can both believe they won. That cannot be ruled out between
// different people, but writes from this tab (such as a bulk edit, which saves
// many items at once) queue up here and take the lock one after another.
let localQueue = Promise.resolve();
const localHolders = new Map();

export async function lock() {
  let done;
  const previous = localQueue;
  localQueue = new Promise(resolve => { done = resolve; });
  await previous;

  try {
    const token = await acquireLock();
    localHolders.set(token, done);
    return token;
  } catch (e) {
    done();
    throw e;
  }
}

async function acquireLock() {
  const text = await rpc('core.getPage', { page: LOCK_PAGE });
  const now = new Date((await rpc('core.getWikiTime')) * 1000);
  const lockDate = text.split('/').pop();

  if (text && lockDate && (now - new Date(lockDate)) < LOCK_TIMEOUT) {
    console.log('already locked, retrying later');
    await new Promise(resolve => setTimeout(resolve, Math.round(Math.random() * LOCK_TIMEOUT)));
    return acquireLock();
  }

  const token = uuidv4();
  await saveViaEditor(LOCK_PAGE, () => `${token}/${now.toUTCString()}`, 'lock');

  if ((await rpc('core.getPage', { page: LOCK_PAGE })).split('/')[0] !== token) {
    // somebody else was faster
    return acquireLock();
  }

  return token;
}

export async function release(token) {
  try {
    const text = await rpc('core.getPage', { page: LOCK_PAGE });
    if (token !== text.split('/')[0]) {
      throw Error('not holding correct lock');
    }

    await saveViaEditor(LOCK_PAGE, () => '', 'release');
  } finally {
    localHolders.get(token)?.();
    localHolders.delete(token);
  }
}

export async function fetchItems() {
  return (await rpc('core.listPages', { namespace: PREFIX, depth: 1 }))
    .map(e => e.id.split(':').pop().toUpperCase());
};

// Inventory numbers and titles of all items, which is what the Kennbuchstabe
// suggestions are built from. The API alone is no help here: with useheading
// off it reports page ids as titles, and reading every page would take one
// request per item. They come from the wiki plugin in dokuwiki-plugin/inventory
// in one request, or, where it is not installed, from the overview page, which
// lists every item as "[date] - [ns:id] Title".
const ENTRY_ID_REGEX = /^([SVL])-([A-Z]{2})([0-9]{6})(?:-([A-Z0-9]+))?$/;
const ENTRY_PREFIX_REGEX = /^(?:\s*\[[^\]]*\]\s*-?\s*)+/;

const inventoryEntry = (id, title) => {
  const res = ENTRY_ID_REGEX.exec(id);
  if (!res || !title) {
    return null;
  }

  return {
    id,
    lended: res[1] === 'L',
    code: res[2],
    number: res[3],
    suffix: res[4] || '',
    title,
  };
};

async function inventoryFromPlugin() {
  const { items } = await queryItems({ limit: 0, columns: ['title'] });
  return items.map(e => inventoryEntry(e.id, e.title.trim())).filter(Boolean);
}

async function inventoryFromOverview() {
  const res = await fetch(`/${PREFIX}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

  return [...doc.querySelectorAll('#dokuwiki__content a[data-wiki-id]')]
    .map(e => inventoryEntry(
      String(e.getAttribute('data-wiki-id')).split(':').pop().toUpperCase(),
      e.innerText.replace(ENTRY_PREFIX_REGEX, '').trim()
    ))
    .filter(Boolean);
}

let inventoryCache = null;

export async function fetchInventory({ reload = false } = {}) {
  if (!inventoryCache || reload) {
    inventoryCache = inventoryFromPlugin()
      .catch((e) => {
        if (isPluginMissing(e)) {
          return inventoryFromOverview();
        }
        throw e;
      })
      .catch((e) => {
        inventoryCache = null;
        throw e;
      });
  }

  return inventoryCache;
};

// the inventory ids of the items and of the deleted ones, which keep their
// ids, since their labels may still be stuck to something
async function fetchTakenIds() {
  return [
    ...await fetchItems(),
    ...(await rpc('core.listPages', { namespace: TRASH, depth: 1 }))
      .map(e => e.id.split(':').pop().replace(/_[0-9]+$/, '').toUpperCase()),
  ];
}

// the suffixes given to sub-items of an inventory id, e.g. ['N', 'Z'] for V-GM000123
export async function takenSuffixes(base) {
  const prefix = `${base.toUpperCase()}-`;
  return (await fetchTakenIds())
    .filter(e => e.startsWith(prefix))
    .map(e => e.slice(prefix.length))
    .filter(e => /^[A-Z]$/.test(e));
}

export async function nextNumber() {
  const items = await fetchTakenIds();
  return String(Math.max(...items.map(e => Number(REGEX.exec(e)?.[1])).filter(e => !isNaN(e))) + 1).padStart(6, '0');
};

// text of a list entry without the entries of a list nested in it
const ownText = (li) => {
  if (!li) {
    return '';
  }

  const copy = li.cloneNode(true);
  copy.querySelectorAll('ul, ol').forEach(e => e.remove());
  return copy.textContent.trim();
};

// The places ("Orte") of the locations page, in its order, each with the place
// it belongs to: a list nested in an entry there lists the places within it.
async function fetchPlaces() {
  const html = await rpc('core.getPageHTML', { page: `${PREFIX}:locations` });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('li')]
    .map(e => ({ value: ownText(e), kind: 'place', title: '', description: '', parent: ownText(e.parentElement.closest('li')) }))
    .filter(e => e.value);
}

// The items that can contain other items ("Behälter"), each with where it is
// now. From the wiki plugin's table, or, where it is not installed, from the
// fulltext search and one request per hit.
async function fetchContainers() {
  const container = (id, title, description, location) => ({ value: id, kind: 'container', title, description, parent: location });

  try {
    const { items } = await queryItems({ filters: { container: '1' }, limit: 0, columns: ['title', 'description', 'location'] });
    return items.map(e => container(e.id, e.title, e.description, e.location));
  } catch (e) {
    if (!isPluginMissing(e)) {
      throw e;
    }
  }

  const ids = (await searchItems('"container: true"')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const items = await Promise.all(ids.map(async (id) => {
    const item = await fetchInventoryItem(id).catch(() => null);
    return item?.container && container(
      id,
      item.title,
      String(item.description || ''),
      String(item.temporary?.location || item.nominal?.location || '')
    );
  }));
  return items.filter(Boolean);
}

// Orders the nodes as a tree, each one below the node its parent names, as a
// list of options with their depth and the path of values above them. A node
// with an unknown parent, or in a loop, is at the top level. Kept in step with
// tree() in dokuwiki-plugin/inventory/remote.php, which does the same on the
// server.
export function locationTree(nodes) {
  const key = (value) => String(value ?? '').trim().toUpperCase();

  const byKey = new Map();
  nodes.forEach((node, i) => byKey.has(key(node.value)) || byKey.set(key(node.value), i));

  const roots = [];
  const children = nodes.map(() => []);
  nodes.forEach((node, i) => {
    const parent = byKey.get(key(node.parent));
    if (parent !== undefined && parent !== i) {
      children[parent].push(i);
    } else {
      roots.push(i);
    }
  });

  const seen = new Set();
  const options = [];
  const walk = (i, path) => {
    if (seen.has(i)) {
      return;
    }
    seen.add(i);

    const { parent, ...node } = nodes[i];
    options.push({ ...node, depth: path.length, path });
    children[i].forEach(child => walk(child, [...path, node.value]));
  };

  roots.forEach(i => walk(i, []));
  // whatever is only reachable through a loop
  nodes.forEach((_, i) => walk(i, []));

  return options;
}

// Where an item can be put: the places, and the containers below the place they
// are in, see locationTree. Built by the wiki plugin where it is installed.
export async function fetchLocationTree() {
  try {
    return await rpc('plugin.inventory.listLocations');
  } catch (e) {
    if (!isPluginMissing(e)) {
      throw e;
    }
  }

  return locationTree((await Promise.all([fetchPlaces(), fetchContainers()])).flat());
}

export async function searchItems(query) {
  return (await rpc('core.searchPages', { query: `${query} @${PREFIX}` }))
    .map(e => e.id.split(':').pop().toUpperCase());
};

export async function fetchInventoryItem(inventoryId) {
  // a missing page comes back as the namespace template, which has no yaml block
  const wikitext = await rpc('core.getPage', { page: `${PREFIX}:${String(inventoryId).toLowerCase()}` });

  for (const [, block] of wikitext.replaceAll('\r\n', '\n').matchAll(new RegExp(YAML_REGEX.source, 'gs'))) {
    try {
      const data = YAML.parse(block);
      if (data.inventory) {
        data.title = /^# (.*)$/m.exec(wikitext)?.[1]?.trim() || '';

        const date = new Date(data.date);
        if (!(date instanceof Date && !isNaN(date))) {
          data.date = '';
        } else {
          date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
          data.date = date.toISOString().slice(0, 10);
        }

        return data;
      }
    } catch {
      // ignore
    }
  }

  return null;
};

// An item and its sub-items: V-GM000123 and V-GM000123-N, -Z, …
const SUB_ITEM_REGEX = /^([SVL]-[A-Z]{2}[0-9]{6})-([A-Z])$/;

// the inventory number of the item a sub-item belongs to, null for any other
export const mainItemOf = (inventoryId) => SUB_ITEM_REGEX.exec(String(inventoryId).toUpperCase())?.[1] ?? null;

// [{id, title}] of the sub-items of an item, in the order of their suffixes;
// from the wiki plugin in one request, or from the list of pages and one
// request per sub-item where it is not installed
export async function fetchSubItems(inventoryId) {
  const main = String(inventoryId).toUpperCase();
  const isSub = (id) => mainItemOf(id) === main;
  const bySuffix = (a, b) => a.id.localeCompare(b.id);

  try {
    const { items } = await queryItems({ filters: { id: `${main}-` }, limit: 0, columns: ['title'] });
    return items.filter(e => isSub(e.id)).map(e => ({ id: e.id, title: e.title })).sort(bySuffix);
  } catch (e) {
    if (!isPluginMissing(e)) {
      throw e;
    }
  }

  const ids = (await fetchItems()).filter(isSub);
  return (await Promise.all(ids.map(async (id) => ({
    id,
    title: (await fetchInventoryItem(id).catch(() => null))?.title || '',
  })))).sort(bySuffix);
}

// whether an error of the calls below means that the wiki plugin is not installed
export const isPluginMissing = (e) => e?.message === 'Method does not exist';

// The items best matching a query as it is typed, from the wiki plugin, which
// also finds a word with a typo in it; where it is not installed, from the
// wiki's fulltext search, which only finds whole words and knows less about
// the items. {total, items: [{id, title, description, location, container,
// small, match: {field, value} or null}]}
export async function searchInventory(query, limit = 8) {
  try {
    return await rpc('plugin.inventory.searchItems', { query, limit });
  } catch (e) {
    if (!isPluginMissing(e)) {
      throw e;
    }
  }

  const items = (await rpc('core.searchPages', { query: `${query} @${PREFIX}` }))
    .filter(e => e.id.startsWith(`${PREFIX}:`) && ENTRY_ID_REGEX.test(e.id.split(':').pop().toUpperCase()))
    .map(e => ({
      id: e.id.split(':').pop().toUpperCase(),
      title: e.title && e.title !== e.id ? e.title : '',
      description: '',
      location: '',
      container: false,
      small: false,
      match: null,
    }));
  return { total: items.length, items: items.slice(0, limit) };
}

// One page of the inventory as a table, filtered and sorted by the wiki plugin
// in dokuwiki-plugin/inventory. Throws if the plugin is not installed.
//   search   whitespace separated terms, each has to appear in one of the columns
//   filters  column => text that has to appear in it
//   limit    0 for all matching items
// Returns { total, items: [{ id, ...columns }] }.
export async function queryItems({ search = '', filters = {}, sort = 'id', desc = false, offset = 0, limit = 50, columns = [] } = {}) {
  return rpc('plugin.inventory.listItems', { search, filters, sort, desc, offset, limit, columns });
}

// only strip surrounding blank lines, leading spaces are syntax (e.g. dokuwiki lists)
const cleanContent = (content) => content.replace(/^\s*\n/, '').trimEnd();

// free content of an item page, everything below the yaml block
export async function fetchItemContent(path) {
  const wikitext = (await rpc('core.getPage', { page: pageId(path) })).replaceAll('\r\n', '\n');
  const match = YAML_REGEX.exec(wikitext);
  return match ? cleanContent(wikitext.slice(match.index + match[0].length)) : '';
}

// security token of the reader's session, the API does not need it, the preview does
async function securityToken() {
  const res = await fetch(`/${PREFIX}?` + new URLSearchParams({ do: 'media', ns: PREFIX, tab_files: 'upload' }));
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const sectok = doc.querySelector('#dw__upload input[name="sectok"]')?.value;
  if (!sectok) {
    throw new Error('Keine Berechtigung');
  }

  return sectok;
}

// close enough to dokuwiki's cleanID for file names that the id computed here
// is the one the file ends up stored under
const cleanMediaName = (name) => name.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9._-]+/g, '_').replace(/_+/g, '_')
  .replace(/^[._-]+|[._-]+$/g, '');

const readBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

// upload a file into a media namespace, returns the media id of the stored file
export async function uploadMedia(ns, file) {
  const media = `${ns}:${cleanMediaName(file.name) || 'datei'}`;
  await rpc('core.saveMedia', { media, base64: await readBase64(file), overwrite: false });

  // make sure the file really is where the snippet will point to
  await rpc('core.getMediaInfo', { media });
  return media;
}

// render markdown content with dokuwiki's own preview, so it looks exactly like the page
export async function renderPreview(path, content) {
  const sectok = await securityToken();
  const res = await fetch(`${path}?do=edit`, {
    method: 'post',
    body: new URLSearchParams({ sectok, wikitext: `${DOCTYPE}\n${content}`, 'do[preview]': '1' })
  });
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

  // a preview locks the page and saves a draft, cancelling releases both again
  await fetch(path, { method: 'post', body: new URLSearchParams({ sectok, do: 'cancel' }) });

  const preview = doc.querySelector('.preview');
  if (!preview) {
    throw new Error('Vorschau nicht verfügbar, wird die Seite gerade von jemand anderem bearbeitet?');
  }

  return preview.innerHTML;
}

// The print station works through the list items on the print queue page:
//   * V-GM000376              a label for that item
//   * inhaltsliste:39C3       an A4 contents list of that container, direct contents only
//   * inhaltsliste:39C3:2     the same, including the contents of sub containers 2 levels deep
// fired on window whenever the print queue was changed from here, so that
// what shows it (the print queue button) can load it again
export const PRINT_QUEUE_CHANGED_EVENT = 'invwiki-print-queue-changed';
const printQueueChanged = () => window.dispatchEvent(new CustomEvent(PRINT_QUEUE_CHANGED_EVENT));

// adds what is not queued yet, and returns that; how many labels of an entry
// are printed is set in the queue itself, see changePrintQueue
async function queuePrint(entries) {
  const token = await lock();
  let added = [];
  try {
    await saveViaEditor(PRINT_QUEUE_PAGE, (text) => {
      const queued = parseQueue(text).map(e => e.entry);
      added = entries.filter((e, i) => ![...queued, ...entries.slice(0, i)].some(q => sameEntry(q, e)));
      return added.length > 0 ? `${text.trimEnd()}\n${added.map(e => queueLine(e, 1)).join('\n')}` : text;
    }, 'add entry');
  } finally {
    await release(token);
  }
  if (added.length > 0) {
    printQueueChanged();
  }
  return added;
}

// the inventory numbers that were not queued yet
export async function remotePrint(inventoryId) {
  return await queuePrint(Array.isArray(inventoryId) ? inventoryId : [inventoryId]);
}

export async function remotePrintContents(inventoryId, levels = 0) {
  await queuePrint([`inhaltsliste:${inventoryId}${levels > 0 ? `:${levels}` : ''}`]);
}

// contents lists of several containers, of what is directly in them; returns
// the entries that were not queued yet
export async function remotePrintContentsLists(inventoryIds) {
  return await queuePrint(inventoryIds.map(e => `inhaltsliste:${e}`));
}

// the containers among inventory numbers, in their order: from the wiki
// plugin in one request, or from the item pages where it is not installed
export async function containersAmong(inventoryIds) {
  const ids = inventoryIds.map(e => String(e).toUpperCase());
  try {
    const { items } = await queryItems({ filters: { container: '1' }, limit: 0, columns: ['title'] });
    const containers = new Set(items.map(e => e.id.toUpperCase()));
    return ids.filter(e => containers.has(e));
  } catch (e) {
    if (!isPluginMissing(e)) {
      throw e;
    }
  }

  const items = await Promise.all(ids.map(e => fetchInventoryItem(e).catch(() => null)));
  return ids.filter((_, i) => items[i]?.container);
}

// an A4 page of large labels of an item, see utils/sign.js
export async function remotePrintSign(inventoryId) {
  await queuePrint([`schild:${inventoryId}`]);
}

// The entries of the print queue, "  * <entry>" lines on its page: inventory
// numbers, and "inhaltsliste:<number>[:<levels>]" for contents lists, followed
// by " x <count>" for more than one label. The label printer takes them off
// once they are printed (see the label-terminal repository, which reads and
// writes them the same way), so the queue shows what is still to be printed.
export const MAX_COPIES = 5;
const COUNT_REGEX = /^(.*?)\s+x\s*([0-9]+)$/i;
const isQueueLine = (line) => line.startsWith('  *');
const sameEntry = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const clampCount = (count) => Math.min(MAX_COPIES, Math.max(1, Math.round(Number(count)) || 1));
const queueLine = (entry, count) => `  * ${entry}${count > 1 ? ` x ${count}` : ''}`;

const parseLine = (line) => {
  const text = line.slice(3).trim();
  const match = COUNT_REGEX.exec(text);
  return match ? { entry: match[1].trim(), count: clampCount(match[2]) } : { entry: text, count: 1 };
};

// [{entry, count}] in the order of the queue; an entry queued more than once
// counts once, with the most labels any of its lines asks for
const parseQueue = (text) => {
  const entries = [];
  for (const { entry, count } of text.split('\n').filter(isQueueLine).map(parseLine)) {
    const known = entries.find(e => sameEntry(e.entry, entry));
    if (known) {
      known.count = Math.max(known.count, count);
    } else if (entry) {
      entries.push({ entry, count });
    }
  }
  return entries;
};

export async function fetchPrintQueue() {
  return parseQueue((await rpc('core.getPage', { page: PRINT_QUEUE_PAGE })).replaceAll('\r\n', '\n'));
}

// sets how many labels of entries are printed, [{entry, count}], a count of
// 0 takes the entry off the queue
export async function changePrintQueue(changes) {
  const token = await lock();
  try {
    await saveViaEditor(PRINT_QUEUE_PAGE, (text) => {
      const done = new Set();
      return text.split('\n').flatMap((line) => {
        const change = isQueueLine(line) && changes.find(e => sameEntry(e.entry, parseLine(line).entry));
        if (!change) {
          return [line];
        }
        if (change.count === 0 || done.has(change)) {
          return [];
        }
        done.add(change);
        return [queueLine(parseLine(line).entry, clampCount(change.count))];
      }).join('\n');
    }, 'change entry');
  } finally {
    await release(token);
  }
  printQueueChanged();
}

export async function removeFromPrintQueue(entries) {
  await changePrintQueue(entries.map(entry => ({ entry, count: 0 })));
}

// fired on window after every saved item, so that views showing items (such as
// the table) can load them again when they are saved without a page reload
export const ITEM_SAVED_EVENT = 'invwiki-item-saved';

// Sets where an item is, in its yaml, for the replacer of writeItem. Modes:
// 0 its current (temporary) location, 1 its regular (nominal) one, 2 back to
// the regular one, which clears the current one.
export const LOCATION_CURRENT = 0;
export const LOCATION_REGULAR = 1;
export const LOCATION_RESET = 2;
// Why putting items into a place would make the place contain itself, '' if
// it would not: when the place, or what it is in, and so on, is one of the
// items. For the current location that follows where each place is now
// (its temporary location, otherwise its nominal one), for the regular
// location only the regular ones. One request per container on the way up.
const LOCATION_ITEM_REGEX = /^[SVL]-[A-Z]{2}[0-9]+(-[A-Z0-9]+)?$/i;
const MAX_LOCATION_DEPTH = 20;
export async function locationLoop(inventoryIds, place, mode) {
  const items = inventoryIds.map(e => String(e).trim().toUpperCase());
  const target = String(place || '').trim();
  const chain = [];
  let current = target;
  while (current && chain.length < MAX_LOCATION_DEPTH) {
    const key = current.toUpperCase();
    const item = items.find(e => e === key);
    if (item) {
      const between = chain.slice(1);
      return chain.length === 0
        ? `${item} kann nicht in sich selbst liegen.`
        : `${item} kann nicht in ${target} liegen, weil ${target} ${between.length > 0 ? `über ${between.join(', ')} ` : ''}selbst in ${item} liegt.`;
    }
    // a loop further up, which does not go through the items, or a place
    // that is no item, like a room
    if (chain.some(e => e.toUpperCase() === key) || !LOCATION_ITEM_REGEX.test(current)) {
      return '';
    }
    chain.push(current);

    const data = await fetchInventoryItem(current).catch(() => null);
    current = String((mode === LOCATION_REGULAR
      ? data?.nominal?.location
      : data?.temporary?.location || data?.nominal?.location) || '').trim();
  }
  return '';
}

export function setLocation(yaml, mode, { location = '', description = '', updateLastSeen = true } = {}) {
  const now = new Date().toJSON();
  const place = { location, description, timestamp: now };

  if (mode === LOCATION_CURRENT) {
    yaml.temporary = place;
  } else if (mode === LOCATION_REGULAR) {
    yaml.nominal = place;
  } else {
    yaml.temporary = {};
  }
  yaml.nominal = yaml.nominal ?? {};
  yaml.temporary = yaml.temporary ?? {};
  if (updateLastSeen) {
    yaml.lastSeenAt = now;
  }

  return yaml;
}

export async function writeItem(path, entry = { }, opts = { create: false, summary: '', replacer: null, content: undefined }) {
  const page = pageId(path);
  const token = await lock();
  try {
    if (opts.create && !/-[a-z]$/.test(entry.number)) {
      entry.number = await nextNumber();
    }

    let yaml = {};
    let text = '';

    if (opts.create) {
      if (await pageExists(page)) {
        throw new Error('Ziel Seite ist nicht leer');
      }
    } else {
      text = (await rpc('core.getPage', { page })).replaceAll('\r\n', '\n');
      if (!YAML_REGEX.test(text)) {
        throw new Error('Kein gültiger YAML-Block gefunden');
      }
      yaml = YAML.parse(YAML_REGEX.exec(text)[1]);
    }

    if (typeof(opts.replacer) === 'function') {
      yaml = opts.replacer(yaml);
    }

    yaml.inventory = true;
    yaml.description = entry.description ?? yaml.description ?? '';
    yaml.serial = entry.serial ?? yaml.serial ?? '';
    yaml.invoice = entry.invoice ?? yaml.invoice ?? '';
    yaml.date = entry.date ?? yaml.date ?? '';
    yaml.category = entry.category ?? yaml.category ?? '';
    yaml.origin = entry.origin ?? yaml.origin ?? '';
    yaml.owner = entry.owner ?? yaml.owner ?? '';
    yaml.small = entry.small ?? yaml.small ?? false;
    yaml.container = entry.container ?? yaml.container ?? false;
    yaml.nominal = entry.nominal ?? yaml.nominal ?? {};
    yaml.temporary = entry.temporary ?? yaml.temporary ?? {};
    yaml.lastSeenAt = entry.lastSeenAt ?? yaml.lastSeenAt ?? '';

    // also allow arbitrary data
    for (const key of Object.keys(entry)) {
      if (!inventorySyntaxOrder[key]) {
        yaml[key] = entry.key;
      }
    }

    let wikitext;
    if (opts.create) {
      wikitext = [
        DOCTYPE,
        `# ${entry.title}`,
        '',
        '```yaml',
        YAML.stringify(yaml, { sortMapEntries }),
        '```',
        '',
        ...(cleanContent(opts.content ?? '') ? [cleanContent(opts.content), ''] : []),
      ].join('\n');
    } else {
      wikitext = text
        .replace(YAML_REGEX, '```yaml\n' + YAML.stringify(yaml, { sortMapEntries }) + '\n```');

      if (typeof opts.content === 'string') {
        const match = YAML_REGEX.exec(wikitext);
        const content = cleanContent(opts.content);
        wikitext = wikitext.slice(0, match.index + match[0].length) + '\n' + (content ? `\n${content}\n` : '');
      }

      if (!wikitext.startsWith(DOCTYPE)) {
        wikitext = `${DOCTYPE}\n${wikitext}`;
      }

      if (entry.title) {
        wikitext = wikitext.replace(/\n# .*/, `\n# ${entry.title}`);
      }
    }

    // fails loudly, e.g. when somebody else has the page open in the wiki's editor
    await rpc('core.savePage', { page, text: wikitext, summary: opts.summary || 'edit metadata' });
    window.dispatchEvent(new CustomEvent(ITEM_SAVED_EVENT, { detail: { page } }));
  } finally {
    await release(token);
  }
}

// Moves an item page into the trash namespace: a copy of the page is saved
// there, then the item page is emptied, which is how dokuwiki deletes a page.
// Both keep their history, the item's attachments stay where they are, so that
// the links in the moved page still work. An item deleted twice (after its
// number was given out again) gets a numbered page in the trash.
export async function trashItem(path) {
  const page = pageId(path);
  const name = page.split(':').pop();
  const token = await lock();
  try {
    const text = await rpc('core.getPage', { page });
    if (!YAML_REGEX.test(text.replaceAll('\r\n', '\n'))) {
      throw new Error('Kein gültiger YAML-Block gefunden');
    }

    let trash = `${TRASH}:${name}`;
    for (let i = 2; await pageExists(trash); i++) {
      trash = `${TRASH}:${name}_${i}`;
    }

    await rpc('core.savePage', { page: trash, text, summary: `deleted from ${page}` });
    await rpc('core.savePage', { page, text: '', summary: `deleted, moved to ${trash}` });
    window.dispatchEvent(new CustomEvent(ITEM_SAVED_EVENT, { detail: { page } }));
    return trash;
  } finally {
    await release(token);
  }
}
