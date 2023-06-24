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
    <video ref="scanner"></video>
    <div style="margin-top: -5.5em; padding: 2em; text-align: right; margin-bottom: .5em;">
      <mdi-icon :icon="!flash ? 'flashlight' : 'flashlight-off'" style="filter: invert(1); scale: 200%; margin-right: 2em;" @click="toggleFlash()" v-if="hasFlash || true" />
      <mdi-icon icon="sync-circle" style="filter: invert(1); scale: 200%;" @click="swapCamera()" v-if="cameras?.length > 1" />
    </div>
  </x-dialog>
</template>

<script>
import QrScanner from 'qr-scanner';

import { remotePrint } from '@/utils/api.js';

export default {
  props: {
    reprint: Boolean,
  },

  data: () => ({
    scanner: null,
    cameras: null,
    current: null,
    hasFlash: false,
    flash: false
  }),

  mounted() {
    if (location.hash === '#scan') {
      history.replaceState('', '', '#');
      this.startScan();
    }
  },

  destroy() {
    this.scanner?.stop?.();
    this.scanner?.destroy?.();
  },

  methods: {
    async startScan() {
      await this.$refs.dialog.show();
      this.scanner = new QrScanner(this.$refs.scanner, e => this.onScanSuccess(e?.data), {
        highlightScanRegion: true
      });
      await this.scanner.start();
      this.cameras = await QrScanner.listCameras();
      this.hasFlash = await this.scanner.hasFlash();
      this.flash = await this.scanner.isFlashOn();
    },

    stopScan() {
      this.scanner?.stop?.();
      this.scanner?.destroy?.();
      this.scanner = null;
      this.cameras = null;
      this.current = null;
    },

    async onScanSuccess(decodedText) {
      if (!decodedText) {
        return;
      }

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

    async swapCamera() {
      this.current = ((this.current || 0) + 1) % this.cameras.length;
      console.log(this.current);
      await this.scanner.setCamera(this.cameras[this.current].id);
      this.hasFlash = await this.scanner.hasFlash();
      this.flash = await this.scanner.isFlashOn();
    },

    async toggleFlash() {
      await this.scanner.toggleFlash();
      this.flash = await this.scanner.isFlashOn();
    }
  }
}
</script>
