import YAML from 'yaml';
import { v4 as uuidv4 } from 'uuid';

const YAML_REGEX = /```yaml\n(.*)\n```/s;
const REGEX = new RegExp(`^[SVL]-[A-Z]{2}([0-9]{6})-?[A-Z]?$`);

export const PREFIX = 'inventar';
export const SEP = '/';

const LOCK_TIMEOUT = 10 * 1000;

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

export async function lock() {
  try {
    const res = await fetch('/inventar/lock?do=edit');
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const data = new FormData(doc.querySelector('form[method="post"]'));
    const lockDate = data.get('wikitext').split('/').pop();

    if (data.get('wikitext') && lockDate && (new Date(res.headers.get('date')) - new Date(lockDate)) < LOCK_TIMEOUT) {
      // retry later
      throw new Error('retry');
    }

    const lock = uuidv4();
    data.set('wikitext', `${lock}/${res.headers.get('date')}`);
    data.set('summary', 'lock');
    data.set('do[save]', '1');
    await fetch('/inventar/lock?do=edit', {
      method: 'post',
      body: data
    });

    {
      const res = await fetch('/inventar/lock?do=export_raw');
      const data = await res.text();
      if (data.split('/')[0] === lock) {
        // lock acquired
        return lock;
      }

      throw new Error('retry');
    }
  } catch (e) {
    if (e.message === 'retry') {
      console.log('already locked, retrying later');
      await new Promise(resolve => setTimeout(resolve, Math.round(Math.random() * LOCK_TIMEOUT)));
      return lock();
    } else {
      throw e;
    }
  }
}

export async function release(lock) {
  const res = await fetch('/inventar/lock?do=edit');
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const data = new FormData(doc.querySelector('form[method="post"]'));
  const actualLock = data.get('wikitext').split('/')?.[0];

  if (lock !== actualLock) {
    throw Error('not holding correct lock');
  }

  data.set('wikitext', '');
  data.set('summary', 'release');
  data.set('do[save]', '1');
  await fetch('/inventar/lock?do=edit', {
    method: 'post',
    body: data
  });
}

export async function fetchItems() {
  const res = await fetch('/lib/exe/ajax.php', {
    method: 'POST',
    body: `call=index&idx=${PREFIX}`,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    }
  });
  const data = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(data, 'text/html');

  return [...doc.querySelectorAll('a[data-wiki-id]')]
    .map(e => String(e.getAttribute('href')).replaceAll(':', '/').toUpperCase().split('/').pop())
};

export async function nextNumber() {
  const items = await fetchItems();
  return String(Math.max(...items.map(e => Number(REGEX.exec(e)?.[1])).filter(e => !isNaN(e))) + 1).padStart(6, '0');
};

export async function fetchLocations() {
  const res = await fetch(`/inventar/locations`);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('#dokuwiki__content li')].map(e => e.innerText.trim());
}

export async function remotePrint(inventoryId) {
  const token = await lock();
  const res = await fetch('/inventar/print-queue?do=edit');
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const data = new FormData(doc.querySelector('form[method="post"]'));
  if (Array.isArray(inventoryId)) {
    data.set('wikitext', `${data.get('wikitext')}\n  * ${inventoryId.join('\n  * ')}`);
  } else {
    data.set('wikitext', `${data.get('wikitext')}\n  * ${inventoryId}`);
  }
  data.set('summary', 'add entry');
  data.set('do[save]', '1');
  await fetch('/inventar/print-queue?do=edit', {
    method: 'post',
    body: data
  });
  await release(token);
}

export async function writeItem(path, entry = { }, opts = { create: false, summary: '', replacer: null }) {
  const token = await lock();
  try {
    const res = await fetch(`${path}?do=edit`);
    if (opts.create && !/-[a-z]$/.test(entry.number)) {
      entry.number = await nextNumber();
    }

    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const data = new FormData(doc.querySelector('form[method="post"]'));

    let yaml = {};

    if (opts.create) {
      if (data.get('wikitext') && data.get('wikitext') !== "Please use the inventory system to create items") {
        throw new Error('Ziel Seite ist nicht leer');
      }
    } else if (!YAML_REGEX.test(data.get('wikitext'))) {
      throw new Error('Kein gültiger YAML-Block gefunden');
    } else {
      yaml = YAML.parse(YAML_REGEX.exec(data.get('wikitext'))[1]);
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
    yaml.nominal = entry.nominal ?? yaml.nominal ?? {};
    yaml.temporary = entry.temporary ?? yaml.temporary ?? {};
    yaml.lastSeenAt = entry.lastSeenAt ?? yaml.lastSeenAt ?? '';

    // also allow arbitrary data
    for (const key of Object.keys(entry)) {
      if (!inventorySyntaxOrder[key]) {
        yaml[key] = entry.key;
      }
    }

    data.set('summary', opts.summary || `edit metadata`);

    if (opts.create) {
      data.set('wikitext', [
        '<!DOCTYPE markdown>',
        `# ${entry.title}`,
        '',
        '```yaml',
        YAML.stringify(yaml, { sortMapEntries }),
        '```',
        '',
      ].join('\n'));
    } else {
      const wikitext = data.get('wikitext')
        .replace(YAML_REGEX, '```yaml\n' + YAML.stringify(yaml, { sortMapEntries }) + '\n```')
        .replace(/\n# .*/, `\n# ${entry.title}`);
      data.set('wikitext', wikitext);
    }

    data.set('do[save]', '1');

    await fetch(`${path}?do=edit`, {
      method: 'post',
      body: data
    });
  } finally {
    await release(token);
  }
}
