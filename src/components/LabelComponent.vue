<template>
  <button @click="genLabel">
    <mdi-icon icon="qrcode-plus" left />
    Inventaraufkleber Erstellen
  </button>

  <x-dialog icon="qrcode-plus" ref="dialog" :loading="printing">
    <template #title>
      Inventaraufkleber
      <span title="Kleiner Aufkleber" style="float: right;margin-right:2em;" v-if="small">🤏</span>
    </template>
    <!-- the label as the pdf has it: the same layout, the same lines of the
         title and description (fitted to the label by label.js), and every
         line where pdfmake puts it, which css line boxes, rounded to pixels,
         cannot do; in pt, as the pdf. The size as a style, as the wiki sizes
         svg elements as icons. -->
    <svg class="invwiki-preview" :style="{ width: `${mm2pt(layout.width)}pt`, height: `${mm2pt(layout.height)}pt` }" :viewBox="`0 0 ${mm2pt(layout.width)} ${mm2pt(layout.height)}`" :font-family="`'${LABEL_FONT}', 'Roboto Mono', monospace`">
      <image v-if="svg" :href="`data:image/svg+xml,${encodeURIComponent(svg)}`" x="0" :y="mm2pt(layout.qr.margin[1])" :width="mm2pt(layout.qr.width)" :height="mm2pt(layout.qr.width)" />
      <text v-for="(line, i) in previewLines" :key="i" :x="textX" :y="line.y" :font-size="line.size" :font-weight="line.bold ? 'bold' : 'normal'" xml:space="preserve">{{ line.text }}</text>
      <image :href="`data:image/svg+xml,${encodeURIComponent(logo)}`" :x="mm2pt(layout.width - layout.logo.width)" :y="mm2pt(layout.logo.margin[1])" :width="mm2pt(layout.logo.width)" :height="mm2pt(layout.logo.width * LOGO_ASPECT)" />
    </svg>

    <template #footer>
      <a :href="dataURL" :download="`Inventaraufkleber_${inventoryId}.pdf`">
        <mdi-icon icon="file-download-outline" />
        PDF Herunterladen
      </a>

      <a @click.prevent="printLabel()" v-if="dataURL" href="#" class="hide-mobile">
        <mdi-icon icon="printer" />
        Lokal Drucken
      </a>

      <a @click.prevent="printRemote()" v-if="dataURL" href="#" :disabled="printing">
        <mdi-icon icon="cloud-print-outline" />
        Remote Drucken
      </a>
    </template>
  </x-dialog>
</template>

<script>
import QRCode from 'qrcode';

import logo from '@/assets/logo.svg?raw';
import pdfMake, { LABEL_FONT, loadLabelFonts } from '@/utils/pdf.js';
import { LAYOUTS, labelDescription, shortenDescription, truncateText } from '@/utils/label.js';

import { remotePrint } from '@/utils/api.js';

// The two label sizes, in mm: the QR code, the text and the logo side by side.
// Margins as pdfmake has them, [left, top, right, bottom] or [horizontal,
// vertical]; idSize, titleSize and size are the font sizes in pt.
const GEOMETRY = {
    small: {
        width: 50,
        height: 12,
        qr: { width: 10, margin: [0, 1, 3, 1] },
        // no margin below the text: with two lines of description, it would make the
        // column higher than the label, which pdfmake spills onto a second, empty page
        text: { margin: [1, .3, 1, 0], idSize: 7, titleSize: 6, size: 6, gap: .1 },
        logo: { width: 7.5, margin: [0, 1] },
    },
    large: {
        width: 95,
        height: 24,
        // below the QR code a little less than the 3 mm above it: 3 + 18 + 3 mm is the
        // label's full height, which pdfmake (0.2.21 here) spills onto a second, empty page
        qr: { width: 18, margin: [0, 3, 3, 2.5] },
        text: { margin: [3, 1.7, 2, 3], idSize: 11, titleSize: 9, size: 8, gap: .5 },
        logo: { width: 13.45, margin: [0, 3] },
    },
};
const COLUMN_GAP = .5;
const DESCRIPTION_LINE_HEIGHT = .8;
// of Roboto Mono, in em: from the top of a line to its baseline, and
// ascender to descender, which is pdfmake's line height of 1
const ASCENDER = 2146 / 2048;
// height to width of the logo (240 × 320)
const LOGO_ASPECT = 320 / 240;
const LINE_HEIGHT = (2146 + 555) / 2048;

