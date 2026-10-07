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
      <button @click="run(() => openContents())">
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

  <!-- what to print for each selected container, as for a single one -->
  <x-dialog title="Inhaltslisten drucken" icon="format-list-checks" ref="contents" :loading="busy">
    <p v-if="containers === null">Suche die Behälter unter den ausgewählten Gegenständen …</p>
    <p v-else-if="containers.length === 0">{{ selected.length === 1 ? 'Der ausgewählte Gegenstand ist kein Behälter.' : 'Keiner der ausgewählten Gegenstände ist ein Behälter.' }}</p>
    <p v-else>
      {{ containers.length === selected.length
        ? (selected.length === 1 ? 'Der ausgewählte Gegenstand ist ein Behälter.' : `Alle ${selected.length} ausgewählten Gegenstände sind Behälter.`)
        : `${containers.length} der ${selected.length} ausgewählten Gegenstände ${containers.length === 1 ? 'ist ein Behälter' : 'sind Behälter'}.` }}
    </p>

    <label :for="`${uid}-kind`">
      <mdi-icon icon="file-document-outline" left title="Art" />
      Art
    </label>
    <select :id="`${uid}-kind`" v-model="kind">
      <option value="list">Liste der beinhalteten Gegenstände</option>
      <option value="sign">Große Aufkleber für den Behälter, 4 auf einer A4-Seite</option>
    </select>

    <template v-if="kind === 'list'">
      <label :for="`${uid}-levels`">
        <mdi-icon icon="package-variant" left title="Unter-Behälter" />
        Inhalt von Unter-Behältern auflisten
      </label>
      <select :id="`${uid}-levels`" v-model.number="levels">
        <option :value="0">Nein, nur direkt enthaltene Gegenstände</option>
        <option :value="1">1 Ebene tief</option>
        <option :value="2">2 Ebenen tief</option>
        <option :value="3">3 Ebenen tief</option>
        <option :value="MAX_CONTENTS_LEVELS">Alle Ebenen</option>
      </select>
    </template>

    <template #footer>
      <button @click="printContents()" :disabled="busy || !containers?.length">
        <mdi-icon icon="cloud-print-outline" left />
        Zur Druckwarteschlange hinzufügen
      </button>
    </template>
  </x-dialog>

  <!-- their dialogs, opened from the menu -->
  <location-component :selected="selected" ref="location" />
  <bulk-edit-component :selected="selected" ref="edit" />
</template>

<script>
import LocationComponent from '@/components/LocationComponent.vue';
import BulkEditComponent from '@/components/BulkEditComponent.vue';
import { MAX_CONTENTS_LEVELS, containersAmong, remotePrintContentsLists, remotePrintSigns } from '@/utils/api.js';

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
    MAX_CONTENTS_LEVELS,
    uid: `invwiki-selection-${Math.round(Math.random() * 10000)}`,
    // while the containers are looked up, or their lists queued
    busy: false,
    // the inventory numbers of the selected containers, null until known
    containers: null,
    // list: the contained items, sign: large labels of the containers
    kind: 'list',
    // how many levels of sub-containers to list the contents of
    levels: 0,
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
    // which of the selected items are containers, which is what the dialog
    // tells before anything is queued
    async openContents() {
      this.containers = null;
      this.$refs.contents.show();
      this.busy = true;
      try {
        this.containers = await containersAmong(this.selected.map(e => e.split('/').pop()));
      } catch (e) {
        alert(`Fehler: ${e.message}`);
        this.$refs.contents.close();
      } finally {
        this.busy = false;
      }
    },

    // the chosen lists or large labels of the selected containers
    async printContents() {
      const containers = this.containers || [];
      this.busy = true;
      try {
        const added = this.kind === 'sign'
          ? await remotePrintSigns(containers)
          : await remotePrintContentsLists(containers, this.levels);
        const queued = containers.length - added.length;
        const what = (n) => this.kind === 'sign'
          ? `${n} ${n === 1 ? 'Seite' : 'Seiten'} große Aufkleber`
          : `${n} ${n === 1 ? 'Inhaltsliste' : 'Inhaltslisten'}`;
        const were = (n) => n === 1 ? 'war' : 'waren';
        alert([
          added.length > 0
            ? `${what(added.length)} zur Druckwarteschlange hinzugefügt.`
            : `${what(queued)} ${were(queued)} schon in der Druckwarteschlange.`,
          added.length > 0 && queued > 0 ? `${what(queued)} ${were(queued)} schon darin.` : '',
        ].filter(Boolean).join(' '));
        this.$refs.contents.close();
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
