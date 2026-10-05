<template>
  <button @click="startScan()" v-if="!pick" title="Inventaraufkleber Scannen" aria-label="Inventaraufkleber Scannen">
    <mdi-icon icon="qrcode-scan" left />
    <span class="invwiki-toolbar-label">Inventaraufkleber Scannen</span>
  </button>

  <x-dialog :title="title || 'Inventaraufkleber Scannen'" icon="qrcode-scan" ref="dialog" @close="onClose()" @open="$refs.scan.focus()" @keydown.enter="onScanSuccess($refs.scan.value)">
    <!-- what to do with a scanned item -->
    <div class="invwiki-scan-result" v-if="scanned">
      <p>
        <mdi-icon icon="toy-brick-outline" left />
        <b>{{ scanned.id }}</b><template v-if="scanned.title">: {{ scanned.title }}</template>
        <small v-if="scanned.loading">Lade …</small>
        <small v-else-if="scanned.missing">Es gibt keinen Gegenstand mit dieser Nummer.</small>
      </p>

      <div class="invwiki-scan-actions">
        <button @click="openScanned()" :disabled="busy">
          <mdi-icon icon="open-in-new" left />
          {{ scanned.missing ? 'Gegenstand anlegen' : 'Öffnen' }}
        </button>
        <button @click="printScanned()" :disabled="busy || scanned.loading || scanned.missing">
          <mdi-icon icon="cloud-print-outline" left />
          Aufkleber drucken
        </button>
        <template v-if="canPutIntoContainer">
          <button @click="putIntoContainer(LOCATION_CURRENT)" :disabled="busy || scanned.loading">
            <mdi-icon icon="map-clock-outline" left />
            In {{ container }} legen (aktueller Ort)
          </button>
          <button @click="putIntoContainer(LOCATION_REGULAR)" :disabled="busy || scanned.loading">
            <mdi-icon icon="content-save-alert-outline" left />
            In {{ container }} legen (regulärer Ort)
          </button>
        </template>
        <button @click="$refs.dialog.close()" :disabled="busy">
          <mdi-icon icon="close" left />
          Abbrechen
        </button>
      </div>
    </div>

    <div v-show="!scanned">
      <!-- what the last action did, scanning goes on for the next item -->
      <blockquote class="invwiki-scan-status" v-if="status">
        {{ status.text }}
        <a href="#" v-if="status.undo" @click.prevent="undo()">Rückgängig</a>
      </blockquote>
      <input type="text" autofocus placeholder="V-XX012345..." ref="scan" autocomplete="off" />
      <video ref="scanner"></video>
      <div style="margin-top: -5.5em; padding: 2em; text-align: right; margin-bottom: .5em;">
        <mdi-icon :icon="!flash ? 'flashlight' : 'flashlight-off'" style="filter: invert(1); scale: 200%; margin-right: 2em;" @click="toggleFlash()" v-if="hasFlash || true" />
        <mdi-icon icon="sync-circle" style="filter: invert(1); scale: 200%;" @click="swapCamera()" v-if="cameras?.length > 1" />
      </div>
    </div>
  </x-dialog>
</template>

<script>
import QrScanner from 'qr-scanner';

import {
  PREFIX, LOCATION_CURRENT, LOCATION_REGULAR,
  fetchInventoryItem, locationLoop, remotePrint, removeFromPrintQueue, setLocation, writeItem
} from '@/utils/api.js';

const ID_REGEX = /^[SVL]-[A-Z]{2}[0-9]{6}(-[A-Z])?$/;
// the label just handled is still in front of the camera for a moment
const RESCAN_PAUSE = 4000;

