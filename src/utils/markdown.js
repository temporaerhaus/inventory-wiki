// The free content of an item page, the markdown below the yaml block, as
// pdfmake nodes for the contents list (src/utils/contents.js). It covers what
// pages here are written with: headings, paragraphs, lists, quotes, code,
// tables, links, images and the dokuwiki media and page links the commonmark
// plugin passes through. Copied to the label terminal (src/markdown.js),
// keep them in sync.
//
// The font is Roboto Mono without an italic cut (the label terminal has none
// at all), so emphasis stays upright and only strong text stands out.

const FENCE_REGEX = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_REGEX = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const RULE_REGEX = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_REGEX = /^ {0,3}> ?/;
const LIST_REGEX = /^( *)([-*+]|\d{1,9}[.)])( +|$)/;
const TABLE_SEPARATOR_REGEX = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
// ~~NOTOC~~ and other dokuwiki macros, they print nothing
const MACRO_REGEX = /^\s*~~[A-Z_]+(?::[^~]*)?~~\s*$/;

const startsBlock = (line) => FENCE_REGEX.test(line) || HEADING_REGEX.test(line) || RULE_REGEX.test(line)
  || QUOTE_REGEX.test(line) || LIST_REGEX.test(line) && !/^ *$/.test(line.replace(LIST_REGEX, ''));

const indentOf = (line) => line.match(/^ */)[0].length;

const tableCells = (line) => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  .split(/(?<!\\)\|/).map(e => e.trim().replaceAll('\\|', '|'));

