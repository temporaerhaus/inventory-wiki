<template>
  <button @click="open" v-if="selected?.length > 0">
    <mdi-icon icon="square-edit-outline" left />
    {{ selected.length > 1 ? selected.length : '' }} ausgewählte{{ selected.length > 1 ? '' : 'n' }} bearbeiten
  </button>

  <x-dialog :title="`${selected.length} ${selected.length > 1 ? 'Gegenstände' : 'Gegenstand'} bearbeiten`" icon="square-edit-outline" ref="dialog" :loading="loading">
    <div>
      <blockquote>
        Nur angehakte Felder werden geändert, alle anderen behalten bei jedem Gegenstand ihren bisherigen Wert.
        Ein angehaktes, leeres Feld wird bei allen Gegenständen geleert.
      </blockquote>

      <template v-for="field in fields" :key="field.key">
        <label :for="`${uid}-${field.key}-apply`" class="invwiki-bulk-apply">
          <input type="checkbox" :id="`${uid}-${field.key}-apply`" v-model="apply[field.key]" />
          <mdi-icon :icon="field.icon" left :title="field.label" />
          {{ field.label }}
        </label>
        <textarea v-if="field.type === 'textarea'" v-model="values[field.key]" @input="apply[field.key] = true"></textarea>
        <label v-else-if="field.type === 'checkbox'" :for="`${uid}-${field.key}`" class="invwiki-bulk-value">
          <input type="checkbox" :id="`${uid}-${field.key}`" v-model="values[field.key]" @change="apply[field.key] = true" />
          {{ field.hint }}
        </label>
        <input v-else :type="field.type" v-model="values[field.key]" @input="apply[field.key] = true" />
      </template>

      <div style="text-align: right; padding-top: 1em; padding-bottom: 5em; padding-right: 1em;">
        <button @click="save()" :disabled="loading || !changedKeys.length">
          <mdi-icon icon="content-save-outline" left title="Speichern" />
          {{ changedKeys.length ? `${changedKeys.length} ${changedKeys.length > 1 ? 'Felder' : 'Feld'} bei ${selected.length} ${selected.length > 1 ? 'Gegenständen' : 'Gegenstand'} speichern` : 'Speichern' }}
        </button>
      </div>
    </div>
  </x-dialog>
</template>

<script>
import { writeItem } from '@/utils/api.js';

const FIELDS = [
  { key: 'description', label: 'Kurzbeschreibung', icon: 'clipboard-text-outline', type: 'textarea' },
  { key: 'category', label: 'Kategorie', icon: 'tag-outline', type: 'text' },
  { key: 'origin', label: 'Ursprung', icon: 'basket-unfill', type: 'text' },
  { key: 'owner', label: 'Eigentümer*in', icon: 'account-question-outline', type: 'text' },
  { key: 'date', label: 'Anschaffungsdatum', icon: 'calendar', type: 'date' },
  { key: 'invoice', label: 'Rechnung', icon: 'file-document-outline', type: 'text' },
  { key: 'small', label: 'Kleines Label', icon: 'image-size-select-small', type: 'checkbox', hint: 'Kleines Label verwenden' },
  { key: 'container', label: 'Behälter', icon: 'package-variant', type: 'checkbox', hint: 'Kann andere Gegenstände beherbergen' },
];

export default {
  props: {
    // paths of the selected item pages
    selected: Array
  },

  data: () => ({
    uid: `invwiki-bulk-${Math.round(Math.random() * 10000)}`,
    fields: FIELDS,
    loading: false,
    apply: {},
    values: {}
  }),

  computed: {
    changedKeys() {
      return this.fields.map(e => e.key).filter(key => this.apply[key]);
    }
  },

  methods: {
    open() {
      this.apply = {};
      this.values = Object.fromEntries(this.fields.map(e => [e.key, e.type === 'checkbox' ? false : '']));
      this.$refs.dialog.show();
    },

    async save() {
      if (this.loading || !this.changedKeys.length) {
        return;
      }

      // writeItem keeps every field that is not part of the entry
      const entry = Object.fromEntries(this.changedKeys.map(key => [key, this.values[key]]));
      const summary = `bulk edit (${this.changedKeys.join(', ')})`;

      this.loading = true;
      try {
        const results = await Promise.allSettled(this.selected.map(path => writeItem(path, entry, { summary })));
        const failed = results
          .map((result, i) => [this.selected[i], result])
          .filter(([, result]) => result.status === 'rejected');

        // refresh cache by loading all items
        await Promise.all(this.selected.map(e => fetch(e)));

        if (failed.length) {
          alert(`Fehler bei ${failed.length} von ${this.selected.length}:\n${failed.map(([path, result]) => `${path.split('/').pop().toUpperCase()}: ${result.reason?.message}`).join('\n')}`);
        } else {
          alert(`${this.selected.length} ${this.selected.length > 1 ? 'Gegenstände' : 'Gegenstand'} aktualisiert`);
          this.$refs.dialog.close();
        }
      } finally {
        this.loading = false;
      }
    }
  }
}
</script>
