<template>
  <button @click="startScan()" v-if="direct">
    <mdi-icon icon="package-variant-plus" left />
    Gegenstand hineinlegen
  </button>
  <button @click="startScan()" v-else-if="!pick" title="Inventaraufkleber Scannen" aria-label="Inventaraufkleber Scannen">
    <mdi-icon icon="qrcode-scan" left />
    <span class="invwiki-toolbar-label">Inventaraufkleber Scannen</span>
  </button>

  <x-dialog :title="title || (direct ? `In ${container} legen` : 'Inventaraufkleber Scannen')" icon="qrcode-scan" ref="dialog" @close="onClose()" @open="focusInput()" @keydown.enter="onScanSuccess($refs.scan.value)">
    <!-- what to do with a scanned item -->
    <div class="invwiki-scan-result" v-if="scanned && !direct">
      <p>
        <mdi-icon icon="toy-brick-outline" left />
        <b>{{ scanned.id }}</b><template v-if="scanned.title">: {{ scanned.title }}</template>
        <small v-if="scanned.loading">Lade …</small>
        <small v-else-if="scanned.missing">Es gibt keinen Gegenstand mit dieser Nummer.</small>
      </p>

      <div class="invwiki-scan-actions">
        <!-- on the overview, to pick items for the selection menu by scanning them -->
        <button v-if="selectable" @click="selectScanned()" :disabled="busy || scanned.loading || scanned.missing">
          <mdi-icon :icon="scannedSelected ? 'checkbox-blank-outline' : 'checkbox-marked-outline'" left />
          {{ scannedSelected ? 'Auswahl aufheben' : 'Auswählen' }}
        </button>
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

    <div v-show="!scanned || direct">
      <!-- in direct mode, how scanned items are put into the container -->
      <div class="invwiki-scan-mode" v-if="direct" role="radiogroup" aria-label="Hineinlegen als">
        <button
          v-for="option in modes"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="mode === option.value"
          :class="{ 'is-active': mode === option.value }"
          @click="mode = option.value"
        >
          <mdi-icon :icon="option.icon" left />
          {{ option.label }}
        </button>
      </div>

      <!-- what was done with the scanned items: the newest one, while the
           older ones are behind "Verlauf", so that the camera keeps its room;
           scanning goes on for the next item, and each can be undone -->
      <ul class="invwiki-scan-log" v-if="(direct && scanned) || log.length > 0">
        <li class="is-latest is-pending" v-if="direct && scanned">
          <mdi-icon icon="package-variant" left />
          <span>{{ scanned.id }} wird hineingelegt …</span>
        </li>
        <li v-for="(entry, i) in shownLog" :key="entry.key" :class="{ 'is-latest': i === 0 && !(direct && scanned), 'is-error': entry.error, 'is-undone': entry.undone }">
          <mdi-icon :icon="entry.error ? 'alert-circle-outline' : entry.undone ? 'undo-variant' : 'check-circle-outline'" left />
          <span>{{ entry.text }}<template v-if="entry.undone"> (rückgängig gemacht)</template></span>
          <button type="button" v-if="entry.undo && !entry.undone" @click="undo(entry)" :disabled="busy" title="Rückgängig" aria-label="Rückgängig">
            <mdi-icon icon="undo-variant" left />
            <span class="invwiki-scan-undo-label">Rückgängig</span>
          </button>
        </li>
      </ul>
      <div class="invwiki-scan-summary" v-if="(direct && putCount > 0) || log.length > 1">
        <span v-if="direct && putCount > 0">
          <mdi-icon icon="package-variant" left />
          {{ putCount }} hineingelegt
        </span>
        <button type="button" class="invwiki-scan-history" v-if="log.length > 1" @click="showHistory = !showHistory" :aria-expanded="showHistory">
          <mdi-icon :icon="showHistory ? 'menu-up' : 'menu-down'" left />
          Verlauf ({{ log.length }})
        </button>
      </div>

      <input type="text" class="invwiki-scan-input" placeholder="V-XX012345..." ref="scan" autocomplete="off" />
      <!-- framed green or red for a moment after each scan -->
      <div :class="['invwiki-scan-video', signal ? `is-${signal}` : '']">
        <video ref="scanner"></video>
      </div>
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
const MODE_STORAGE_KEY = 'invwiki-scan-into-mode';

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
    // put every scanned item into the container right away, rather than
    // asking what to do with it
    direct: Boolean,
    // the page has a selection of items (the overview), which scanned items
    // can be added to ("select" event: inventory number, whether selected)
    selectable: Boolean,
    // the inventory numbers selected on the page
    selectedIds: { type: Array, default: () => [] },
  },

  emits: ['scan', 'select'],

  data: () => ({
    LOCATION_CURRENT,
    LOCATION_REGULAR,
    // the two ways the direct mode puts items into the container
    modes: [
      { value: LOCATION_CURRENT, label: 'Aktueller Ort', icon: 'map-clock-outline' },
      { value: LOCATION_REGULAR, label: 'Regulärer Ort', icon: 'content-save-alert-outline' },
    ],
    scanner: null,
    cameras: null,
    current: null,
    hasFlash: false,
    flash: false,

    // {id, title, loading, missing} of the scanned item, while its actions are shown
    scanned: null,
    busy: false,
    // [{key, text, error, undo, undone, put}] of what was done with the
    // scanned items, newest first; undo, if there is one, takes it back
    log: [],
    logKey: 0,
    // whether the older entries of the log are shown too
    showHistory: false,
    // 'ok' or 'error' for a moment after a scan, which frames the camera
    signal: '',
    signalTimer: null,
    // how the direct mode puts items into the container, remembered
    mode: LOCATION_CURRENT,
    last: { id: '', time: 0 },
    // whether an item was put into the container, whose page is then reloaded
    changedContainer: false,
    // whether the action that is running puts an item into the container
    putting: false,
  }),

  computed: {
    // the newest entry, or all of them when the history is open
    shownLog() {
      return this.showHistory ? this.log : this.log.slice(0, 1);
    },

    scannedSelected() {
      return Boolean(this.scanned) && this.selectedIds.includes(this.scanned.id);
    },

    // the items put into the container in this session, and not taken out again
    putCount() {
      return this.log.filter(e => e.put && !e.undone).length;
    },

    canPutIntoContainer() {
      return Boolean(this.container) && this.scanned && !this.scanned.missing && this.scanned.id !== this.container.toUpperCase();
    }
  },

  watch: {
    mode(value) {
      try {
        localStorage.setItem(MODE_STORAGE_KEY, String(value));
      } catch {
        // ignore
      }
    }
  },

  mounted() {
    try {
      const mode = Number(localStorage.getItem(MODE_STORAGE_KEY));
      if (mode === LOCATION_REGULAR) {
        this.mode = mode;
      }
    } catch {
      // ignore
    }

    if (!this.pick && !this.direct && location.hash === '#scan') {
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
      this.log = [];
      this.showHistory = false;
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

    // The field takes what a barcode scanner types, so it has the focus; but
    // not on a phone, whose keyboard would come up and cover the camera
    focusInput() {
      if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
        this.$refs.scan.focus();
      }
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

      // that the camera has read a code, before anything is done with it
      if (camera) {
        navigator.vibrate?.(40);
      }

      this.scanned = { id: upper, title: '', loading: true, missing: false };
      try {
        const item = await fetchInventoryItem(upper);
        this.scanned = { id: upper, title: item?.title || '', loading: false, missing: !item };
      } catch {
        this.scanned = { id: upper, title: '', loading: false, missing: false };
      }

      if (this.direct) {
        if (this.scanned.missing) {
          this.done(`Es gibt keinen Gegenstand ${upper}.`, null, true);
        } else {
          await this.putIntoContainer(this.mode);
        }
      }
    },

    // back to scanning, for the next item, with what was done on top of the log
    done(text, undo = null, error = false) {
      this.last = { id: this.scanned?.id || '', time: Date.now() };
      this.log.unshift({ key: ++this.logKey, text, undo, error, undone: false, put: this.putting });
      this.putting = false;
      this.scanned = null;
      this.notify(error ? 'error' : 'ok');
      this.$nextTick(() => this.focusInput());
    },

    // that something happened, for whoever looks at the camera rather than at
    // the text: a frame around it, and a buzz on phones that can
    notify(kind) {
      clearTimeout(this.signalTimer);
      this.signal = kind;
      this.signalTimer = setTimeout(() => this.signal = '', 800);
      navigator.vibrate?.(kind === 'error' ? [80, 60, 80, 60, 80] : 120);
    },

    selectScanned() {
      const { id, title } = this.scanned;
      const select = !this.scannedSelected;
      // the page's selection follows the event, after this
      const count = this.selectedIds.length + (select ? 1 : -1);
      this.$emit('select', id, select);
      this.done(
        `${title ? `${id} (${title})` : id} ${select ? 'ausgewählt' : 'nicht mehr ausgewählt'}, ${count} ${count === 1 ? 'Gegenstand' : 'Gegenstände'} ausgewählt.`,
        () => this.$emit('select', id, !select)
      );
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

    // refusals and errors are reported like the results, so that scanning
    // goes on without a dialog to click away
    async putIntoContainer(mode) {
      const { id, title } = this.scanned;
      const name = title ? `${id} (${title})` : id;
      this.busy = true;
      try {
        const loop = await locationLoop([id], this.container, mode);
        if (loop) {
          this.done(loop, null, true);
          return;
        }
        // where it was, to put it back if this is undone
        let before = null;
        const path = `/${PREFIX}/${id}`;
        await writeItem(path, {}, {
          summary: `location update (mode=${mode})`,
          replacer: (yaml) => {
            before = JSON.parse(JSON.stringify({
              nominal: yaml.nominal ?? {},
              temporary: yaml.temporary ?? {},
              lastSeenAt: yaml.lastSeenAt ?? '',
            }));
            return setLocation(yaml, mode, { location: this.container.toUpperCase() });
          }
        });
        this.changedContainer = true;
        this.putting = true;
        // the direct mode has the container in its title, and the mode above
        this.done(
          this.direct
            ? `${name} hineingelegt.`
            : `${name} liegt jetzt ${mode === LOCATION_CURRENT ? 'vorübergehend' : 'regulär'} in ${this.container.toUpperCase()}${this.containerTitle ? ` (${this.containerTitle})` : ''}.`,
          () => writeItem(path, {}, {
            summary: 'location update undone',
            replacer: (yaml) => Object.assign(yaml, before)
          })
        );
      } catch (e) {
        this.done(`${id}: ${e.message}`, null, true);
      } finally {
        this.busy = false;
      }
    },

    async undo(entry) {
      this.busy = true;
      try {
        await entry.undo();
        entry.undone = true;
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