export default {
  props: {
    // hand the scanned inventory number to the parent ("scan" event) instead
    // of asking what to do with it; the parent opens the scanner with startScan()
    pick: Boolean,
    title: String,
    // the inventory number of the page's item, if it is a container, which
    // scanned items can then be put into
    container: String,
    containerTitle: String,
  },

  emits: ['scan'],

  data: () => ({
    LOCATION_CURRENT,
    LOCATION_REGULAR,
    scanner: null,
    cameras: null,
    current: null,
    hasFlash: false,
    flash: false,

    // {id, title, loading, missing} of the scanned item, while its actions are shown
    scanned: null,
    busy: false,
    // {text, undo} of what the last action did
    status: null,
    last: { id: '', time: 0 },
    // whether an item was put into the container, whose page is then reloaded
    changedContainer: false,
  }),

  computed: {
    canPutIntoContainer() {
      return Boolean(this.container) && this.scanned && !this.scanned.missing && this.scanned.id !== this.container.toUpperCase();
    }
  },

  mounted() {
    if (!this.pick && location.hash === '#scan') {
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
      this.scanned = null;
      this.status = null;
      this.changedContainer = false;
      await this.$refs.dialog.show();
      this.scanner = new QrScanner(this.$refs.scanner, e => this.onScanSuccess(e?.data, true), {
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

    onClose() {
      this.stopScan();
      this.scanned = null;
      // its list of contents is part of the page
      if (this.changedContainer) {
        location.reload();
      }
    },

    // camera: read by the camera, rather than typed or sent by a barcode scanner
    async onScanSuccess(decodedText, camera = false) {
      if (!decodedText) {
        return;
      }

      // a label holds the inventory number, possibly as the address of its page
      const id = decodeURIComponent(String(decodedText).trim().replace(/\/+$/, '').split('/').pop());

      if (this.pick) {
        // the scanner reports every frame it reads, only the first one counts
        if (!this.scanner && !this.$refs.scan.value) {
          return;
        }
        this.$refs.scan.value = '';
        this.$refs.dialog.close();
        this.$emit('scan', id);
        return;
      }

      // one item at a time, and not the one just handled again because its
      // label is still in front of the camera
      const upper = id.toUpperCase();
      if (this.scanned || (camera && upper === this.last.id && Date.now() - this.last.time < RESCAN_PAUSE)) {
        return;
      }
      this.$refs.scan.value = '';

      if (!ID_REGEX.test(upper)) {
        location.href = `/start?do=search&q=${encodeURIComponent(decodedText)}`;
        return;
      }

      this.scanned = { id: upper, title: '', loading: true, missing: false };
      try {
        const item = await fetchInventoryItem(upper);
        this.scanned = { id: upper, title: item?.title || '', loading: false, missing: !item };
      } catch {
        this.scanned = { id: upper, title: '', loading: false, missing: false };
      }
    },

    // back to scanning, for the next item
    done(text, undo = null) {
      this.last = { id: this.scanned?.id || '', time: Date.now() };
      this.status = { text, undo };
      this.scanned = null;
      this.$nextTick(() => this.$refs.scan.focus());
    },

    openScanned() {
      location.pathname = `/${PREFIX}/${this.scanned.id}`;
    },

    async printScanned() {
      const { id } = this.scanned;
      this.busy = true;
      try {
        if ((await remotePrint(id)).length > 0) {
          this.done(`${id} wurde zur Druckwarteschlange hinzugefügt.`, () => removeFromPrintQueue([id]));
        } else {
          this.done(`${id} ist bereits in der Druckwarteschlange.`);
        }
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.busy = false;
      }
    },

    async putIntoContainer(mode) {
      const { id } = this.scanned;
      this.busy = true;
      try {
        const loop = await locationLoop([id], this.container, mode);
        if (loop) {
          alert(loop);
          return;
        }
        await writeItem(`/${PREFIX}/${id}`, {}, {
          summary: `location update (mode=${mode})`,
          replacer: (yaml) => setLocation(yaml, mode, { location: this.container.toUpperCase() })
        });
        this.changedContainer = true;
        this.done(`${id} liegt jetzt ${mode === LOCATION_CURRENT ? 'vorübergehend' : 'regulär'} in ${this.container.toUpperCase()}${this.containerTitle ? ` (${this.containerTitle})` : ''}.`);
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.busy = false;
      }
    },

    async undo() {
      const undo = this.status?.undo;
      if (!undo) {
        return;
      }

      this.busy = true;
      try {
        await undo();
        this.status = { text: 'Rückgängig gemacht.', undo: null };
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.busy = false;
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
