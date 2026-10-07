<template>
  <div class="invwiki-selection-menu" ref="root" v-if="selected?.length > 0">
    <button @click="open = !open" :aria-expanded="open" :title="label" :aria-label="label">
      <mdi-icon icon="checkbox-multiple-marked-outline" left />
      {{ selected.length }} <span class="invwiki-toolbar-label">{{ selected.length === 1 ? 'ausgewählter Gegenstand' : 'ausgewählte Gegenstände' }}</span>
      <mdi-icon :icon="open ? 'menu-up' : 'menu-down'" right />
    </button>

    <div class="invwiki-selection-menu-items" v-show="open">
      <button @click="run(() => $emit('print'))">
        <mdi-icon icon="cloud-print-outline" left />
        Aufkleber drucken
      </button>
      <button @click="run(() => printContents())" :disabled="busy">
        <mdi-icon icon="format-list-checks" left />
        Inhaltslisten drucken
      </button>
      <button @click="run(() => $refs.location.open())">
        <mdi-icon icon="home-map-marker" left />
        Aufenthaltsort zuweisen
      </button>
      <button @click="run(() => $refs.edit.open())">
        <mdi-icon icon="square-edit-outline" left />
        Bearbeiten
      </button>
    </div>
  </div>

  <!-- their dialogs, opened from the menu -->
  <location-component :selected="selected" ref="location" />
  <bulk-edit-component :selected="selected" ref="edit" />
</template>

<script>
import LocationComponent from '@/components/LocationComponent.vue';
import BulkEditComponent from '@/components/BulkEditComponent.vue';
import { containersAmong, remotePrintContentsLists } from '@/utils/api.js';

// The actions for the selected items, behind one button
export default {
  components: {
    LocationComponent,
    BulkEditComponent
  },

  props: {
    // paths of the selected item pages
    selected: Array
  },

  // print: add the selected items to the print queue, which the parent does
  emits: ['print'],

  data: () => ({
    open: false,
    // while contents lists are being queued
    busy: false,
  }),

  computed: {
    label() {
      return `${this.selected.length} ${this.selected.length === 1 ? 'ausgewählter Gegenstand' : 'ausgewählte Gegenstände'}`;
    }
  },

  watch: {
    // a new selection starts with the menu closed
    'selected.length'(length) {
      if (!length) {
        this.open = false;
      }
    }
  },

  mounted() {
    document.addEventListener('click', this.closeOutside);
    document.addEventListener('keydown', this.closeOnEscape);
  },

  beforeUnmount() {
    document.removeEventListener('click', this.closeOutside);
    document.removeEventListener('keydown', this.closeOnEscape);
  },

  methods: {
    // a contents list for each selected container, of what is directly in
    // it; the selection may hold other items too, which have none
    async printContents() {
      const ids = this.selected.map(e => e.split('/').pop().toUpperCase());
      this.busy = true;
      try {
        const containers = await containersAmong(ids);
        if (containers.length === 0) {
          alert(ids.length === 1 ? 'Der ausgewählte Gegenstand ist kein Behälter.' : 'Keiner der ausgewählten Gegenstände ist ein Behälter.');
          return;
        }

        const added = await remotePrintContentsLists(containers);
        const lists = (n) => `${n} ${n === 1 ? 'Inhaltsliste' : 'Inhaltslisten'}`;
        const queued = containers.length - added.length;
        const others = ids.length - containers.length;
        alert([
          added.length > 0
            ? `${lists(added.length)} zur Druckwarteschlange hinzugefügt.`
            : `${queued === 1 ? 'Die Inhaltsliste war' : `Die ${lists(queued)} waren`} schon in der Druckwarteschlange.`,
          added.length > 0 && queued > 0 ? `${lists(queued)} ${queued === 1 ? 'war' : 'waren'} schon darin.` : '',
          others > 0 ? `${others} der ausgewählten Gegenstände ${others === 1 ? 'ist kein Behälter' : 'sind keine Behälter'}.` : '',
        ].filter(Boolean).join(' '));
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.busy = false;
      }
    },

    run(action) {
      this.open = false;
      action();
    },

    closeOutside(e) {
      if (!this.$refs.root?.contains(e.target)) {
        this.open = false;
      }
    },

    closeOnEscape(e) {
      if (e.key === 'Escape') {
        this.open = false;
      }
    }
  }
}
</script>
