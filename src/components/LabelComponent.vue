<template>
  <button @click="genLabel" v-if="$root.yaml">
    <mdi-icon icon="qrcode-plus" left />
    Inventaraufkleber Erstellen
  </button>

  <x-dialog title="Inventaraufkleber" icon="qrcode-plus" ref="dialog">
    <iframe style="width: 100%; height: 100%;" :src="dataURL" v-if="dataURL"></iframe>

    <a :href="dataURL" :download="`VSH_Inventaraufkleber_${$root.id}.pdf`">
        <mdi-icon icon="file-download-outline" />
        PDF Herunterladen
    </a>
  </x-dialog>
</template>

<script>
import QRCode from 'qrcode';

import logo from '@/assets/logo.svg?raw';
import label from '@/assets/label.svg?raw';
import pdfMake from 'pdfmake/build/pdfmake';

pdfMake.fonts = {
   freemono: {
     normal: 'https://cdn.jsdelivr.net/gh/opensourcedesign/fonts@master/gnu-freefont_freemono/FreeMono.ttf'
   },
};

function mm2pt(mm) {
  return mm / 25.4 * 72;
}

export default {
    data: () => ({
        dataURL: null
    }),

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
            return new Promise((resolve) => pdfMake.createPdf({
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
                        width: mm2pt(24)
                    }, {
                        width: '*',
                        margin: [mm2pt(0), mm2pt(3)],
                        text: `${title}\n${id}\n${description}`
                    }, {
                        svg: logo,
                        margin: [mm2pt(0), mm2pt(3)],
                        width: mm2pt(12.4)
                    }, {
                        svg: label,
                        margin: [mm2pt(0), mm2pt(3)],
                        width: mm2pt(1.7)
                    }, {
                        text: '',
                        width: mm2pt(2)
                    }]
                }]
            }).getDataUrl((dataURL) => resolve(dataURL)));
        },

        async genLabel() {
            this.dataURL = await this.createPDF(this.$root.id, this.$root.title, this.$root.description);
            this.$refs.dialog.show();
        }
    }
}
</script>