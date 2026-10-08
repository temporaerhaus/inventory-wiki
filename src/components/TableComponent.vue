<template>
  <div class="invwiki invwiki-table-view" v-if="available">
    <blockquote v-if="error">{{ error }}</blockquote>

    <div class="invwiki-table-controls">
      <label class="invwiki-table-search">
        <mdi-icon icon="magnify" title="Suchen" />
        <input type="search" v-model="search" placeholder="Suchen in allen sichtbaren Spalten" autocomplete="off" />
      </label>

      <label class="invwiki-table-sort">
        Sortieren
        <select v-model="sort.key">
          <option v-for="column in columns" :key="column.key" :value="column.key">{{ column.label }}</option>
        </select>
        <button @click="sort.desc = !sort.desc" :title="sort.desc ? 'absteigend' : 'aufsteigend'">
          <mdi-icon :icon="sort.desc ? 'menu-down' : 'menu-up'" />
        </button>
      </label>

      <details class="invwiki-table-filters">
        <summary>Filter{{ activeFilters ? ` (${activeFilters})` : '' }}</summary>
        <label v-for="column in shownColumns" :key="column.key">
          {{ column.label }}
          <input type="search" v-model="filters[column.key]" autocomplete="off" />
        </label>
      </details>

      <div class="invwiki-table-columns" ref="columnsMenu">
        <button type="button" @click="columnsOpen = !columnsOpen" :aria-expanded="columnsOpen">
          Spalten ({{ shownColumns.length }} von {{ columns.length }})
          <mdi-icon :icon="columnsOpen ? 'menu-up' : 'menu-down'" right />
        </button>
        <div class="invwiki-table-columns-menu" v-if="columnsOpen">
          <label v-for="column in columns" :key="column.key">
            <input type="checkbox" :checked="column.key === 'id' || visible.includes(column.key)" :disabled="column.key === 'id'" @change="toggleColumn(column.key)" />
            {{ column.label }}
          </label>
          <button type="button" class="invwiki-table-columns-reset" @click="resetColumns()" :disabled="isDefaultColumns">
            <mdi-icon icon="undo-variant" left />
            Standardspalten wiederherstellen
          </button>
        </div>
      </div>

    </div>

    <p v-if="loading && !loaded">Lade Inventar…</p>

    <div class="invwiki-table-scroll" v-else>
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
              <input type="search" v-model="filters[column.key]" autocomplete="off" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td><input type="checkbox" :checked="isSelected(item.id)" @change="$emit('toggle', [item.id], $event.target.checked)" /></td>
            <td v-for="column in shownColumns" :key="column.key" :data-label="column.label" :class="{ 'invwiki-table-id': column.key === 'id' }">
              <template v-if="column.key === 'id'">
                <mdi-icon :icon="item.container ? 'package-variant' : 'toy-brick-outline'" :title="item.container ? 'Behälter' : 'Gegenstand'" left />
                <a :href="`/${PREFIX}/${item.id}`">{{ item.id }}</a>
              </template>
              <span v-else-if="column.key === 'place' && item.temporary" :title="item.nominal ? `Regulärer Aufenthaltsort: ${item.nominal}` : 'Kein regulärer Aufenthaltsort'" :class="{ 'invwiki-table-elsewhere': elsewhere(item) }">
                <mdi-icon icon="map-clock-outline" left :title="elsewhere(item) ? 'Aktueller Aufenthaltsort, nicht am regulären Aufenthaltsort' : 'Aktueller Aufenthaltsort'" />{{ item.temporary }}
              </span>
              <template v-else-if="column.key === 'place'">{{ item.nominal }}</template>
              <span v-else-if="column.timestamp && item[column.key]" :title="seenAt(item[column.key]).full">{{ seenAt(item[column.key]).date }}</span>
              <template v-else>{{ display(column, item[column.key]) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="invwiki-table-pages" v-if="loaded">
      <button @click="goTo(offset - limit)" :disabled="offset === 0">
        <mdi-icon icon="chevron-left" />
      </button>
      <span>{{ total ? `${offset + 1}–${Math.min(offset + limit, total)} von ${total}` : 'Keine Treffer' }}</span>
      <button @click="goTo(offset + limit)" :disabled="offset + limit >= total">
        <mdi-icon icon="chevron-right" />
      </button>
      <select v-model.number="limit" @change="goTo(0)" title="Einträge pro Seite">
        <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }} pro Seite</option>
      </select>
    </div>
  </div>
</template>

<script>
import { PREFIX, ITEM_SAVED_EVENT, isPluginMissing, queryItems } from '@/utils/api.js';

