<template>
  <button @click="genLabel">
    <mdi-icon icon="qrcode-plus" left />
    Inventaraufkleber Erstellen
  </button>

  <x-dialog title="Inventaraufkleber" icon="qrcode-plus" ref="dialog">
    <div class="invwiki-preview" :style="{ width: `${mm2pt(95)}pt`, height: `${mm2pt(24)}pt` }">
        <img :src="`data:image/svg+xml,${encodeURIComponent(svg)}`" v-if="svg" alt=""  :style="{ width: `${mm2pt(18)}pt`, height: 'auto', marginRight: `${mm2pt(3)}pt` }" />
        <div :style="{ paddingTop: `${mm2pt(1.7)}pt`, paddingBottom: `${mm2pt(1.7)}pt`, paddingRight: `${mm2pt(1.7)}pt` }">
            <div style="font-size: 11pt; font-weight: bold;">{{ inventoryId }}</div>
            <div :style="{paddingTop: `${mm2pt(.5)}pt`, paddingBottom: `${mm2pt(.5)}pt`}">{{ title }}</div>
            <div style="font-size: 8pt; line-height: 8pt; white-space: pre-wrap;">{{ fullDescription }}</div>
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
   freemono: {
     bold: 'https://cdn.jsdelivr.net/gh/googlefonts/RobotoMono@main/fonts/ttf/RobotoMono-Bold.ttf',
     normal: 'https://cdn.jsdelivr.net/gh/googlefonts/RobotoMono@main/fonts/ttf/RobotoMono-Regular.ttf',
   },
};

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
            return new Promise((resolve) => {
                const pdf = pdfMake.createPdf({
                    pageSize: {
                        width: this.small ? this.mm2pt(50) : this.mm2pt(95),
                        height: this.small ? this.mm2pt(12) : this.mm2pt(24)
                    },
                    pageOrientation: 'landscape',
                    pageMargins: 0,

                    defaultStyle: {
                        font: 'freemono',
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
                                fontSize: 6,
                                text: id.toUpperCase(),
                                margin: [ this.mm2pt(0), this.mm2pt(0), this.mm2pt(0), this.mm2pt(.4) ]
                            }, {
                                text: title,
                                fontSize: 5,
                                margin: [ this.mm2pt(0), this.mm2pt(0), this.mm2pt(0), this.mm2pt(.4) ],
                            }, {
                                text: description,
                                lineHeight: .8,
                                fontSize: 4
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
                                text: title,
                                margin: [ this.mm2pt(0), this.mm2pt(0), this.mm2pt(0), this.mm2pt(.5) ],
                            }, {
                                text: description,
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
                this.$refs.dialog.close();
            } catch (e) {
                this.printing = false;
                alert(`Fehler: ${e.message}`);
            }
        }
    },

    computed: {
        fullDescription() {
            if (String(this.inventoryId).startsWith('L-') && this.owner) {
                return `Besitzer*in: ${this.owner}\n${this.description}`;
            }
            return this.description;
        }

    }
}
</script>