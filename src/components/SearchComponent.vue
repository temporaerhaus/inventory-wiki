<template>
  <div class="invwiki-search" ref="root">
    <label class="invwiki-search-field">
      <mdi-icon icon="magnify" title="Inventar durchsuchen" />
      <input
        type="search"
        placeholder="Suchen …"
        aria-label="Inventar durchsuchen"
        autocomplete="off"
        v-model="query"
        @input="schedule()"
        @focus="open = true"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="enter()"
        @keydown.esc="open = false"
      />
    </label>

    <!-- the best matches, while typing -->
    <div class="invwiki-search-results" v-if="open && query.trim()">
      <p v-if="error">Fehler: {{ error }}</p>
      <p v-else-if="loading && items.length === 0">Suche …</p>
      <p v-else-if="searched && items.length === 0">Keine Gegenstände gefunden.</p>

      <a
        v-for="(item, i) in items"
        :key="item.id"
        :href="`/${PREFIX}/${item.id}`"
        :class="{ 'is-active': i === active }"
        @mouseenter="active = i"
      >
        <mdi-icon :icon="item.container ? 'package-variant' : 'toy-brick-outline'" :title="item.container ? 'Behälter' : 'Gegenstand'" />
        <div>
          <b>{{ item.id }}</b><template v-if="item.title">: {{ item.title }}</template>
          <small v-if="item.match">{{ item.match.field }}: {{ item.match.value }}</small>
          <small v-else-if="item.description">{{ item.description }}</small>
          <small v-if="item.location">
            <mdi-icon icon="map-marker-outline" title="Aufenthaltsort" />{{ item.location }}
          </small>
        </div>
      </a>

      <div class="invwiki-search-more" v-if="searched && !error">
        <button type="button" v-if="total > items.length && limit < MAX" @click="more()" :disabled="loading">
          {{ total - items.length }} weitere anzeigen
        </button>
        <a :href="wikiSearch">In der Wiki-Suche suchen</a>
      </div>
    </div>
  </div>
</template>

<script>
import { PREFIX, searchInventory } from '@/utils/api.js';

const DEBOUNCE = 200;
const PAGE = 8;
const MAX = 50;

export default {
  data: () => ({
    PREFIX,
    MAX,
    query: '',
    items: [],
    total: 0,
    limit: PAGE,
    active: -1,
    open: false,
    loading: false,
    searched: false,
    error: '',
    timeout: null,
    // the answer to an older query must not replace the one to a newer
    request: 0,
  }),

  computed: {
    wikiSearch() {
      return `/start?${new URLSearchParams({ do: 'search', q: `${this.query.trim()} @${PREFIX}` })}`;
    }
  },

  mounted() {
    document.addEventListener('click', this.closeOutside);
  },

  beforeUnmount() {
    document.removeEventListener('click', this.closeOutside);
    clearTimeout(this.timeout);
  },

  methods: {
    closeOutside(e) {
      if (!this.$refs.root?.contains(e.target)) {
        this.open = false;
      }
    },

    schedule() {
      this.open = true;
      this.limit = PAGE;
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.timeout = null;
        this.search();
      }, DEBOUNCE);
    },

    async search() {
      const query = this.query.trim();
      const request = ++this.request;
      if (!query) {
        this.items = [];
        this.total = 0;
        this.searched = false;
        return;
      }

      this.loading = true;
      try {
        const { total, items } = await searchInventory(query, this.limit);
        if (request !== this.request) {
          return;
        }
        this.total = total;
        this.items = items;
        this.active = items.length > 0 ? Math.min(Math.max(this.active, 0), items.length - 1) : -1;
        this.error = '';
        this.searched = true;
      } catch (e) {
        if (request === this.request) {
          this.error = e.message;
        }
      } finally {
        if (request === this.request) {
          this.loading = false;
        }
      }
    },

    more() {
      this.limit = Math.min(MAX, this.limit + PAGE * 2);
      this.search();
    },

    move(step) {
      this.open = true;
      if (this.items.length > 0) {
        this.active = (this.active + step + this.items.length) % this.items.length;
      }
    },

    // the chosen match, or the wiki's search if there is none; the matches
    // shown may still be the ones of what was typed before
    async enter() {
      if (this.timeout || this.loading) {
        clearTimeout(this.timeout);
        this.timeout = null;
        await this.search();
      }

      const item = this.items[this.active];
      if (item) {
        location.pathname = `/${PREFIX}/${item.id}`;
      } else if (this.query.trim()) {
        location.href = this.wikiSearch;
      }
    }
  }
}
</script>
