<template>
  <button @click="editItem" v-if="sub">
    <mdi-icon icon="subdirectory-arrow-right" left />
    Unter-Gegenstand Hinzufügen
  </button>
  <button @click="editItem" v-else-if="clone">
    <mdi-icon icon="content-duplicate" left />
    Gegenstand Duplizieren
  </button>
  <button @click="editItem" v-else-if="edit">
    <mdi-icon icon="square-edit-outline" left />
    Gegenstand Bearbeiten
  </button>
  <button @click="createItem" v-else>
    <mdi-icon icon="toy-brick-plus-outline" left />
    Neuen Gegenstand Anlegen
  </button>

  <x-dialog :title="edit ? 'Gegenstand Bearbeiten' : 'Neuen Gegenstand Anlegen'" :icon="edit ? 'square-edit-outline' : 'toy-brick-plus-outline'" ref="dialog" :loading="loading">
    <div>
      <label for="invwiki-form-title">
        <mdi-icon icon="toy-brick-outline" left title="Gegenstand" />
        Gegenstand
      </label>
      <input id="invwiki-form-title" type="text" v-model="title" @focus="$refs.c?.close?.()" />

      <template v-if="edit">
        <label for="invwiki-form-id">Inventarnummer</label>
        <input id="invwiki-form-id" type="text" :value="inventoryId" disabled />
      </template>

      <label for="invwiki-form-description">
        <mdi-icon icon="clipboard-text-outline" left title="Kurzbeschreibung" />
        Kurzbeschreibung
      </label>
      <textarea id="invwiki-form-description" v-model="description" @focus="$refs.c?.close?.()"></textarea>
      <blockquote>
        Die Kurzbeschreibung wird mit auf den Inventaraufkleber gedruckt und ist daher nur eine Zeile.
        Weitere Informationen zum Gegenstand und Anhänge können im nächsten Schritt bei der Wiki-Seite hinterlegt werden.
      </blockquote>

      <label for="invwiki-form-category">
        <mdi-icon icon="tag-outline" left title="Kategorie" />
        Kategorie
      </label>
      <input id="invwiki-form-category" type="text" v-model="category" @focus="$refs.c?.close?.()" />

      <label for="invwiki-form-origin">
        <mdi-icon icon="basket-unfill" left title="Ursprung" />
        Ursprung
      </label>
      <input id="invwiki-form-origin" type="text" v-model="origin" @focus="$refs.c?.close?.()" />

      <label for="invwiki-form-owner">
        <mdi-icon icon="account-question-outline" left title="Besitzer*in" />
        Besitzer*in
      </label>
      <input id="invwiki-form-owner" type="text" v-model="owner" @focus="$refs.c?.close?.()" />

      <label for="invwiki-form-lended" v-if="!edit">
        <input id="invwiki-form-lended" type="checkbox" v-model="lended" />
        <mdi-icon icon="account-question-outline" left />
        Leihgabe
      </label>

      <label for="invwiki-form-small">
        <input id="invwiki-form-small" type="checkbox" v-model="small" />
        <mdi-icon icon="image-size-select-small" left />
        Kleines Label
      </label>

      <label for="invwiki-form-date">
        <mdi-icon icon="calendar" left title="Anschaffungsdatum" />
        Anschaffungsdatum
      </label>
      <input id="invwiki-form-date" type="date" v-model="date" @focus="$refs.c?.close?.()" />

      <label for="invwiki-form-serial">
        <mdi-icon icon="pound-box-outline" left title="Seriennummer" />
        Seriennummer
      </label>
      <input id="invwiki-form-serial" type="text" v-model="serial" @focus="$refs.c?.close?.()" />

      <label for="invwiki-form-invoice">
        <mdi-icon icon="file-document-outline" left title="Rechnung" />
        Rechnung
      </label>
      <input id="invwiki-form-invoice" type="text" v-model="invoice" @focus="$refs.c?.close?.()" />

      <template v-if="!edit">
        <search-autocomplete v-model="classification" :items="din6779" label="Kennbuchstabe" icon="shape-outline" grouped :keys="weights" :serializer="(e) => e.value" ref="c" :disabled="sub" />
        <blockquote v-if="classification?.text">
          {{ classification.text }}
        </blockquote>

        <label for="invwiki-form-number">
          <mdi-icon icon="numeric-positive1" left title="Fortlaufende Nummer" />
          Fortlaufende Nummer
        </label>
        <input id="invwiki-form-number" type="text" :value="number" disabled />

        <label for="invwiki-form-suffix">
          <mdi-icon icon="sort-alphabetical-descending" left title="Optionales Suffix" />
          Optionales Suffix
        </label>
        <select id="invwiki-form-suffix" v-model="suffix" @focus="$refs.c?.close?.()">
          <option value=""></option>
          <option v-for="s in suffixOptions" :key="s" :value="s">{{s}}</option>
        </select>
        <blockquote>
          Wenn Netzteile ein eigenes Label erhalten, aber nicht extra inventarisiert werden, so endet der QR-Code und die Nummer auf -N. Bei sonstigen Zubehör, auf -Z (und dann das Alphabet rückwärts).
        </blockquote>

        <label for="invwiki-form-id">
          <mdi-icon icon="barcode" left title="Rechnung" />
          Zu Vergebene Inventarnummer
        </label>
        <input id="invwiki-form-id" type="text" :value="id" disabled @focus="$refs.c?.close?.()" />
      </template>

      <div style="text-align: right; padding-top: 1em; padding-bottom: 5em; padding-right: 1em;">
        <button @click="saveItem()" :disabled="disabled" v-if="!edit">
          <mdi-icon icon="toy-brick-plus-outline" left title="Gegenstand Anlegen" />
          Gegenstand Anlegen
        </button>
        <button @click="saveItem()" :disabled="disabled" v-else>
          <mdi-icon icon="content-save-outline" left title="Speichern" />
          Speichern
        </button>
      </div>
    </div>
  </x-dialog>
