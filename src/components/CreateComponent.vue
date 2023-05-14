<template>
  <button @click="createItem" v-if="!edit">
    <mdi-icon icon="toy-brick-plus-outline" left />
    Neuen Gegenstand Anlegen
  </button>
  <button @click="editItem" v-else>
    <mdi-icon icon="square-edit-outline" left />
    Gegenstand Bearbeiten
  </button>

  <x-dialog :title="edit ? 'Gegestand Bearbeiten' : 'Neuen Gegenstand Anlegen'" :icon="edit ? 'square-edit-outline' : 'toy-brick-plus-outline'" ref="dialog" :loading="loading">
    <div>
      <template v-if="!edit">
        <label for="invwiki-form-title">
          <mdi-icon icon="toy-brick-outline" left title="Gegenstand" />
          Gegenstand
        </label>
        <input id="invwiki-form-title" type="text" v-model="title" />
      </template>

      <label for="invwiki-form-description">
        <mdi-icon icon="clipboard-text-outline" left title="Kurzbeschreibung" />
        Kurzbeschreibung
      </label>
      <textarea id="invwiki-form-description" v-model="description"></textarea>
      <blockquote>
        Die Kurzbeschreibung wird mit auf den Inventaraufkleber gedruckt und ist daher nur eine Zeile. 
        Weitere Informationen zum Gegenstand und Anhänge können im nächsten Schritt bei der Wiki-Seite hinterlegt werden. 
      </blockquote>

      <label for="invwiki-form-category">
        <mdi-icon icon="tag-outline" left title="Kategorie" />
        Kategorie
      </label>
      <input id="invwiki-form-category" type="text" v-model="category" />

      <label for="invwiki-form-origin">
        <mdi-icon icon="account-question-outline" left title="Ursprung / Besitzer*in" />
        Ursprung / Besitzer*in
      </label>
      <input id="invwiki-form-origin" type="text" v-model="origin" />

      <label for="invwiki-form-date">
        <mdi-icon icon="calendar" left title="Anschaffungsdatum" />
        Anschaffungsdatum
      </label>
      <input id="invwiki-form-date" type="date" v-model="date" />

      <label for="invwiki-form-serial">
        <mdi-icon icon="pound-box-outline" left title="Seriennummer" />
        Seriennummer
      </label>
      <input id="invwiki-form-serial" type="text" v-model="serial" />

      <label for="invwiki-form-invoice">
        <mdi-icon icon="file-document-outline" left title="Rechnung" />
        Rechnung
      </label>
      <input id="invwiki-form-invoice" type="text" v-model="invoice" />

      <template v-if="!edit">
        <search-autocomplete v-model="classification" :items="din6779" label="Kennbuchstabe" grouped :keys="['value', 'text', 'example']" autofocus :serializer="(e) => `${e.value}: ${e.text}`">
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
        <select id="invwiki-form-suffix" v-model="suffix">
          <option value=""></option>
          <option v-for="s in Array(26).fill(null).map((_, i) => String.fromCharCode(65+i))" :key="s" :value="s">{{s}}</option>
        </select>
        <blockquote>
          Wenn Netzteile ein eigenes Label erhalten, aber nicht extra inventarisiert werden, so endet der QR-Code und die Nummer auf -N. Bei sonstigen Zubehör, auf -Z (und dann das Alphabet rückwärts).
        </blockquote>

        <label for="invwiki-form-id">Zu Vergebene Inventarnummer</label>
        <input id="invwiki-form-id" type="text" :value="id" disabled />
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

const PREFIX = 'inventar';
const SEP = ':';
const REGEX = new RegExp(`^/${PREFIX.toUpperCase()}/.*[SVL]-[A-Z]{2}([0-9]{6})-?[A-Z]?$`);

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

    classification: null
  }),

  methods: {
    async createItem() {
      const res = await fetch('/lib/exe/ajax.php', {
        method: 'POST',
        body: `call=index&idx=${PREFIX}`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        }
      });
      const data = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(data, 'text/html');

      this.number = String(Math.max(
        ...[...doc.querySelectorAll('a[data-wiki-id]')]
          .map(e => Number(REGEX.exec(String(e.getAttribute('href')).replaceAll(':', '/').toUpperCase())?.[1]))
          .filter(e => !isNaN(e))
      ) + 1).padStart(6, '0');
      this.loading = false;
      this.$refs.dialog.show();
    },

    async editItem() {
      this.number = '000000';
      this.loading = false;

      this.title = this.$parent.title || '';
      this.description = this.$parent.description || '';
      this.serial = this.$parent.serial || '';
      this.invoice = this.$parent.invoice || '';
      this.date = this.$parent.date || '';
      this.category = this.$parent.category || '';
      this.origin = this.$parent.origin || '';
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
        const content = doc.querySelector('#wiki__text').value.split('\n');
        const result = [];
        const yaml = [];
        let skip = 0;

        for (const line of content) {
          if (line === '```yaml') {
            skip = 1;
          } else if (skip && line === '```') {
            result.push('```yaml');

            const data = YAML.parse(yaml.join('\n'));
            data.description = this.description;
            data.serial = this.serial;
            data.invoice = this.invoice;
            data.date = this.date;
            data.category = this.category;
            data.origin = this.origin;

            result.push(YAML.stringify(data));
            result.push('```');
            skip = 2;
          } else if (skip !== 1) {
            result.push(line);
          } else {
            yaml.push(line);
          }
        }

        if (skip !== 2) {
          this.loading = false;
          alert('Error: unable to patch yaml code block.');
          return;
        }

        data.set('wikitext', result.join('\n'));
      } else {
        data.set('wikitext', [
          '<!DOCTYPE markdown>',
          `# ${this.title}`,
          '',
          '```yaml',
          'inventory: true',
          `description: '${this.description.replaceAll(`'`, `''`)}'`,
          'nominal:',
          'temporary:',
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
      return `V-${this.classification?.value || '??'}${this.number || '??????'}${this.suffix ? `-${this.suffix}` : ''}`;
    },

    disabled() {
      return this.id.includes('?') && !this.edit || this.loading;
    }
  }
}
</script>