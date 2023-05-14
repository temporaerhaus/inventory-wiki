<template>
  <button @click="genLabel">
    <mdi-icon icon="qrcode-plus" left />
    Inventaraufkleber Erstellen
  </button>

  <x-dialog title="Inventaraufkleber" icon="qrcode-plus" ref="dialog">
    <iframe style="width: 100%; height: 100%;" :src="dataURL" v-if="dataURL" ref="iframe"></iframe>

    <a :href="dataURL" :download="`VSH_Inventaraufkleber_${inventoryId}.pdf`">
        <mdi-icon icon="file-download-outline" />
        PDF Herunterladen
    </a>

    <a @click.prevent="printLabel()" v-if="dataURL" style="margin-left: 1em;" href="#">
        <mdi-icon icon="printer" />
        Aufkleber Drucken
    </a>
  </x-dialog>
</template>

<script>
import QRCode from 'qrcode';

import logo from '@/assets/logo.svg?raw';
import pdfMake from 'pdfmake/build/pdfmake';

pdfMake.fonts = {
   freemono: {
     bold: 'https://cdn.jsdelivr.net/gh/googlefonts/RobotoMono@main/fonts/ttf/RobotoMono-Bold.ttf',
     normal: 'https://cdn.jsdelivr.net/gh/googlefonts/RobotoMono@main/fonts/ttf/RobotoMono-Regular.ttf',
   },
};

function mm2pt(mm) {
  return mm / 25.4 * 72;
}

export default {
    data: () => ({
        pdf: null,
        dataURL: null
    }),

    props: {
        title: String,
        inventoryId: String,
        description: String
    },

    mounted() {
        if (location.hash === '#print-label') {
            history.replaceState('', '', '#');
            this.genLabel();
        }
    },

    methods: {
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
            const svg = await this.createQRCode(id);
            return new Promise((resolve) => {
                const pdf = pdfMake.createPdf({
                    pageSize: {
                        width: mm2pt(95),
                        height: mm2pt(24)
                    },
                    pageOrientation: 'landscape',
                    pageMargins: 0,

                    defaultStyle: {
                        font: 'freemono',
                        fontSize: 9,
                    },

                    content: [{
                        columnGap: mm2pt(.5),
                        margins: 0,
                        columns: [{
                            svg: svg,
                            width: mm2pt(18),
                            margin: [mm2pt(0), mm2pt(3), mm2pt(3), mm2pt(3)],
                        }, {
                            width: '*',
                            margin: [mm2pt(3), mm2pt(1.7), mm2pt(2), mm2pt(3)],
                            stack: [{
                                bold: true,
                                fontSize: 11,
                                text: id.toUpperCase(),
                                margin: [ mm2pt(0), mm2pt(0), mm2pt(0), mm2pt(.5) ]
                            }, {
                                text: title,
                                margin: [ mm2pt(0), mm2pt(0), mm2pt(0), mm2pt(.5) ],
                            }, {
                                text: description,
                                lineHeight: .8,
                                fontSize: 8
                            }]
                        }, {
                            svg: logo,
                            margin: [mm2pt(0), mm2pt(3)],
                            width: mm2pt(13.45)
                        }]
                    }]
                });
                pdf.getDataUrl((dataURL) => resolve([pdf, dataURL]));
            });
        },

        async genLabel() {
            [this.pdf, this.dataURL] = await this.createPDF(this.inventoryId, this.title, this.description);
            this.$refs.dialog.show();
        },

        printLabel() {
            const win = window.open('', '_blank');
            this.pdf?.print?.({}, win);
        }
    }
}
</script>