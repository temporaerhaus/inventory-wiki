<template>
  <button @click="startScan()" v-if="reprint">
    <mdi-icon icon="qrcode-plus" left />
    Scannen und Drucken
  </button>
  <button @click="startScan()" v-else>
    <mdi-icon icon="qrcode-scan" left />
    Inventaraufkleber Scannen
  </button>

  <x-dialog title="Inventaraufkleber Scannen" icon="qrcode-scan" ref="dialog" @close="stopScan()" @open="$refs.scan.focus()" @keydown.enter="onScanSuccess($refs.scan.value)">
    <input type="text" autofocus placeholder="V-XX012345..." ref="scan" />
    <div id="qrcode-scanner"></div>
  </x-dialog>
</template>

<script>
import { Html5QrcodeScanner } from 'html5-qrcode';

import { remotePrint } from '@/utils/api.js';

export default {
  props: {
    reprint: Boolean,
  },

  data: () => ({
    scanner: null,
  }),

  mounted() {
    if (location.hash === '#scan') {
      history.replaceState('', '', '#');
      this.startScan();
    }
  },

  methods: {
    startScan() {
      this.$refs.dialog.show();
      this.scanner = new Html5QrcodeScanner('qrcode-scanner', {
        formatsToSupport: [0],
        fps: 1,
      });
      this.scanner.render(this.onScanSuccess);
    },

    stopScan() {
      if (this.scanner) {
        this.scanner.clear();
      }
    },

    onScanSuccess(decodedText) {
      if (this.reprint) {
        remotePrint(decodedText)
          .then(() => this.$refs.dialog.close())
          .catch((e) => alert(`Fehler: ${e.message}`));
      } else if (/^[SVL]-[A-Z]{2}[0-9]{6}(-[A-Z])?$/.test(decodedText)) {
        // new inventory number
        location.pathname = `/inventar/${decodedText}`;
      } else {
        location.href = `/start?do=search&q=${encodeURIComponent(decodedText)}`;
      }
    },
  }
}
</script>