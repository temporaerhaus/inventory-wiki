<template>
  <button @click="startScan()">
    <mdi-icon icon="qrcode-scan" left />
    Inventaraufkleber Scannen
  </button>

  <x-dialog title="Inventaraufkleber Scannen" icon="qrcode-scan" ref="dialog" @close="stopScan()">
    <div id="qrcode-scanner"></div>
  </x-dialog>
</template>

<script>
import { Html5QrcodeScanner } from 'html5-qrcode';

export default {
  data: () => ({
    scanner: null,
  }),

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
      if (/^[SVL]-[A-Z]{2}[0-9]{6}(-[A-Z])?$/.test(decodedText)) {
        // new inventory number
        location.pathname = `/inventar/${decodedText}`;
      } else {
        location.href = `/start?do=search&q=${encodeURIComponent(decodedText)}`;
      }
    },

  }
}
</script>