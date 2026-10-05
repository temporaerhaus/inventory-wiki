import YAML from 'yaml';
import { v4 as uuidv4 } from 'uuid';

// lazy, so that code blocks in the content below the yaml block are not swallowed
const YAML_REGEX = /```yaml\n(.*?)\n```/s;
// marks a page for the commonmark plugin, every item page should start with it
const DOCTYPE = '<!DOCTYPE markdown>';
const REGEX = new RegExp(`^[SVL]-[A-Z]{2}([0-9]{6})-?[A-Z]?$`);

export const PREFIX = 'inventar';
export const SEP = '/';

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
let currentUser = null;

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
  data.set('wikitext', update(String(data.get('wikitext') || '').replaceAll('\r\n', '\n')));
  data.set('summary', summary);
  data.set('do[save]', '1');
  await fetch(`${path}?do=edit`, { method: 'post', body: data });

  currentUser = currentUser || (await rpc('core.whoAmI')).login;
  const history = await rpc('core.getPageHistory', { page });
  if (!history.some(e => e.revision >= before && e.summary === summary && e.author === currentUser)) {
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

// The overview page lists every item as "[date] - [ns:id] Title"; that is the
// only place where inventory numbers and titles appear together, which is what
// the Kennbuchstabe suggestions are built from. The API is no help here: with
// useheading off it reports page ids as titles, and reading every page would
// take one request per item.
const ENTRY_ID_REGEX = /^([SVL])-([A-Z]{2})([0-9]{6})(?:-([A-Z0-9]+))?$/;
const ENTRY_PREFIX_REGEX = /^(?:\s*\[[^\]]*\]\s*-?\s*)+/;

let inventoryCache = null;

export async function fetchInventory({ reload = false } = {}) {
  if (!inventoryCache || reload) {
    inventoryCache = (async () => {
      const res = await fetch(`/${PREFIX}`);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      return [...doc.querySelectorAll('#dokuwiki__content a[data-wiki-id]')]
        .map((e) => {
          const id = String(e.getAttribute('data-wiki-id')).split(':').pop().toUpperCase();
          const res = ENTRY_ID_REGEX.exec(id);
          if (!res) {
            return null;
          }

          return {
            id,
            lended: res[1] === 'L',
            code: res[2],
            number: res[3],
            suffix: res[4] || '',
            title: e.innerText.replace(ENTRY_PREFIX_REGEX, '').trim(),
          };
        })
        .filter(e => e && e.title);
    })().catch((e) => {
      inventoryCache = null;
      throw e;
    });
  }

  return inventoryCache;
};

export async function nextNumber() {
  const items = await fetchItems();
  return String(Math.max(...items.map(e => Number(REGEX.exec(e)?.[1])).filter(e => !isNaN(e))) + 1).padStart(6, '0');
};

export async function fetchLocations() {
  const html = await rpc('core.getPageHTML', { page: `${PREFIX}:locations` });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('li')].map(e => e.textContent.trim());
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
async function queuePrint(entries) {
  const token = await lock();
  try {
    await saveViaEditor(PRINT_QUEUE_PAGE, (text) => `${text}\n  * ${entries.join('\n  * ')}`, 'add entry');
  } finally {
    await release(token);
  }
}

export async function remotePrint(inventoryId) {
  await queuePrint(Array.isArray(inventoryId) ? inventoryId : [inventoryId]);
}

export async function remotePrintContents(inventoryId, levels = 0) {
  await queuePrint([`inhaltsliste:${inventoryId}${levels > 0 ? `:${levels}` : ''}`]);
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
  } finally {
    await release(token);
  }
}
