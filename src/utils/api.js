const REGEX = new RegExp(`^[SVL]-[A-Z]{2}([0-9]{6})-?[A-Z]?$`);
export const PREFIX = 'inventar';
export const SEP = '/';

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
