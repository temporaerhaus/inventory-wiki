<template>
  <button @click="open">
    <mdi-icon icon="table" left />
    Tabelle
  </button>

  <x-dialog title="Inventar als Tabelle" icon="table" ref="dialog" :loading="exporting || (loading && !items.length)" class="invwiki-table-dialog">
    <div>
      <blockquote v-if="error">{{ error }}</blockquote>

      <div class="invwiki-table-controls">
        <input type="search" v-model="search" placeholder="Suchen in allen sichtbaren Spalten" />

        <label class="invwiki-table-sort">
          Sortieren
          <select v-model="sort.key">
            <option v-for="column in shownColumns" :key="column.key" :value="column.key">{{ column.label }}</option>
          </select>
          <button @click="sort.desc = !sort.desc" :title="sort.desc ? 'absteigend' : 'aufsteigend'">
            <mdi-icon :icon="sort.desc ? 'menu-down' : 'menu-up'" />
          </button>
        </label>

        <details class="invwiki-table-filters">
          <summary>Filter{{ activeFilters ? ` (${activeFilters})` : '' }}</summary>
          <label v-for="column in shownColumns" :key="column.key">
            {{ column.label }}
            <input type="search" v-model="filters[column.key]" />
          </label>
        </details>

        <details>
          <summary>Spalten</summary>
          <label v-for="column in columns" :key="column.key">
            <input type="checkbox" :checked="visible.includes(column.key)" :disabled="column.key === 'id'" @change="toggleColumn(column.key)" />
            {{ column.label }}
          </label>
        </details>

        <button @click="exportCsv()" :disabled="!total">
          <mdi-icon icon="file-delimited-outline" left />
          CSV
        </button>
        <button @click="applySelection()" v-if="checked.length">
          <mdi-icon icon="checkbox-multiple-marked-outline" left />
          {{ checked.length }} auswählen und schließen
        </button>
      </div>

      <table class="invwiki-table" :class="{ 'invwiki-table-busy': loading }">
        <thead>
          <tr>
            <th>
              <input type="checkbox" :checked="allChecked" @change="toggleAll()" title="Alle auf dieser Seite auswählen" />
            </th>
            <th v-for="column in shownColumns" :key="column.key" @click="sortBy(column.key)">
              {{ column.label }}
              <mdi-icon v-if="sort.key === column.key" :icon="sort.desc ? 'menu-down' : 'menu-up'" />
            </th>
          </tr>
          <tr>
            <th></th>
            <th v-for="column in shownColumns" :key="column.key">
              <input type="search" v-model="filters[column.key]" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td><input type="checkbox" v-model="selection[item.id]" /></td>
            <td v-for="column in shownColumns" :key="column.key" :data-label="column.label" :class="{ 'invwiki-table-id': column.key === 'id' }">
              <a v-if="column.key === 'id'" :href="`/${PREFIX}/${item.id}`">{{ item.id }}</a>
              <template v-else>{{ display(column, item[column.key]) }}</template>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="invwiki-table-pages">
        <button @click="goTo(offset - limit)" :disabled="offset === 0">
          <mdi-icon icon="chevron-left" />
        </button>
        <span>{{ total ? `${offset + 1}–${Math.min(offset + limit, total)} von ${total}` : 'Keine Treffer' }}</span>
        <button @click="goTo(offset + limit)" :disabled="offset + limit >= total">
          <mdi-icon icon="chevron-right" />
        </button>
        <select v-model.number="limit" @change="goTo(0)" title="Einträge pro Seite">
          <option v-for="size in [25, 50, 100, 200]" :key="size" :value="size">{{ size }} pro Seite</option>
        </select>
      </div>
    </div>
  </x-dialog>
</template>

<script>
import { PREFIX, queryItems } from '@/utils/api.js';

// the keys are the plugin's column names, see Index::COLUMNS
const COLUMNS = [
  { key: 'id', label: 'Inventarnummer' },
  { key: 'title', label: 'Name' },
  { key: 'description', label: 'Kurzbeschreibung' },
  { key: 'serial', label: 'Seriennummer' },
  { key: 'invoice', label: 'Rechnung' },
  { key: 'date', label: 'Anschaffungsdatum' },
  { key: 'category', label: 'Kategorie' },
  { key: 'origin', label: 'Ursprung' },
  { key: 'owner', label: 'Eigentümer*in' },
  { key: 'location', label: 'Ort' },
  { key: 'nominal', label: 'Soll-Ort' },
  { key: 'lastSeenAt', label: 'Zuletzt gesehen' },
  { key: 'container', label: 'Behälter', flag: true },
  { key: 'small', label: 'Kleines Label', flag: true },
];

