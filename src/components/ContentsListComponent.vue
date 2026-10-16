<template>
  <button @click="open">
    <mdi-icon icon="format-list-checks" left />
    Inhaltsliste Erstellen
  </button>

  <x-dialog :title="`${sign ? 'Große Aufkleber' : 'Inhaltsliste'} ${inventoryId}`" icon="format-list-checks" ref="dialog" :loading="loading || printing">
    <label :for="`${uid}-kind`">
      <mdi-icon icon="file-document-outline" left title="Art" />
      Art
    </label>
    <select :id="`${uid}-kind`" v-model="kind" @change="generate()" :disabled="loading">
      <option value="list">Liste der beinhalteten Gegenstände</option>
      <option value="sign">Große Aufkleber für den Behälter, 4 auf einer A4-Seite</option>
    </select>

    <template v-if="!sign">
      <label :for="`${uid}-levels`">
        <mdi-icon icon="package-variant" left title="Unter-Behälter" />
        Inhalt von Unter-Behältern auflisten
      </label>
      <select :id="`${uid}-levels`" v-model.number="levels" @change="generate()" :disabled="loading">
        <option :value="0">Nein, nur direkt enthaltene Gegenstände</option>
        <option :value="1">1 Ebene tief</option>
        <option :value="2">2 Ebenen tief</option>
        <option :value="3">3 Ebenen tief</option>
        <option :value="maxDepth">Alle Ebenen</option>
      </select>
    </template>

    <p v-if="loading">{{ sign ? 'Erstelle die Aufkleber …' : 'Lade beinhaltete Gegenstände …' }}</p>
    <p v-else-if="error">Fehler: {{ error }}</p>
    <template v-else-if="blobURL">
      <p v-if="sign">Der Aufkleber von {{ inventoryId }} vergrößert, viermal auf einer A4-Seite im Querformat zum Ausschneiden, z.B. für jede Seite einer Palette.</p>
      <p v-else>{{ rows.length }} {{ rows.length === 1 ? 'Gegenstand' : 'Gegenstände' }}{{ nested ? ', inklusive Inhalt von Unter-Behältern' : '' }}.</p>
      <iframe :src="blobURL" class="invwiki-contents-preview hide-mobile" :title="sign ? 'Vorschau der Aufkleber' : 'Vorschau der Inhaltsliste'"></iframe>
    </template>

    <template #footer v-if="!loading && !error && blobURL">
      <a :href="blobURL" :download="`${sign ? 'Aufkleber_A4' : 'Inhaltsliste'}_${inventoryId}.pdf`">
        <mdi-icon icon="file-download-outline" />
        PDF Herunterladen
      </a>

      <a @click.prevent="print()" href="#">
        <mdi-icon icon="printer" />
        Drucken
      </a>

      <a @click.prevent="printRemote()" href="#" :disabled="printing">
        <mdi-icon icon="cloud-print-outline" />
        Remote Drucken
      </a>
    </template>
  </x-dialog>
</template>

<script>
import { markRaw } from 'vue';

import pdfMake from '@/utils/pdf.js';
import { contentsDocument } from '@/utils/contents.js';
import { PREFIX, MAX_CONTENTS_LEVELS, fetchInventoryItem, remotePrintContents, remotePrintSign, searchItems } from '@/utils/api.js';
import { labelDescription } from '@/utils/label.js';
import { signDocument } from '@/utils/sign.js';

// the dev server runs on localhost but proxies this wiki
const WIKI_ORIGIN = import.meta.env.DEV ? 'https://wiki.temporaerhaus.de' : location.origin;

const MAX_DEPTH = MAX_CONTENTS_LEVELS;

export default {
  props: {
    inventoryId: String,
    title: String
  },

  data: () => ({
    uid: `invwiki-contents-${Math.round(Math.random() * 10000)}`,
    maxDepth: MAX_DEPTH,
    // list: the contained items; sign: large labels of the container itself
    kind: 'list',
    // how many levels of sub containers to list the contents of, none by default
    levels: 0,
    loading: false,
    printing: false,
    error: '',
    rows: [],
    pdf: null,
    blobURL: null
  }),

  computed: {
    sign() {
      return this.kind === 'sign';
    },

    nested() {
      return this.rows.some(e => e.depth > 0);
    }
  },

  methods: {
    // all items located in a container, depth first, contents of sub containers right below them
    async collect(containerId, depth = 0, seen = new Set([containerId.toUpperCase()])) {
      const ids = (await searchItems(`location: ${containerId}`)).filter(id => !seen.has(id));
      ids.forEach(id => seen.add(id));

      const items = (await Promise.all(ids.map(async (id) => ({ id, item: await fetchInventoryItem(id) }))))
        .filter(e => e.item)
        .sort((a, b) => a.id.localeCompare(b.id));

      const rows = [];
      for (const { id, item } of items) {
        rows.push({ id, title: item.title || '', description: item.description || '', depth });
        if (item.container && depth < Math.min(this.levels, MAX_DEPTH)) {
          rows.push(...await this.collect(id, depth + 1, seen));
        }
      }

      return rows;
    },

    createPDF() {
      return contentsDocument({
        kind: 'Inhaltsliste',
        heading: this.inventoryId,
        subheading: this.title || '',
        inventoryId: this.inventoryId,
        rows: this.rows,
        url: `${WIKI_ORIGIN}/${PREFIX}/${this.inventoryId.toLowerCase()}`,
        empty: 'Keine Gegenstände an diesem Aufenthaltsort.',
      });
    },

    open() {
      this.kind = 'list';
      this.levels = 0;
      this.$refs.dialog.show();
      this.generate();
    },

    async generate() {
      this.loading = true;
      this.error = '';

      try {
        // pdfmake's document must not be wrapped in a reactive proxy, some of its properties are read-only
        if (this.sign) {
          this.pdf = markRaw(pdfMake.createPdf(await this.signDocument()));
        } else {
          this.rows = await this.collect(this.inventoryId);
          this.pdf = markRaw(pdfMake.createPdf(await this.createPDF()));
        }

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

    // the label as printed, with serial number and owner, from the page as saved
    async signDocument() {
      const item = await fetchInventoryItem(this.inventoryId) || {};
      return signDocument({
        id: this.inventoryId,
        title: item.title || this.title || '',
        description: labelDescription({
          inventoryId: this.inventoryId,
          description: item.description || '',
          serial: item.serial || '',
          owner: item.owner || '',
        }),
      });
    },

    print() {
      const win = window.open('', '_blank');
      this.pdf?.print?.({}, win);
    },

    // the print station builds the list itself, with the same depth of sub containers
    async printRemote() {
      if (this.printing) {
        return;
      }

      this.printing = true;
      try {
        if (this.sign) {
          await remotePrintSign(this.inventoryId);
        } else {
          await remotePrintContents(this.inventoryId, this.levels);
        }
        this.$refs.dialog.close();
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.printing = false;
      }
    }
  }
}
</script>