export default {
    data: () => ({
        LABEL_FONT,
        LOGO_ASPECT,
        svg: null,
        pdf: null,
        dataURL: null,
        logo: logo,
        printing: false
    }),

    props: {
        title: String,
        small: Boolean,
        inventoryId: String,
        description: String,
        serial: String,
        owner: String
    },

    mounted() {
        if (location.hash === '#print-label') {
            history.replaceState('', '', '#');
            this.genLabel();
        }
    },

    methods: {
        mm2pt(mm) {
            return mm / 25.4 * 72;
        },

        createQRCode(s) {
            return new Promise((resolve, reject) => QRCode.toString(s, {
                version: 1,
                margin: 0,
                type: 'svg',
                mode: 'alphanumeric',
                errorCorrectionLevel: 'Q'
            }, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            }));
        },

        async createPDF(id) {
            const { layout, printed } = this;
            this.svg = await this.createQRCode(id);
            return new Promise(async (resolve) => {
                const pdf = pdfMake.createPdf({
                    pageSize: {
                        width: this.mm2pt(layout.width),
                        height: this.mm2pt(layout.height)
                    },
                    pageOrientation: 'landscape',
                    pageMargins: 0,

                    defaultStyle: {
                        font: 'Roboto',
                        fontSize: 9,
                    },

                    content: [{
                        columnGap: this.mm2pt(COLUMN_GAP),
                        margins: 0,
                        columns: [{
                            svg: this.svg,
                            width: this.mm2pt(layout.qr.width),
                            margin: layout.qr.margin.map(this.mm2pt),
                        }, {
                            width: '*',
                            margin: layout.text.margin.map(this.mm2pt),
                            stack: [{
                                bold: true,
                                fontSize: layout.text.idSize,
                                text: id.toUpperCase(),
                                margin: [0, 0, 0, this.mm2pt(layout.text.gap)]
                            }, {
                                fontSize: layout.text.titleSize,
                                text: printed.title,
                                margin: [0, 0, 0, this.mm2pt(layout.text.gap)],
                            }, {
                                text: printed.description,
                                lineHeight: DESCRIPTION_LINE_HEIGHT,
                                fontSize: layout.text.size
                            }]
                        }, {
                            svg: logo,
                            margin: layout.logo.margin.map(this.mm2pt),
                            width: this.mm2pt(layout.logo.width)
                        }]
                    }]
                });
                pdf.getDataUrl((dataURL) => resolve([pdf, dataURL]));
            });
        },

        async genLabel() {
            [this.pdf, this.dataURL] = await this.createPDF(this.inventoryId);
            await loadLabelFonts();
            this.$refs.dialog.show();
        },

        printLabel() {
            const win = window.open('', '_blank');
            this.pdf?.print?.({}, win);
        },

        async printRemote() {
            try {
                this.printing = true;
                await remotePrint(this.inventoryId);
                this.printing = false;
                this.$refs.dialog.close();
            } catch (e) {
                this.printing = false;
                alert(`Fehler: ${e.message}`);
            }
        }
    },

    computed: {
        fullDescription() {
            return labelDescription(this);
        },

        layout() {
            return this.small ? GEOMETRY.small : GEOMETRY.large;
        },

        // what is printed of the title and the description
        printed() {
            const fit = LAYOUTS[this.small ? 'small' : 'large'];
            return {
                title: truncateText(this.title || '', { fontSize: fit.titleFontSize, maxWidth: fit.maxWidth }),
                description: shortenDescription(this.fullDescription, fit),
            };
        },

        // where the text starts: pdfmake leaves out the left and right margin
        // of the qr code in its column, the text's own margin counts
        textX() {
            return this.mm2pt(this.layout.qr.width + COLUMN_GAP + this.layout.text.margin[0]);
        },

        // the lines of text with their baselines, as pdfmake lays them out: a
        // line is as high as its line height, and its baseline is the
        // ascender below its top, whatever the line height
        previewLines() {
            const { text } = this.layout;
            const lines = [];
            let top = this.mm2pt(text.margin[1]);
            const add = (content, size, lineHeight, bold = false) => {
                lines.push({ text: content, size, bold, y: top + ASCENDER * size });
                top += LINE_HEIGHT * size * lineHeight;
            };

            add((this.inventoryId || '').toUpperCase(), text.idSize, 1, true);
            top += this.mm2pt(text.gap);
            if (this.printed.title) {
                add(this.printed.title, text.titleSize, 1);
            }
            top += this.mm2pt(text.gap);
            // pdfmake starts a wrapped line without the space it was wrapped at
            for (const line of this.printed.description.split('\n').map(e => e.replace(/^ +/, ''))) {
                add(line, text.size, DESCRIPTION_LINE_HEIGHT);
            }
            return lines;
        }

    }
}
</script>
