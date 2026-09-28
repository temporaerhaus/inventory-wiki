<template>
  <button @click="open">
    <mdi-icon icon="format-list-checks" left />
    Inhaltsliste Erstellen
  </button>

  <x-dialog :title="`Inhaltsliste ${inventoryId}`" icon="format-list-checks" ref="dialog" :loading="loading || printing">
    <label :for="`${uid}-levels`">
      <mdi-icon icon="package-variant" left title="Unter-Behälter" />
      Inhalt von Unter-Behältern auflisten
    </label>
    <select :id="`${uid}-levels`" v-model.number="levels" @change="generate()" :disabled="loading">
      <option :value="0">Nein, nur direkt enthaltene Gegenstände</option>
      <option :value="1">1 Ebene tief</option>
      <option :value="2">2 Ebenen tief</option>
      <option :value="3">3 Ebenen tief</option>
      <option :value="maxDepth">Alle Ebenen</option>
    </select>

    <p v-if="loading">Lade beinhaltete Gegenstände …</p>
    <p v-else-if="error">Fehler: {{ error }}</p>
    <template v-else-if="blobURL">
      <p>{{ rows.length }} {{ rows.length === 1 ? 'Gegenstand' : 'Gegenstände' }}{{ nested ? ', inklusive Inhalt von Unter-Behältern' : '' }}.</p>
      <iframe :src="blobURL" class="invwiki-contents-preview hide-mobile" title="Vorschau der Inhaltsliste"></iframe>

      <a :href="blobURL" :download="`Inhaltsliste_${inventoryId}.pdf`">
        <mdi-icon icon="file-download-outline" />
        PDF Herunterladen
      </a>

      <a @click.prevent="print()" style="margin-left: 1em;" href="#">
        <mdi-icon icon="printer" />
        Drucken
      </a>

      <a @click.prevent="printRemote()" style="margin-left: 1em;" href="#" :disabled="printing">
        <mdi-icon icon="cloud-print-outline" />
        Remote Drucken
      </a>
    </template>
  </x-dialog>
</template>

<script>
import QRCode from 'qrcode';
import { markRaw } from 'vue';

import pdfMake, { mm2pt } from '@/utils/pdf.js';
import { fetchInventoryItem, remotePrintContents, searchItems } from '@/utils/api.js';

// "all levels" still stops here, to deal with potential circular links
const MAX_DEPTH = 10;

export default {
  props: {
    inventoryId: String,
    title: String
  },

  data: () => ({
    uid: `invwiki-contents-${Math.round(Math.random() * 10000)}`,
    maxDepth: MAX_DEPTH,
    // how many levels of sub containers to list the contents of, none by default
    levels: 0,
    loading: false,
    printing: false,
    error: '',
    rows: [],
    pdf: null,
    blobURL: null
  }),

  computed: {
    nested() {
      return this.rows.some(e => e.depth > 0);
    }
  },

  methods: {
    // all items located in a container, depth first, contents of sub containers right below them
    async collect(containerId, depth = 0, seen = new Set([containerId.toUpperCase()])) {
      const ids = (await searchItems(`location: ${containerId}`)).filter(id => !seen.has(id));
      ids.forEach(id => seen.add(id));

      const items = (await Promise.all(ids.map(async (id) => ({ id, item: await fetchInventoryItem(id) }))))
        .filter(e => e.item)
        .sort((a, b) => a.id.localeCompare(b.id));

      const rows = [];
      for (const { id, item } of items) {
        rows.push({ id, title: item.title || '', description: item.description || '', depth });
        if (item.container && depth < Math.min(this.levels, MAX_DEPTH)) {
          rows.push(...await this.collect(id, depth + 1, seen));
        }
      }

      return rows;
    },

    qrCode(s) {
      return QRCode.toString(s, { margin: 0, type: 'svg', errorCorrectionLevel: 'Q' });
    },

    // name and description of an item, one line each, cut to what fits
    titleCell(row, fit, width) {
      return { stack: [
        { text: fit(row.title, width, 8.5) },
        { text: fit(row.description.replace(/\s+/g, ' '), width, 6.5), fontSize: 6.5, color: '#555555' }
      ] };
    },

    async createPDF() {
      const created = new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
      const qrCode = await this.qrCode(this.inventoryId);

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
                return [box, { text: fit(row.id, room, 8.5), bold: true }, this.titleCell(row, fit, titleWidth)];
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
                this.titleCell(row, fit, titleWidth)
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
      for (let i = 0; i < this.rows.length; i += 2 * rowsPerColumn) {
        pages.push([
          this.rows.slice(i, i + rowsPerColumn),
          this.rows.slice(i + rowsPerColumn, i + 2 * rowsPerColumn)
        ]);
      }

      return pdfMake.createPdf({
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [margin.side, margin.top, margin.side, margin.bottom],
        info: { title: `Inhaltsliste ${this.inventoryId}` },
        defaultStyle: { font: 'Roboto', fontSize: 9 },

        header: () => ({
          columns: [{
            svg: qrCode,
            width: mm2pt(18)
          }, {
            width: '*',
            margin: [mm2pt(4), 0, 0, 0],
            stack: [
              { text: 'Inhaltsliste', fontSize: 8, color: '#666666' },
              { text: this.inventoryId, fontSize: 14, bold: true },
              { text: this.title || '', fontSize: 10 },
              { text: `${this.rows.length} ${this.rows.length === 1 ? 'Gegenstand' : 'Gegenstände'} · Stand ${created}`, fontSize: 7, color: '#666666' }
            ]
          }],
          margin: [margin.side, mm2pt(8), margin.side, 0]
        }),

        footer: (current, count) => ({
          columns: [
            { text: `${this.inventoryId} · Stand ${created}`, color: '#666666' },
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
          text: 'Keine Gegenstände an diesem Ort.', italics: true
        }]
      });
    },

    open() {
      this.levels = 0;
      this.$refs.dialog.show();
      this.generate();
    },

    async generate() {
      this.loading = true;
      this.error = '';

      try {
        this.rows = await this.collect(this.inventoryId);
        // pdfmake's document must not be wrapped in a reactive proxy, some of its properties are read-only
        this.pdf = markRaw(await this.createPDF());

        if (this.blobURL) {
          URL.revokeObjectURL(this.blobURL);
        }
        this.blobURL = URL.createObjectURL(await new Promise(resolve => this.pdf.getBlob(resolve)));
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    print() {
      const win = window.open('', '_blank');
      this.pdf?.print?.({}, win);
    },

    // the print station builds the list itself, with the same depth of sub containers
    async printRemote() {
      if (this.printing) {
        return;
      }

      this.printing = true;
      try {
        await remotePrintContents(this.inventoryId, this.levels);
        this.$refs.dialog.close();
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.printing = false;
      }
    }
  }
}
</script>