// the keys are the plugin's column names, see Index::COLUMNS; a column that
// combines several of them names the one it filters and sorts by as "field"
// and the others it shows as "needs"
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
  // the temporary location if there is one, the nominal one otherwise, which is what "location" holds
  { key: 'place', label: 'Aufenthaltsort', field: 'location', needs: ['nominal', 'temporary'] },
  { key: 'location', label: 'Aktueller Aufenthaltsort' },
  { key: 'nominal', label: 'Regulärer Aufenthaltsort' },
  { key: 'lastSeenAt', label: 'Zuletzt gesehen', timestamp: true },
  // of the item page, kept by the wiki
  { key: 'created', label: 'Angelegt', timestamp: true },
  { key: 'modified', label: 'Zuletzt bearbeitet', timestamp: true },
  { key: 'container', label: 'Behälter', flag: true },
  { key: 'small', label: 'Kleines Label', flag: true },
];

const DEFAULT_COLUMNS = ['id', 'title', 'serial', 'date', 'owner', 'place', 'lastSeenAt'];
// the most recently changed items first
const DEFAULT_SORT = { key: 'modified', desc: true };
const STORAGE_KEY = 'invwiki-table-columns';
// wait for a pause in typing before asking the wiki
const DEBOUNCE = 300;
// a bulk edit saves one item after the other, load once they are through
const AFTER_SAVE = 1000;

// The search, filters, sort and page are kept in the page's address, so that
// going back to the index page (or a link to it) shows the table as it was:
// t-search, t-sort (the column key, "-" in front for descending), t-page
// (from 1), t-per and t-f-<column key> for each filter. What is the default
// is left out.
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_LIMIT = 50;
const URL_PREFIX = 't-';
const FILTER_PREFIX = `${URL_PREFIX}f-`;

const stateFromUrl = () => {
  const params = new URLSearchParams(location.search);
  const column = (key) => COLUMNS.some(e => e.key === key);

  const sortParam = params.get(`${URL_PREFIX}sort`) || '';
  const desc = sortParam.startsWith('-');
  const sortKey = sortParam.replace(/^-/, '');

  const per = Number(params.get(`${URL_PREFIX}per`));
  const limit = PAGE_SIZES.includes(per) ? per : DEFAULT_LIMIT;
  const page = Math.max(1, Math.floor(Number(params.get(`${URL_PREFIX}page`))) || 1);

  const filters = {};
  for (const [name, value] of params) {
    const key = name.slice(FILTER_PREFIX.length);
    if (name.startsWith(FILTER_PREFIX) && column(key) && value) {
      filters[key] = value;
    }
  }

  return {
    search: params.get(`${URL_PREFIX}search`) || '',
    filters,
    sort: column(sortKey) ? { key: sortKey, desc } : { ...DEFAULT_SORT },
    offset: (page - 1) * limit,
    limit,
  };
};

// the address with the table's state, the page's other parameters kept
const urlOf = ({ search, filters, sort, offset, limit }) => {
  const params = new URLSearchParams(location.search);
  for (const name of [...params.keys()]) {
    if (name.startsWith(URL_PREFIX)) {
      params.delete(name);
    }
  }

  if (search.trim()) {
    params.set(`${URL_PREFIX}search`, search.trim());
  }
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(`${FILTER_PREFIX}${key}`, value);
    }
  }
  if (sort.key !== DEFAULT_SORT.key || sort.desc !== DEFAULT_SORT.desc) {
    params.set(`${URL_PREFIX}sort`, `${sort.desc ? '-' : ''}${sort.key}`);
  }
  if (offset > 0) {
    params.set(`${URL_PREFIX}page`, String(Math.floor(offset / limit) + 1));
  }
  if (limit !== DEFAULT_LIMIT) {
    params.set(`${URL_PREFIX}per`, String(limit));
  }

  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
};

const loadColumns = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored.filter(key => COLUMNS.some(e => e.key === key)) : [...DEFAULT_COLUMNS];
  } catch {
    return [...DEFAULT_COLUMNS];
  }
};

