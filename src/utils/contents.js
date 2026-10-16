// A list of items to tick off, on A4 landscape pages in two columns: the
// contents list of a container (ContentsListComponent) and the checklist of
// selected items (ChecklistComponent). Each row has a box to tick, the
// inventory number, and the title and description of the item.
import QRCode from 'qrcode';

import logo from '@/assets/logo-full.svg?raw';
import { mm2pt } from '@/utils/pdf.js';

const qrCode = (s) => QRCode.toString(s, { margin: 0, type: 'svg', errorCorrectionLevel: 'Q' });

// name and description of an item, one line each, cut to what fits
const titleCell = (row, fit, width) => ({ stack: [
  { text: fit(row.title, width, 8.5) },
  { text: fit(row.description.replace(/\s+/g, ' '), width, 6.5), fontSize: 6.5, color: '#555555' }
] });

// rows: [{ id, title, description, depth }], depth 0 for the items listed
// directly, 1 and more for the contents of sub containers below them.
// kind is what the list is, above the heading; inventoryId, if there is one,
// is the container the list belongs to, with its QR code in the header.
// url is linked in the footer, empty is what the page says without rows.
export async function contentsDocument({ kind, heading, subheading = '', inventoryId = '', rows, url = '', empty }) {
  const created = new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  const qr = inventoryId ? await qrCode(inventoryId) : null;

  // a table cannot flow from one column into the next, so the rows are split
  // into columns and pages up front. For that every row has the same height:
  // one line of title and one of description, cut to what fits. Roboto Mono
  // is monospaced, so what fits is a matter of counting characters.
  const page = { width: mm2pt(297), height: mm2pt(210) };
  const margin = { side: mm2pt(12), top: mm2pt(32), bottom: mm2pt(14) };
  const gap = mm2pt(8);
  const column = (page.width - 2 * margin.side - gap) / 2;
  // box: column of the boxes to tick off, boxSize: the drawn box itself,
  // boxGap: space between the box of a sub item and its inventory number
  const widths = { box: mm2pt(5), boxSize: mm2pt(3), boxGap: mm2pt(2), id: mm2pt(30) };
  const padding = 4;
  const line = .5;
  const charWidth = (fontSize) => fontSize * .6;
  const fit = (text, width, fontSize) => {
    const max = Math.floor(width / charWidth(fontSize));
    return text.length > max ? `${text.slice(0, Math.max(max - 1, 0))}…` : text;
  };

  const titleWidth = column - widths.box - widths.id - 6 * padding - 4 * line;
  const heights = { header: 12, row: 21 };
  const rowHeight = heights.row + 4 + line;
  const available = page.height - margin.top - margin.bottom - (heights.header + 4 + 2 * line + 1);
  // a few points of slack, so rounding in the layout never pushes a row onto a new page
  const rowsPerColumn = Math.max(1, Math.floor((available - 5) / rowHeight));

  const table = (rows) => ({
    table: {
      headerRows: 1,
      widths: [widths.box, widths.id, '*'],
      heights: (i) => i === 0 ? heights.header : heights.row,
      body: [
        [{ text: '' }, { text: 'Inventarnummer', bold: true }, { text: 'Gegenstand', bold: true }],
        ...rows.map(row => {
          const room = widths.id - 2 * padding;
          // the font has no ballot box glyph, so the box to tick off is drawn
          const box = { canvas: [{ type: 'rect', x: 0, y: 1, w: widths.boxSize, h: widths.boxSize, lineWidth: .7, lineColor: '#333333' }], width: widths.boxSize };

          if (row.depth === 0) {
            return [box, { text: fit(row.id, room, 8.5), bold: true }, titleCell(row, fit, titleWidth)];
          }

          // sub items carry their box in front of the inventory number, so it moves in with them:
          // on the first level the box takes up the start of the column, every further level
          // moves box and number further in, but never so far that the number has to be cut
          const numberRoom = room - widths.boxSize - widths.boxGap;
          const indent = Math.max(0, Math.min(mm2pt(5) * (row.depth - 1), numberRoom - row.id.length * charWidth(8.5)));
          return [
            { text: '' },
            {
              columns: [box, { text: fit(row.id, numberRoom - indent, 8.5), width: '*' }],
              columnGap: widths.boxGap,
              margin: [indent, 0, 0, 0]
            },
            titleCell(row, fit, titleWidth)
          ];
        })
      ]
    },
    fontSize: 8.5,
    layout: {
      hLineColor: () => '#999999',
      vLineColor: () => '#999999',
      hLineWidth: (i) => i === 1 ? 1 : line,
      vLineWidth: () => line,
      fillColor: (i) => i === 0 ? '#eeeeee' : null
    }
  });

  const pages = [];
  for (let i = 0; i < rows.length; i += 2 * rowsPerColumn) {
    pages.push([
      rows.slice(i, i + rowsPerColumn),
      rows.slice(i + rowsPerColumn, i + 2 * rowsPerColumn)
    ]);
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [margin.side, margin.top, margin.side, margin.bottom],
    info: { title: [kind, inventoryId || heading].filter(Boolean).join(' ') },
    defaultStyle: { font: 'Roboto', fontSize: 9 },

    header: () => ({
      columns: [
        ...(qr ? [{
          svg: qr,
          width: mm2pt(18)
        }] : []), {
          width: '*',
          margin: [qr ? mm2pt(4) : 0, 0, 0, 0],
          stack: [
            { text: kind, fontSize: 8, color: '#666666' },
            { text: heading, fontSize: 14, bold: true },
            { text: subheading, fontSize: 10 },
            { text: `${rows.length} ${rows.length === 1 ? 'Gegenstand' : 'Gegenstände'} · Stand ${created}`, fontSize: 7, color: '#666666' }
          ]
        }, {
          // 910 × 380, at the height of the QR code
          svg: logo,
          width: mm2pt(18) * 910 / 380
        }
      ],
      margin: [margin.side, mm2pt(8), margin.side, 0]
    }),

    footer: (current, count) => ({
      columns: [
        url ? { text: url, link: url, color: '#0066aa' } : { text: '' },
        { text: `Seite ${current} von ${count}`, alignment: 'right', color: '#666666' }
      ],
      fontSize: 7,
      margin: [margin.side, mm2pt(5), margin.side, 0]
    }),

    content: pages.length ? pages.map(([left, right], i) => ({
      columns: [
        { width: column, ...table(left) },
        right.length ? { width: column, ...table(right) } : { width: column, text: '' }
      ],
      columnGap: gap,
      ...(i > 0 ? { pageBreak: 'before' } : {})
    })) : [{
      text: empty, color: '#666666'
    }]
  };
}
