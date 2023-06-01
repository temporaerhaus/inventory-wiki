import { v4 as uuidv4 } from 'uuid';

const REGEX = new RegExp(`^[SVL]-[A-Z]{2}([0-9]{6})-?[A-Z]?$`);

export const PREFIX = 'inventar';
export const SEP = '/';

const LOCK_TIMEOUT = 90 * 1000;

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
  const res = await fetch('/inventar/print-queue?do=edit');
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const data = new FormData(doc.querySelector('form[method="post"]'));
  data.set('wikitext', `${data.get('wikitext')}\n  * ${inventoryId}`);
  data.set('summary', 'add entry');
  data.set('do[save]', '1');
  await fetch('/inventar/print-queue?do=edit', {
    method: 'post',
    body: data
  });
}
