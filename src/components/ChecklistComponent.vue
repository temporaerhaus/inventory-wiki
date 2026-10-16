<template>
  <x-dialog title="Checkliste" icon="format-list-checks" ref="dialog" :loading="loading">
    <label :for="`${uid}-heading`">
      <mdi-icon icon="text-box-outline" left title="Überschrift" />
      Überschrift
    </label>
    <input :id="`${uid}-heading`" type="text" v-model="heading" @change="generate()" :placeholder="DEFAULT_HEADING" autocomplete="off" :disabled="loading" />

    <p v-if="loading">Lade ausgewählte Gegenstände …</p>
    <p v-else-if="error">Fehler: {{ error }}</p>
    <template v-else-if="blobURL">
      <p>{{ rows.length }} {{ rows.length === 1 ? 'Gegenstand' : 'Gegenstände' }}{{ missing ? `, ${missing} ${missing === 1 ? 'ausgewählter Gegenstand wurde' : 'ausgewählte Gegenstände wurden'} nicht gefunden` : '' }}.</p>
      <iframe :src="blobURL" class="invwiki-contents-preview hide-mobile" title="Vorschau der Checkliste"></iframe>
    </template>

    <template #footer v-if="!loading && !error && blobURL">
      <a :href="blobURL" :download="`Checkliste_${new Date().toISOString().slice(0, 10)}.pdf`">
        <mdi-icon icon="file-download-outline" />
        PDF Herunterladen
      </a>

      <a @click.prevent="print()" href="#">
        <mdi-icon icon="printer" />
        Drucken
      </a>
    </template>
  </x-dialog>
</template>

<script>
import { markRaw } from 'vue';

import pdfMake from '@/utils/pdf.js';
import { contentsDocument } from '@/utils/contents.js';
import { fetchInventoryItem } from '@/utils/api.js';

const DEFAULT_HEADING = 'Ausgewählte Gegenstände';

// The selected items as a list to tick off, laid out like the contents list
// of a container
export default {
  props: {
    // paths of the selected item pages
    selected: Array
  },

  data: () => ({
    DEFAULT_HEADING,
    uid: `invwiki-checklist-${Math.round(Math.random() * 10000)}`,
    heading: '',
    loading: false,
    error: '',
    rows: [],
    // selected pages that turned out to be no item
    missing: 0,
    pdf: null,
    blobURL: null
  }),

  methods: {
    async open() {
      this.heading = '';
      this.rows = [];
      this.$refs.dialog.show();

      this.loading = true;
      this.error = '';
      try {
        const ids = [...new Set(this.selected.map(e => e.split('/').pop().toUpperCase()))];
        const items = (await Promise.all(ids.map(async (id) => ({ id, item: await fetchInventoryItem(id) }))))
          .filter(e => e.item)
          .sort((a, b) => a.id.localeCompare(b.id));
        this.rows = items.map(({ id, item }) => ({ id, title: item.title || '', description: item.description || '', depth: 0 }));
        this.missing = ids.length - items.length;
      } catch (e) {
        this.error = e.message;
        this.loading = false;
        return;
      }

      await this.generate();
    },

    // the items are loaded once, a new heading only lays them out again
    async generate() {
      this.loading = true;
      this.error = '';

      try {
        // pdfmake's document must not be wrapped in a reactive proxy, some of its properties are read-only
        this.pdf = markRaw(pdfMake.createPdf(await contentsDocument({
          kind: 'Checkliste',
          heading: this.heading.trim() || DEFAULT_HEADING,
          rows: this.rows,
          empty: 'Keine Gegenstände ausgewählt.',
        })));

        if (this.blobURL) {
          URL.revokeObjectURL(this.blobURL);
        }
        this.blobURL = URL.createObjectURL(await new Promise(resolve => this.pdf.getBlob(resolve)));
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    print() {
      const win = window.open('', '_blank');
      this.pdf?.print?.({}, win);
    }
  }
}
</script>
