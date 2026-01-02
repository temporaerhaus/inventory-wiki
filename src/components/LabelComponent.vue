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
    <div class="invwiki-preview" :style="{ width: `${mm2pt(95)}pt`, height: `${mm2pt(24)}pt` }">
        <img :src="`data:image/svg+xml,${encodeURIComponent(svg)}`" v-if="svg" alt=""  :style="{ width: `${mm2pt(18)}pt`, height: 'auto', marginRight: `${mm2pt(3)}pt` }" />
        <div :style="{ paddingTop: `${mm2pt(1.7)}pt`, paddingBottom: `${mm2pt(1.7)}pt`, paddingRight: `${mm2pt(1.7)}pt`, width: `${mm2pt(95-18-13.45-3-3-2)}pt` }">
            <div style="font-size: 11pt; font-weight: bold;">{{ inventoryId }}</div>
            <div :style="{paddingTop: `${mm2pt(.5)}pt`, paddingBottom: `${mm2pt(.5)}pt`, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'}">{{ title }}</div>
            <div style="font-size: 8pt; line-height: 8pt; white-space: pre-wrap; textOverflow: ellipsis; overflow: hidden; max-height: 42px;">{{ fullDescription }}</div>
        </div>
        <img :src="`data:image/svg+xml,${encodeURIComponent(logo)}`" v-if="logo" alt="" :style="{ width: `${mm2pt(13.45)}pt`, height: 'auto', marginLeft: `${mm2pt(3)}pt` }" />
    </div>

    <a :href="dataURL" :download="`VSH_Inventaraufkleber_${inventoryId}.pdf`">
        <mdi-icon icon="file-download-outline" />
        PDF Herunterladen
    </a>

    <a @click.prevent="printLabel()" v-if="dataURL" style="margin-left: 1em;" href="#" class="hide-mobile">
        <mdi-icon icon="printer" />
        Lokal Drucken
    </a>

    <a @click.prevent="printRemote()" v-if="dataURL" style="margin-left: 1em;" href="#" :disabled="printing">
        <mdi-icon icon="cloud-print-outline" />
        Remote Drucken
    </a>
  </x-dialog>
</template>

<script>
import QRCode from 'qrcode';

import logo from '@/assets/logo.svg?raw';
import pdfMake from 'pdfmake/build/pdfmake';

import { remotePrint } from '@/utils/api.js';

pdfMake.fonts = {
   Roboto: {
     bold: 'https://cdn.jsdelivr.net/gh/googlefonts/RobotoMono@main/fonts/ttf/RobotoMono-Bold.ttf',
     normal: 'https://cdn.jsdelivr.net/gh/googlefonts/RobotoMono@main/fonts/ttf/RobotoMono-Regular.ttf',
   },
};

function textMaxWidth(content) {
  return new Promise((resolve) => pdfMake.createPdf({
    defaultStyle: { font: 'Roboto' },
    content: [{text: content, noWrap: true }],
    pageMargins: [0, 0, 0, 0],
  }).getStream({}, d => resolve(d.x)));
}

async function truncateText(text, options) {
  const { maxWidth, fontSize } = options;
  const { length } = text;
  let b = length;
  const trunc = (len) => {
    len = Math.max(Math.round(len, 0), 1);
    return len < length ? `${text.slice(0, len - 1)}…` : text;
  };
  const f = async (len) => (await textMaxWidth({ text: trunc(len), fontSize, })) - maxWidth;
  let bx = await f(b);
  if (bx > 0) {
    let a = 0, ax = await f(0);
    if (ax >= 0) {
      return '…';
    }
    if (Math.abs(ax) < Math.abs(bx)) {
      [a, ax, b, bx] = [b, bx, a, ax];
    }
    const xTol = 1;
    let c = a, cx = ax, mflag = true, d, maxIter = 20;
    while (maxIter-- && Math.abs(b - a) > xTol) {
      const acx = ax - cx;
      const bcx = bx - cx;
      const abx = ax - bx;
      let s = Math.abs(acx) > Number.EPSILON && Math.abs(bcx) > Number.EPSILON ?
        a * bx * cx / (abx * acx) + b * ax * cx / (-abx * bcx) + c * ax * bx / (acx * bcx) :
        b - bx * (b - a) / (bx - ax);
      if (s < (3 * a + b) / 4 || s > b || (
        mflag ?
          (Math.abs(s - b) >= Math.abs(b - c) / 2 || Math.abs(b - c) < Math.abs(2 * Number.EPSILON * Math.abs(b))) :
          (Math.abs(s - b) >= Math.abs(c - d) / 2 || Math.abs(c - d) < Math.abs(2 * Number.EPSILON * Math.abs(b)))
      )) {
        s = (a + b) / 2;
        mflag = true;
      } else {
        mflag = false;
      }

      const sx = await f(s);
      [d, c, cx] = [c, b, bx];
      if (ax * sx < 0) {
        [b, bx] = [s, sx];
      } else {
        [a, ax] = [s, sx];
      }

      if (Math.abs(ax) < Math.abs(bx)) {
        [a, ax, b, bx] = [b, bx, a, ax];
      }
    }
    return trunc(ax < bx ? a : b);
  }
  return text;
};