export default {
  props: {
    // the selection of the index page, "check:<page id>" => checked
    selection: Object
  },

  emits: ['toggle'],

  data: () => ({
    PREFIX,
    PAGE_SIZES,
    columns: COLUMNS,
    visible: loadColumns(),
    items: [],
    total: 0,
    error: '',
    // false without the wiki plugin, the table then stays away and the
    // index page's own list of items is all there is
    available: true,
    loading: false,
    // the first answer has arrived
    loaded: false,
    columnsOpen: false,
    // search, filters, sort, offset and limit, as the address has them
    ...stateFromUrl(),
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
      const shown = this.shownColumns;
      const field = (column) => column.field ?? column.key;
      // by any column, shown or not
      const sorted = this.columns.find(e => e.key === this.sort.key);
      return {
        search: this.search.trim(),
        filters: Object.fromEntries(shown.filter(e => this.filters[e.key]).map(e => [field(e), this.filters[e.key]])),
        sort: sorted ? field(sorted) : 'id',
        desc: this.sort.desc,
        // the container flag for the icon next to every inventory number
        columns: [...new Set([...shown.flatMap(e => [field(e), ...(e.needs ?? [])]), 'container'])]
      };
    },

    isDefaultColumns() {
      const shown = this.shownColumns.map(e => e.key);
      return shown.length === DEFAULT_COLUMNS.length && DEFAULT_COLUMNS.every(key => shown.includes(key));
    },

    activeFilters() {
      return Object.keys(this.query.filters).length;
    },

    url() {
      return urlOf(this);
    },

    allChecked() {
      return this.items.length > 0 && this.items.every(item => this.isSelected(item.id));
    }
  },

  watch: {
    // the address follows the table, without a new step for the back button
    // at every keystroke or click
    url(value) {
      if (value !== `${location.pathname}${location.search}${location.hash}`) {
        history.replaceState(history.state, '', value);
      }
    },

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

  mounted() {
    this.load();
    window.addEventListener(ITEM_SAVED_EVENT, this.onItemSaved);
    document.addEventListener('click', this.closeColumnsOutside);
    document.addEventListener('keydown', this.closeColumnsOnEscape);
  },

  beforeUnmount() {
    window.removeEventListener(ITEM_SAVED_EVENT, this.onItemSaved);
    document.removeEventListener('click', this.closeColumnsOutside);
    document.removeEventListener('keydown', this.closeColumnsOnEscape);
    clearTimeout(this.timer);
  },

  methods: {
    // stays on the current page, only the values change
    onItemSaved() {
      if (this.available) {
        this.schedule(AFTER_SAVE);
      }
    },

    // the column menu closes like a dropdown: a click elsewhere or Escape
    closeColumnsOutside(e) {
      if (this.columnsOpen && !this.$refs.columnsMenu?.contains(e.target)) {
        this.columnsOpen = false;
      }
    },

    closeColumnsOnEscape(e) {
      if (this.columnsOpen && e.key === 'Escape') {
        this.columnsOpen = false;
      }
    },

    isSelected(id) {
      return Boolean(this.selection?.[`check:${PREFIX}:${id.toLowerCase()}`]);
    },

    goTo(offset) {
      this.offset = Math.max(0, offset);
      this.load();
    },

    schedule(delay) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.load(), delay);
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
          this.loaded = true;
        }
      } catch (e) {
        if (request === this.request) {
          this.items = [];
          this.total = 0;
          this.available = !isPluginMissing(e);
          this.error = `Fehler beim Laden: ${e.message}`;
        }
      } finally {
        if (request === this.request) {
          this.loading = false;
        }
      }
    },

    // temporarily somewhere else than it belongs, as on the item page
    elsewhere(item) {
      return Boolean(item.temporary && item.nominal && item.temporary.trim().toUpperCase() !== item.nominal.trim().toUpperCase());
    },

    // a timestamp such as 2026-09-30T10:00:00.000Z as the local day, like the
    // other dates in the table, the time is there on hover
    seenAt(value) {
      const date = new Date(value);
      // a plain date has no time to show
      if (!value.includes('T') || isNaN(date)) {
        return { date: value, full: null };
      }
      const day = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      return { date: day, full: date.toLocaleString('de-DE') };
    },

    display(column, value) {
      return column.flag ? (value ? 'ja' : '') : value;
    },

    toggleColumn(key) {
      this.setColumns(this.visible.includes(key)
        ? this.visible.filter(e => e !== key)
        : this.columns.map(e => e.key).filter(e => e === key || this.visible.includes(e)));
    },

    resetColumns() {
      this.setColumns([...DEFAULT_COLUMNS]);
    },

    // remembered in this browser, so the table keeps its columns across visits
    setColumns(keys) {
      this.visible = keys;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
      } catch {
        // only a convenience
      }
    },

    sortBy(key) {
      this.sort = { key, desc: this.sort.key === key && !this.sort.desc };
    },

    toggleAll() {
      this.$emit('toggle', this.items.map(item => item.id), !this.allChecked);
    },
  }
}
</script>
