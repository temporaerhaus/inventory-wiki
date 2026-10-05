<template>
  <button @click="open()" title="Druckwarteschlange" aria-label="Druckwarteschlange">
    <mdi-icon icon="tray-full" left />
    <span class="invwiki-toolbar-label">Druckwarteschlange</span>
    <span class="invwiki-print-queue-summary" v-if="summary.length > 0">
      <span v-for="part in summary" :key="part.key" :title="part.title">
        <mdi-icon :icon="part.icon" v-if="part.icon" />{{ part.emoji }}{{ part.count }}
      </span>
    </span>
  </button>

  <x-dialog title="Druckwarteschlange" icon="tray-full" ref="dialog" :loading="loading" @close="stopRefresh()">
    <p v-if="error">Fehler: {{ error }}</p>
    <p v-else-if="loaded && entries.length === 0">Die Druckwarteschlange ist leer.</p>
    <ul class="invwiki-print-queue" v-else>
      <li v-for="entry in rows" :key="entry.entry">
        <mdi-icon :icon="entry.levels === null ? 'qrcode' : 'format-list-checks'" :title="entry.levels === null ? 'Inventaraufkleber' : 'Inhaltsliste'" left />
        <div>
          <a :href="`/${PREFIX}/${entry.id}`"><b>{{ entry.id }}</b></a><template v-if="entry.title">: {{ entry.title }}</template>
          <small v-if="entry.levels !== null">
            Inhaltsliste{{ entry.levels > 0 ? `, Unter-Behälter ${entry.levels} ${entry.levels === 1 ? 'Ebene' : 'Ebenen'} tief` : '' }}
          </small>
          <small v-else-if="entry.small">🤏 Kleiner Aufkleber</small>
          <small v-else-if="entry.small === false">Normaler Aufkleber</small>
        </div>
        <span class="invwiki-print-queue-count" v-if="entry.levels === null" title="Anzahl Aufkleber">
          <button type="button" title="Ein Aufkleber weniger" @click="setCount(entry, entry.count - 1)" :disabled="loading || entry.count <= 1">
            <mdi-icon icon="minus" title="Ein Aufkleber weniger" />
          </button>
          <input type="number" min="1" :max="MAX_COPIES" :value="entry.count" @change="setCount(entry, $event.target.value, $event.target)" :disabled="loading" aria-label="Anzahl Aufkleber" autocomplete="off" />
          <button type="button" title="Ein Aufkleber mehr" @click="setCount(entry, entry.count + 1)" :disabled="loading || entry.count >= MAX_COPIES">
            <mdi-icon icon="plus" title="Ein Aufkleber mehr" />
          </button>
        </span>
        <button type="button" title="Aus der Druckwarteschlange entfernen" @click="remove([entry.entry])" :disabled="loading">
          <mdi-icon icon="delete-outline" title="Aus der Druckwarteschlange entfernen" />
        </button>
      </li>
    </ul>
    <blockquote>
      Der Etikettendrucker holt sich die Einträge regelmäßig ab und entfernt sie hier, sobald sie gedruckt sind.
      Ein Eintrag, der hier entfernt wird, wird nicht mehr gedruckt, sofern der Druck nicht schon läuft.
    </blockquote>

    <template #footer>
      <button @click="removeAll()" :disabled="loading || entries.length === 0" class="invwiki-delete">
        <mdi-icon icon="delete-outline" left />
        Alle entfernen
      </button>
      <button @click="load()" :disabled="loading">
        <mdi-icon icon="refresh" left />
        Aktualisieren
      </button>
    </template>
  </x-dialog>
</template>

<script>
import { PREFIX, MAX_COPIES, PRINT_QUEUE_CHANGED_EVENT, clampCount, changePrintQueue, fetchInventoryItem, fetchPrintQueue, removeFromPrintQueue } from '@/utils/api.js';

// the label printer looks at the queue every 10 seconds, the open dialog
// follows it as closely; the counts on the button can lag a bit more
const REFRESH = 10 * 1000;
const REFRESH_BUTTON = 30 * 1000;
const CONTENTS_REGEX = /^inhaltsliste:([^:]+)(?::([0-9]+))?$/i;