async function shortenDescription(text, options) {
  const output = [];
  const stack = text.split('\n');

  while (stack.length > 0 && output.length < options.maxLines) {
    let line = stack.shift();
    const tmp = await truncateText(line, options);
    const pos = tmp.indexOf('…');
    if (pos >= 0) {
      output.push(tmp.slice(0, pos));
      stack.unshift(line.slice(pos));
    } else if (tmp.length > 0) {
      output.push(tmp);
    }
  }

  return output.filter(e => e).slice(0, options.maxLines + 1).join('\n');
}

export default {
    data: () => ({
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

        async createPDF(id, title, description) {
            this.svg = await this.createQRCode(id);
            return new Promise(async (resolve) => {
                const pdf = pdfMake.createPdf({
                    pageSize: {
                        width: this.small ? this.mm2pt(50) : this.mm2pt(95),
                        height: this.small ? this.mm2pt(12) : this.mm2pt(24)
                    },
                    pageOrientation: 'landscape',
                    pageMargins: 0,

                    defaultStyle: {
                        font: 'Roboto',
                        fontSize: 9,
                    },

                    content: [{
                        columnGap: this.mm2pt(.5),
                        margins: 0,
                        columns: this.small ? [{
                            svg: this.svg,
                            width: this.mm2pt(10),
                            margin: [this.mm2pt(0), this.mm2pt(1), this.mm2pt(3), this.mm2pt(1)],
                        }, {
                            width: '*',
                            margin: [this.mm2pt(1), this.mm2pt(.3), this.mm2pt(1), this.mm2pt(3)],
                            stack: [{
                                bold: true,
                                fontSize: 7,
                                text: id.toUpperCase(),
                                margin: [ this.mm2pt(0), this.mm2pt(0), this.mm2pt(0), this.mm2pt(.1) ]
                            }, {
                                text: await truncateText(title, { fontSize: 6, maxWidth: this.mm2pt(50 - 10 - 7.5 - 3) }),
                                fontSize: 6,
                                margin: [ this.mm2pt(0), this.mm2pt(0), this.mm2pt(0), this.mm2pt(.1) ],
                            }, {
                                text: await shortenDescription(description, { fontSize: 6, maxWidth: this.mm2pt(50 - 10 - 7.5 - 3), maxLines: 2 }),
                                lineHeight: .8,
                                fontSize: 6
                            }]
                        }, {
                            svg: logo,
                            margin: [this.mm2pt(0), this.mm2pt(1)],
                            width: this.mm2pt(7.5)
                        }] : [{
                            svg: this.svg,
                            width: this.mm2pt(18),
                            margin: [this.mm2pt(0), this.mm2pt(3), this.mm2pt(3), this.mm2pt(3)],
                        }, {
                            width: '*',
                            margin: [this.mm2pt(3), this.mm2pt(1.7), this.mm2pt(2), this.mm2pt(3)],
                            stack: [{
                                bold: true,
                                fontSize: 11,
                                text: id.toUpperCase(),
                                margin: [ this.mm2pt(0), this.mm2pt(0), this.mm2pt(0), this.mm2pt(.5) ]
                            }, {
                                fontSize: 9,
                                text: await truncateText(title, { fontSize: 9, maxWidth: this.mm2pt(90 - 18 - 13.45 - 2) }),
                                margin: [ this.mm2pt(0), this.mm2pt(0), this.mm2pt(0), this.mm2pt(.5) ],
                            }, {
                                text: await shortenDescription(description, { fontSize: 8, maxWidth: this.mm2pt(90 - 18 - 13.45 - 2), maxLines: 3 }),
                                lineHeight: .8,
                                fontSize: 8
                            }]
                        }, {
                            svg: logo,
                            margin: [this.mm2pt(0), this.mm2pt(3)],
                            width: this.mm2pt(13.45)
                        }]
                    }]
                });
                pdf.getDataUrl((dataURL) => resolve([pdf, dataURL]));
            });
        },

        async genLabel() {
            [this.pdf, this.dataURL] = await this.createPDF(this.inventoryId, this.title, this.fullDescription);
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
            let description = this.description;

            if (String(this.inventoryId).startsWith('L-') && this.owner) {
                description = `Eigentümer*in: ${this.owner}\n${description}`;
            }

            if (this.serial) {
                description = `S/N: ${this.serial}\n${description}`;
            }

            return description;
        }

    }
}
</script>
