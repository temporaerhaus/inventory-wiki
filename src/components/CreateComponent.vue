<template>
  <button @click="createItem" v-if="!edit">
    <mdi-icon icon="toy-brick-plus-outline" left />
    Neuen Gegenstand Anlegen
  </button>
  <button @click="editItem" v-else>
    <mdi-icon icon="square-edit-outline" left />
    Gegenstand Bearbeiten
  </button>

  <x-dialog :title="edit ? 'Gegenstand Bearbeiten' : 'Neuen Gegenstand Anlegen'" :icon="edit ? 'square-edit-outline' : 'toy-brick-plus-outline'" ref="dialog" :loading="loading">
    <div>
      <template v-if="!edit">
        <label for="invwiki-form-title">
          <mdi-icon icon="toy-brick-outline" left title="Gegenstand" />
          Gegenstand
        </label>
        <input id="invwiki-form-title" type="text" v-model="title" @focus="$refs.c?.close?.()" />
      </template>

      <!--
      <template v-if="edit">
        <label for="invwiki-form-id">Inventarnummer</label>
        <input id="invwiki-form-id" type="text" :value="id" disabled />
      </template>
      -->

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

      <label for="invwiki-form-lended">
        <input id="invwiki-form-lended" type="checkbox" v-model="lended" />
        <mdi-icon icon="account-question-outline" left />
        Leihgabe
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
        <search-autocomplete v-model="classification" :items="din6779" label="Kennbuchstabe" grouped :keys="['value', 'text', 'example']" :serializer="(e) => `${e.value}: ${e.text}`" ref="c">
          <template #group="item">
            <b style="width: 30px; display: inline-block;">{{ item.group }}:</b>
            {{ item.text }}
          </template>

          <template #item="item">
            <b style="width: 30px; display: inline-block;">{{ item.value }}</b>
            {{ item.text }}

            <pre v-if="item.example" style="font-size: 80%; margin: 0; width: auto;">{{item.example}}</pre>
          </template>
        </search-autocomplete>

        <label for="invwiki-form-number">Fortlaufende Nummer</label>
        <input id="invwiki-form-number" type="text" :value="number" disabled />

        <label for="invwiki-form-suffix">Optionales Suffix</label>
        <select id="invwiki-form-suffix" v-model="suffix" @focus="$refs.c?.close?.()">
          <option value=""></option>
          <option v-for="s in Array(26).fill(null).map((_, i) => String.fromCharCode(65+i))" :key="s" :value="s">{{s}}</option>
        </select>
        <blockquote>
          Wenn Netzteile ein eigenes Label erhalten, aber nicht extra inventarisiert werden, so endet der QR-Code und die Nummer auf -N. Bei sonstigen Zubehör, auf -Z (und dann das Alphabet rückwärts).
        </blockquote>

        <label for="invwiki-form-id">Zu Vergebene Inventarnummer</label>
        <input id="invwiki-form-id" type="text" :value="id" disabled @click="refreshNumber()" @focus="$refs.c?.close?.()" />
      </template>

      <div style="text-align: right; margin-right: -.5em;">
        <button @click="saveItem()" :disabled="disabled" v-if="!edit">Gegenstand Anlegen</button>
        <button @click="saveItem()" :disabled="disabled" v-else>Speichern</button>
      </div>
    </div>
  </x-dialog>
</template>

<script>
import YAML from 'yaml';

import SearchAutocomplete from '@/components/SearchAutocomplete.vue';
import din6779 from '@/utils/din6779.js';

import { SEP, PREFIX, nextNumber } from '@/utils/api.js';

const ID_REGEX = new RegExp(`^([SVL])-([A-Z]{2})([0-9]{6})-?([A-Z])?$`);
const YAML_REGEX = /```yaml\n(.*)\n```/s;

export default {
  props: {
    edit: Boolean
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
    description: '',
    serial: '',
    invoice: '',
    date: null,
    category: '',
    origin: '',
    owner: '',
    lended: null,

    classification: null
  }),

  methods: {
    async refreshNumber() {
      if (this.edit) {
        return;
      }
      if (import.meta.env.MODE === 'development') {
        this.number = '000002';
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

      this.id = this.$parent.id || '';
      this.title = this.$parent.title || '';
      this.description = this.$parent.description || '';
      this.serial = this.$parent.serial || '';
      this.invoice = this.$parent.invoice || '';
      this.date = this.$parent.date || '';
      this.category = this.$parent.category || '';
      this.origin = this.$parent.origin || '';
      this.owner = this.$parent.owner || '';
      this.number = ID_REGEX.exec(this.$parent.inventoryId)?.[3] || '000000'
      this.classification = ID_REGEX.exec(this.$parent.inventoryId)?.[2] || '??' // FIXME: doesn't work for edit, how to set value?
      this.suffix = ID_REGEX.exec(this.$parent.inventoryId)?.[4] || ''
      if (ID_REGEX.exec(this.$parent.inventoryId)?.[1] == 'L') {
        this.lended = true;
      }

      this.$refs.dialog.show();
    },

    async saveItem() {
      this.loading = true;
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

        data.set('summary', `edit metadata`);
        data.set('wikitext', data.get('wikitext').replace(YAML_REGEX, '```yaml\n' + YAML.stringify(yaml) + '\n```'));
      } else {
        await this.refreshNumber();
        const yaml = {
          inventory: true,
          description: this.description || '',
          serial: this.serial || '',
          invoice: this.invoice || '',
          date: this.date || '',
          category: this.category || '',
          origin: this.origin || '',
          owner: this.owner || '',
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

      this.loading = false;
      if (this.edit) {
        location.reload();
      } else {
        location.href = `/${PREFIX}${SEP}${this.id}#print-label`;
      }
    }
  },

  computed: {
    id() {
      return `${this.lended ? 'L' : 'V'}-${this.classification?.value || '??'}${this.number || '??????'}${this.suffix ? `-${this.suffix}` : ''}`;
    },

    disabled() {
      return this.id.includes('?') && !this.edit || this.loading;
    }
  }
}
</script>
