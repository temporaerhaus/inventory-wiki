<template>
  <button @click="startScan()" v-if="reprint">
    <mdi-icon icon="qrcode-plus" left />
    Scannen und Drucken
  </button>
  <button @click="startScan()" v-else>
    <mdi-icon icon="qrcode-scan" left />
    Inventaraufkleber Scannen
  </button>

  <x-dialog title="Inventaraufkleber Scannen" icon="qrcode-scan" ref="dialog" @close="stopScan()" @open="$refs.scan.focus()" @keydown.enter="onScanSuccess($refs.scan.value)" v-if="id">
    <input type="text" autofocus placeholder="V-XX012345..." ref="scan" />
    <div :id="id"></div>
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
    id: null,
    scanner: null,
  }),

  mounted() {
    this.id = `qrcode-scan-${(Math.random() + 1).toString(36).substring(7)}`;
    if (location.hash === '#scan') {
      history.replaceState('', '', '#');
      this.startScan();
    }
  },

  methods: {
    async startScan() {
      await this.$refs.dialog.show();
      this.scanner = new Html5QrcodeScanner(this.id, {
        rememberLastUsedCamera: true,
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

    async onScanSuccess(decodedText) {
      if (this.reprint) {
        try {
          this.$refs.scan.value = '';
          const res = await fetch(`/inventar/${decodedText}`);
          if (res.status === 404) {
            throw new Error('Gegenstand existiert nicht');
          }
          await remotePrint(decodedText);
        } catch (e) {
          alert(`Fehler: ${e.message}`);
        } finally {
          await this.$refs.dialog.close();
        }
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
