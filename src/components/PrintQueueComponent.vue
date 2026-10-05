<template>
  <button @click="open()">
    <mdi-icon icon="tray-full" left />
    Druckwarteschlange
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
        </div>
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
import { PREFIX, fetchInventory, fetchPrintQueue, removeFromPrintQueue } from '@/utils/api.js';

// the label printer looks at the queue every 10 seconds
const REFRESH = 10 * 1000;
const CONTENTS_REGEX = /^inhaltsliste:([^:]+)(?::([0-9]+))?$/i;

export default {
  data: () => ({
    PREFIX,
    loading: false,
    loaded: false,
    error: '',
    entries: [],
    titles: {},
    timer: null,
  }),

  computed: {
    // one row per entry, in the order of the queue; an entry queued twice is printed once
    rows() {
      const seen = new Set();
      return this.entries
        .filter(e => !seen.has(e.toUpperCase()) && seen.add(e.toUpperCase()))
        .map((entry) => {
          const contents = CONTENTS_REGEX.exec(entry);
          const id = (contents ? contents[1] : entry).toUpperCase();
          return { entry, id, title: this.titles[id] || '', levels: contents ? Number(contents[2] || 0) : null };
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

      // the titles are only for display, the queue does without them
      fetchInventory()
        .then(items => this.titles = Object.fromEntries(items.map(e => [e.id, e.title])))
        .catch(() => {});
    },

    stopRefresh() {
      clearInterval(this.timer);
      this.timer = null;
    },

    async load({ quiet = false } = {}) {
      if (this.loading) {
        return;
      }

      this.loading = !quiet;
      try {
        this.entries = await fetchPrintQueue();
        this.error = '';
        this.loaded = true;
      } catch (e) {
        this.error = e.message;
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
        await this.remove(this.entries);
      }
    }
  },

  beforeUnmount() {
    this.stopRefresh();
  }
}
</script>