const DEFAULT_COLUMNS = ['id', 'title', 'serial', 'invoice', 'date', 'owner', 'location'];
const STORAGE_KEY = 'invwiki-table-columns';
// wait for a pause in typing before asking the wiki
const DEBOUNCE = 300;

const loadColumns = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored.filter(key => COLUMNS.some(e => e.key === key)) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
};

export default {
  emits: ['select'],

  data: () => ({
    PREFIX,
    columns: COLUMNS,
    visible: loadColumns(),
    items: [],
    total: 0,
    error: '',
    loading: false,
    exporting: false,
    opened: false,
    search: '',
    filters: {},
    sort: { key: 'id', desc: false },
    offset: 0,
    limit: 50,
    // inventory id => checked, kept across pages
    selection: {},
    timer: null,
    // number of the latest request, older answers that arrive late are dropped
    request: 0
  }),

  computed: {
    shownColumns() {
      return this.columns.filter(e => e.key === 'id' || this.visible.includes(e.key));
    },

    // everything the wiki needs to answer, without the page
    query() {
      const keys = this.shownColumns.map(e => e.key);
      return {
        search: this.search.trim(),
        filters: Object.fromEntries(Object.entries(this.filters).filter(([key, value]) => value && keys.includes(key))),
        sort: keys.includes(this.sort.key) ? this.sort.key : 'id',
        desc: this.sort.desc,
        columns: keys
      };
    },

    activeFilters() {
      return Object.keys(this.query.filters).length;
    },

    checked() {
      return Object.keys(this.selection).filter(id => this.selection[id]);
    },

    allChecked() {
      return this.items.length > 0 && this.items.every(item => this.selection[item.id]);
    }
  },

  watch: {
    // a different question starts on the first page again, typing is debounced
    query: {
      deep: true,
      handler(value, old) {
        this.offset = 0;
        const typed = value.search !== old.search || JSON.stringify(value.filters) !== JSON.stringify(old.filters);
        this.schedule(typed ? DEBOUNCE : 0);
      }
    }
  },

  methods: {
    async open() {
      this.$refs.dialog.show();
      this.opened = true;
      // always fresh, an item may have changed since the dialog was last open
      await this.load();
    },

    goTo(offset) {
      this.offset = Math.max(0, offset);
      this.load();
    },

    schedule(delay) {
      clearTimeout(this.timer);
      if (this.opened) {
        this.timer = setTimeout(() => this.load(), delay);
      }
    },

    async load() {
      clearTimeout(this.timer);
      const request = ++this.request;
      this.loading = true;
      this.error = '';
      try {
        const result = await queryItems({ ...this.query, offset: this.offset, limit: this.limit });
        if (request === this.request) {
          this.items = result.items;
          this.total = result.total;
        }
      } catch (e) {
        if (request === this.request) {
          this.items = [];
          this.total = 0;
          this.error = e.message === 'Method does not exist'
            ? 'Das Wiki-Plugin "inventory" ist nicht installiert, ohne es kann die Tabelle nicht geladen werden.'
            : `Fehler beim Laden: ${e.message}`;
        }
      } finally {
        if (request === this.request) {
          this.loading = false;
        }
      }
    },

    display(column, value) {
      return column.flag ? (value ? 'ja' : '') : value;
    },

    toggleColumn(key) {
      this.visible = this.visible.includes(key)
        ? this.visible.filter(e => e !== key)
        : this.columns.map(e => e.key).filter(e => e === key || this.visible.includes(e));

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.visible));
      } catch {
        // only a convenience
      }
    },

    sortBy(key) {
      this.sort = { key, desc: this.sort.key === key && !this.sort.desc };
    },

    toggleAll() {
      const value = !this.allChecked;
      for (const item of this.items) {
        this.selection[item.id] = value;
      }
    },

    // hand the checked items to the selection of the index page, so that the
    // toolbar's actions (print, location, bulk edit) work on them
    applySelection() {
      this.$emit('select', this.checked);
      this.selection = {};
      this.opened = false;
      this.$refs.dialog.close();
    },

    // all matching items, not only the current page
    async exportCsv() {
      this.exporting = true;
      try {
        const { items } = await queryItems({ ...this.query, limit: 0 });
        const quote = (value) => /[";\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        const lines = [
          this.shownColumns.map(e => quote(e.label)),
          ...items.map(item => this.shownColumns.map(e => quote(String(this.display(e, item[e.key]) ?? ''))))
        ].map(e => e.join(';'));

        // semicolons and a byte order mark, so that a German Excel opens it right away
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `inventar-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) {
        this.error = `Fehler beim Export: ${e.message}`;
      } finally {
        this.exporting = false;
      }
    }
  }
}
</script>