export default {
  data: () => ({
    PREFIX,
    MAX_COPIES,
    loading: false,
    loaded: false,
    error: '',
    entries: [],
    // id => {title, small} of the queued items, see loadItems
    items: {},
    timer: null,
    buttonTimer: null,
    request: 0,
  }),

  computed: {
    // how many labels of each kind are queued, with all their copies, and how
    // many contents lists; an item counts once its label size is known
    summary() {
      const sum = (rows) => rows.reduce((total, e) => total + e.count, 0);
      const labels = this.rows.filter(e => e.levels === null);
      const parts = [{
        key: 'large',
        icon: 'qrcode',
        count: sum(labels.filter(e => e.small === false)),
        title: (n) => `${n} ${n === 1 ? 'normaler Aufkleber' : 'normale Aufkleber'}`,
      }, {
        key: 'small',
        emoji: '🤏',
        count: sum(labels.filter(e => e.small === true)),
        title: (n) => `${n} ${n === 1 ? 'kleiner Aufkleber' : 'kleine Aufkleber'}`,
      }, {
        key: 'contents',
        icon: 'format-list-checks',
        count: this.rows.length - labels.length,
        title: (n) => `${n} ${n === 1 ? 'Inhaltsliste' : 'Inhaltslisten'}`,
      }];
      return parts.filter(e => e.count > 0).map(e => ({ ...e, title: e.title(e.count) }));
    },

    // one row per entry, in the order of the queue
    rows() {
      return this.entries.map(({ entry, count }) => {
        const contents = CONTENTS_REGEX.exec(entry);
        const id = (contents ? contents[1] : entry).toUpperCase();
        // small is unknown (null) until the item is loaded
        const { title = '', small = null } = this.items[id] || {};
        return { entry, count, id, title, small, levels: contents ? Number(contents[2] || 0) : null };
      });
    }
  },

  methods: {
    async open() {
      this.$refs.dialog.show();
      this.loaded = false;
      await this.load();
      this.stopRefresh();
      this.timer = setInterval(() => this.load({ quiet: true }), REFRESH);
    },

    // the title and label size of the queued items, each looked up once; they
    // are only for display, the queue does without them
    loadItems() {
      for (const { id } of this.rows) {
        if (id in this.items) {
          continue;
        }

        this.items[id] = {};
        fetchInventoryItem(id)
          .then(item => this.items[id] = item ? { title: item.title || '', small: Boolean(item.small) } : {})
          .catch(() => {});
      }
    },

    onChanged() {
      this.load({ quiet: true });
    },

    stopRefresh() {
      clearInterval(this.timer);
      this.timer = null;
    },

    async load({ quiet = false } = {}) {
      if (this.loading) {
        return;
      }

      // the answer to an older look must not replace the one to a newer
      const request = ++this.request;
      this.loading = !quiet;
      try {
        const entries = await fetchPrintQueue();
        if (request === this.request) {
          this.entries = entries;
          this.error = '';
          this.loaded = true;
          this.loadItems();
        }
      } catch (e) {
        if (request === this.request) {
          this.error = e.message;
        }
      } finally {
        this.loading = false;
      }
    },

    async remove(entries) {
      this.loading = true;
      try {
        await removeFromPrintQueue(entries);
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.loading = false;
      }
      await this.load();
    },

    async removeAll() {
      if (confirm(`Alle ${this.rows.length} Einträge aus der Druckwarteschlange entfernen?`)) {
        await this.remove(this.entries.map(e => e.entry));
      }
    },

    async setCount(row, count, input = null) {
      count = clampCount(count);
      // e.g. a typed 9 is a 5
      if (input) {
        input.value = count;
      }
      if (count === row.count) {
        return;
      }

      this.loading = true;
      try {
        await changePrintQueue([{ entry: row.entry, count }]);
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.loading = false;
      }
      await this.load();
    }
  },

  mounted() {
    this.load({ quiet: true });
    // added to from anywhere on the page: a label, the scanner, the selection
    window.addEventListener(PRINT_QUEUE_CHANGED_EVENT, this.onChanged);
    // not while nobody looks at the page
    this.buttonTimer = setInterval(() => document.hidden || this.load({ quiet: true }), REFRESH_BUTTON);
  },

  beforeUnmount() {
    this.stopRefresh();
    clearInterval(this.buttonTimer);
    window.removeEventListener(PRINT_QUEUE_CHANGED_EVENT, this.onChanged);
  }
}
</script>