</template>

<script>
import YAML from 'yaml';

import SearchAutocomplete from '@/components/SearchAutocomplete.vue';
import din6779 from '@/utils/din6779.js';

import { SEP, PREFIX, nextNumber, lock, release } from '@/utils/api.js';

const ID_REGEX = new RegExp(`^([SVL])-([A-Z]{2})([0-9]{6})-?([A-Z])?$`);
const YAML_REGEX = /```yaml\n(.*)\n```/s;

export default {
  props: {
    edit: Boolean,
    clone: Boolean,
    sub: Boolean
  },

  components: {
    SearchAutocomplete
  },

  data: () => ({
    din6779,

    loading: true,

    number: '',
    title: '',
    suffix: '',
    inventoryId: '',
    description: '',
    serial: '',
    invoice: '',
    date: null,
    category: '',
    origin: '',
    owner: '',
    lended: null,
    small: null,

    classification: null,
    suffixOptions: ['N', ...Array(26).fill(null).map((_, i) => String.fromCharCode(90-i)).filter(e => e !== 'N')]
  }),

  methods: {
    async refreshNumber() {
      if (this.edit || this.sub) {
        return;
      }
      this.number = await nextNumber();
    },

    async createItem() {
      await this.refreshNumber();
      this.loading = false;
      this.$refs.dialog.show();
    },

    async editItem() {
      this.loading = false;

      this.title = this.$parent.title || '';
      this.inventoryId = this.$parent.inventoryId || '';
      this.description = this.$parent.description || '';
      this.serial = this.$parent.serial || '';
      this.invoice = this.$parent.invoice || '';
      this.date = this.$parent.date || '';
      this.category = this.$parent.category || '';
      this.origin = this.$parent.origin || '';
      this.owner = this.$parent.owner || '';
      this.small = this.$parent.small || null;

      const res = ID_REGEX.exec(this.$parent.inventoryId);

      this.number = res?.[3] || '000000';
      this.classification = {
        value: res?.[2] || '??',
        text: res?.[2] || '??',
        example: ''
      };
      this.suffix = res?.[4] || '';
      if (res?.[1] == 'L') {
        this.lended = true;
      }

      this.$refs.dialog.show();
    },

    async saveItem() {
      this.loading = true;
      try {
        const token = await lock();
        if (!this.edit) {
          await this.refreshNumber();
        }

        const res = await fetch(`${this.edit ? location.pathname : `/${PREFIX}${SEP}${this.id}`}?do=edit`);
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const data = new FormData(doc.querySelector('form[method="post"]'));
        if (this.edit) {
          if (!YAML_REGEX.test(data.get('wikitext'))) {
            alert('Kein gültiger YAML-Block gefunden');
            this.loading = false;
            return;
          }

          const yaml = YAML.parse(YAML_REGEX.exec(data.get('wikitext'))[1]);
          yaml.description = this.description || '';
          yaml.serial = this.serial || '';
          yaml.invoice = this.invoice || '';
          yaml.date = this.date || '';
          yaml.category = this.category || '';
          yaml.origin = this.origin || '';
          yaml.owner = this.owner || '';
          yaml.small = this.small || false;

          data.set('summary', `edit metadata`);
          data.set('wikitext', data.get('wikitext').replace(YAML_REGEX, '```yaml\n' + YAML.stringify(yaml) + '\n```').replace(/\n# .*/, `\n# ${this.title}`));
        } else {
          if (data.get('wikitext') && data.get('wikitext') !== "Please use the inventory system to create items") {
            throw new Error('Ziel Seite ist nicht leer');
          }

          const yaml = {
            inventory: true,
            description: this.description || '',
            serial: this.serial || '',
            invoice: this.invoice || '',
            date: this.date || '',
            category: this.category || '',
            origin: this.origin || '',
            owner: this.owner || '',
            small: this.small || false,
            nominal: {},
            temporary: {},
          };

          data.set('wikitext', [
            '<!DOCTYPE markdown>',
            `# ${this.title}`,
            '',
            '```yaml',
            YAML.stringify(yaml),
            '```',
            '',
          ].join('\n'));
        }
        data.set('do[save]', '1');
        await fetch(`${this.edit ? location.pathname : `/${PREFIX}${SEP}${this.id}`}?do=edit`, {
          method: 'post',
          body: data
        });

        await release(token);

        this.loading = false;
        if (this.edit) {
          location.reload();
        } else {
          location.href = `/${PREFIX}${SEP}${this.id}#print-label`;
        }
      } catch (e) {
        alert(`Fehler: ${e.message}`);
        this.loading = false;
      }
    }
  },

  computed: {
    id() {
      return `${this.lended ? 'L' : 'V'}-${this.classification?.value || '??'}${this.number || '??????'}${this.suffix ? `-${this.suffix}` : ''}`;
    },

    disabled() {
      return this.id.includes('?') && !this.edit || this.loading;
    },

    weights() {
      return [{
        name: 'value',
        weight: 0.4
      }, {
        name: 'text',
        weight: 0.3
      }, {
        name: 'group.text',
        weight: 0.2
      }, {
        name: 'example',
        weight: 0.1
      }];
    }
  }
}
</script>