// the blocks of a markdown text: { type, … }, nested for lists and quotes
function parseBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim() || MACRO_REGEX.test(line)) {
      i++;
      continue;
    }

    const fence = FENCE_REGEX.exec(line);
    if (fence) {
      const code = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) {
        code.push(lines[i]);
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      i++;
      continue;
    }

    const heading = HEADING_REGEX.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] || '' });
      i++;
      continue;
    }

    if (RULE_REGEX.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    if (QUOTE_REGEX.test(line)) {
      const quoted = [];
      for (; i < lines.length && lines[i].trim() && !(quoted.length && startsBlock(lines[i]) && !QUOTE_REGEX.test(lines[i])); i++) {
        quoted.push(lines[i].replace(QUOTE_REGEX, ''));
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted) });
      continue;
    }

    const item = LIST_REGEX.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const start = ordered ? parseInt(item[2], 10) : 1;
      const indent = item[1].length;
      const items = [];

      while (i < lines.length) {
        const marker = LIST_REGEX.exec(lines[i]);
        if (!marker || marker[1].length !== indent || /\d/.test(marker[2]) !== ordered) {
          break;
        }

        // the content of an item is indented as far as its text, anything less
        // indented (but more than the marker) still belongs to it
        const content = marker[0].length - (marker[3].length > 4 ? marker[3].length - 1 : 0);
        const body = [lines[i].slice(marker[0].length)];
        for (i++; i < lines.length; i++) {
          const next = lines[i];
          if (!next.trim()) {
            // a blank line continues the item if more of it follows indented
            const following = lines.slice(i + 1).find(e => e.trim());
            if (following !== undefined && indentOf(following) > indent && !(LIST_REGEX.test(following) && indentOf(following) <= indent)) {
              body.push('');
              continue;
            }
            break;
          }
          if (indentOf(next) > indent) {
            body.push(next.slice(Math.min(content, indentOf(next))));
          } else if (!startsBlock(next) && body[body.length - 1].trim()) {
            // a lazy continuation of the item's paragraph
            body.push(next.trim());
          } else {
            break;
          }
        }

        items.push(parseBlocks(body));
        // blank lines between the items of a loose list
        while (i < lines.length && !lines[i].trim() && lines.slice(i).find(e => e.trim()) && LIST_REGEX.exec(lines.slice(i).find(e => e.trim()))?.[1].length === indent) {
          i++;
        }
      }

      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR_REGEX.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = tableCells(line);
      const align = tableCells(lines[i + 1]).map(e => e.endsWith(':') ? (e.startsWith(':') ? 'center' : 'right') : 'left');
      const rows = [];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) {
        rows.push(tableCells(lines[i]));
      }
      blocks.push({ type: 'table', header, align, rows });
      continue;
    }

    const paragraph = [];
    for (; i < lines.length && lines[i].trim() && !(paragraph.length && startsBlock(lines[i])) && !MACRO_REGEX.test(lines[i]); i++) {
      paragraph.push(lines[i]);
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

// the inline markup, tried in this order at every position; each returns the
// text nodes of what it matched, given the style around it
const INLINE = [
  // \* and the like
  [/\\([!-/:-@[-`{-~])/y, (m) => [{ text: m[1] }]],
  // two spaces or a backslash at the end of a line
  [/(?: {2,}|\\)\n/y, () => [{ text: '\n' }]],
  [/(`+)(.+?)\1(?!`)/ys, (m) => [{ text: m[2].replace(/\n/g, ' ').trim() || m[2], code: true }]],
  // images in a line of text, those on their own are taken out beforehand
  [/!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/y, (m) => [{ text: `[${m[1] || 'Bild'}]` }]],
  [/\[((?:\\.|[^\]])+)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/y, (m, inner) => inner(m[1], { link: m[2] })],
  [/<((?:https?|mailto):[^>\s]+)>/y, (m) => [{ text: m[1], link: m[1] }]],
  // dokuwiki: [[page|label]] and {{ :media |label}}
  [/\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/y, (m, inner) => inner(m[2] || m[1].trim(), /^https?:/.test(m[1].trim()) ? { link: m[1].trim() } : {})],
  [/\{\{\s*([^|}]+?)\s*(?:\|([^}]*))?\}\}/y, (m) => [{ text: (m[2] || m[1]).trim() }]],
  [/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/ys, (m, inner) => inner(m[2], { bold: true })],
  [/~~(?=\S)(.+?)(?<=\S)~~/ys, (m, inner) => inner(m[1], { decoration: 'lineThrough' })],
  [/\*(?=\S)(.+?)(?<=\S)\*(?!\*)/ys, (m, inner) => inner(m[1], {})],
  // not inside words, as in file_name_here
  [/(?<![\p{L}\p{N}])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/ysu, (m, inner) => inner(m[1], {})],
  [/(?:https?:\/\/)[^\s<]*[^\s<.,:;"')\]]/y, (m) => [{ text: m[0], link: m[0] }]],
];

// markup that can start at a character, so that plain text is skipped in one go
const SPECIAL_REGEX = /[\\ `![<{*_~h]/g;

function parseInline(text, style = {}) {
  const nodes = [];
  let plain = '';
  let i = 0;

  const flush = () => {
    if (plain) {
      nodes.push({ text: plain.replace(/\n/g, ' '), ...style });
      plain = '';
    }
  };

  while (i < text.length) {
    let matched = false;
    for (const [regex, convert] of INLINE) {
      regex.lastIndex = i;
      const m = regex.exec(text);
      if (m) {
        flush();
        // before converting, which parses the inner text with the same regexes
        i = m.index + m[0].length;
        for (const node of convert(m, (inner, add) => parseInline(inner, { ...style, ...add }))) {
          nodes.push({ ...style, ...node });
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      SPECIAL_REGEX.lastIndex = i + 1;
      const next = SPECIAL_REGEX.exec(text);
      const end = next ? next.index : text.length;
      plain += text.slice(i, end);
      i = end;
    }
  }
  flush();

  return nodes.map(({ code, link, ...node }) => ({
    ...node,
    ...(code ? { background: '#eeeeee' } : {}),
    ...(link ? { link: absoluteLink(link), color: '#0066aa' } : {}),
  }));
}

// where links to the wiki's own pages and media point to, set for each document
let wikiBase = '';

// ":inventar:v-gm000123:foto.jpg", the media of the wiki, by its absolute id
const mediaUrl = (src, base = wikiBase) => `${base}/lib/exe/fetch.php?${new URLSearchParams({ media: src.replace(/^:/, '') })}`;

// links to media and pages of the wiki are relative, the pdf needs them whole
const absoluteLink = (link) => /^[a-z]+:/i.test(link) || !wikiBase
  ? link
  : link.startsWith(':') ? mediaUrl(link) : new URL(link, `${wikiBase}/`).href;

const STANDALONE_IMAGES_REGEX = /^(?:\s*!\[[^\]]*\]\(\s*<?[^)\s>]*>?(?:\s+"[^"]*")?\s*\)\s*)+$/;
const IMAGE_REGEX = /!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g;

function collectImages(blocks, found = new Set()) {
  for (const block of blocks) {
    if (block.type === 'paragraph' && STANDALONE_IMAGES_REGEX.test(block.text)) {
      for (const [, , src] of block.text.matchAll(IMAGE_REGEX)) {
        found.add(src);
      }
    }
    block.blocks && collectImages(block.blocks, found);
    block.items?.forEach(e => collectImages(e, found));
  }
  return found;
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

// pdfmake embeds jpeg and png only, anything else is shown by its alt text
async function loadImage(src, base) {
  const url = /^https?:\/\//.test(src) ? src : src.startsWith(':') ? mediaUrl(src, base) : null;
  if (!url) {
    return null;
  }

  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) {
      return null;
    }
    return await blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

const HEADING_SIZES = [14, 12, 11, 10, 9.5, 9];

// pdfmake nodes, fresh on every call, as pdfmake changes the nodes it lays out
function toNodes(blocks, images, width) {
  return blocks.map((block, index) => {
    const space = index > 0 ? 4 : 0;
    switch (block.type) {
      case 'heading':
        return { text: parseInline(block.text), fontSize: HEADING_SIZES[block.level - 1], bold: true, margin: [0, index > 0 ? 8 : 0, 0, 0], headlineLevel: block.level };
      case 'rule':
        return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: .5, lineColor: '#999999' }], margin: [0, space + 2, 0, 2] };
      case 'code':
        return {
          table: { widths: ['*'], body: [[{ text: block.text, preserveLeadingSpaces: true, fontSize: 8 }]] },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#f2f2f2', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3 },
          margin: [0, space, 0, 0]
        };
      case 'quote':
        return {
          table: { widths: ['*'], body: [[{ stack: toNodes(block.blocks, images, width - 10), color: '#555555' }]] },
          layout: { hLineWidth: () => 0, vLineWidth: (i) => i === 0 ? 2 : 0, vLineColor: () => '#cccccc', paddingLeft: () => 6, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
          margin: [0, space, 0, 0]
        };
      case 'list':
        return {
          [block.ordered ? 'ol' : 'ul']: block.items.map(e => ({ stack: toNodes(e, images, width - 15) })),
          ...(block.ordered && block.start !== 1 ? { start: block.start } : {}),
          margin: [0, space, 0, 0]
        };
      case 'table':
        return {
          table: {
            headerRows: 1,
            body: [
              block.header.map((e, i) => ({ text: parseInline(e), bold: true, alignment: block.align[i] })),
              ...block.rows.map(row => block.header.map((_, i) => ({ text: parseInline(row[i] || ''), alignment: block.align[i] })))
            ]
          },
          fontSize: 8,
          layout: {
            hLineColor: () => '#999999',
            vLineColor: () => '#999999',
            hLineWidth: () => .5,
            vLineWidth: () => .5,
            fillColor: (i) => i === 0 ? '#eeeeee' : null
          },
          margin: [0, space, 0, 0]
        };
      default:
        if (STANDALONE_IMAGES_REGEX.test(block.text)) {
          return {
            stack: [...block.text.matchAll(IMAGE_REGEX)].map(([, alt, src]) => images.get(src)
              ? { image: images.get(src), fit: [width, 200], margin: [0, 2, 0, 2] }
              : { text: `[${alt || 'Bild'}]`, color: '#666666' }),
            margin: [0, space, 0, 0]
          };
        }
        return { text: parseInline(block.text), margin: [0, space, 0, 0] };
    }
  });
}

// The page content, ready to lay out: nodes() returns the pdfmake nodes for a
// column of the given width, as often as needed. wiki is where links to its
// pages and media point to in the pdf, media where its images are loaded
// from (the wiki itself unless given). Images are loaded up front, those that
// cannot be are shown by their alt text.
export async function markdownContent(markdown, { wiki = '', media = wiki } = {}) {
  const base = wiki.replace(/\/+$/, '');
  const blocks = parseBlocks(String(markdown || '').replaceAll('\r\n', '\n').replaceAll('\t', '    ').split('\n'));
  const sources = [...collectImages(blocks)];
  const images = new Map((await Promise.all(sources.map(async (src) => [src, await loadImage(src, media.replace(/\/+$/, ''))])))
    .filter(([, e]) => e));

  return {
    empty: blocks.length === 0,
    nodes: (width) => {
      wikiBase = base;
      return toNodes(blocks, images, width);
    }
  };
}
