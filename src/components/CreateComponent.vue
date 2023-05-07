<template>
  <button @click="createItem">
    <mdi-icon icon="toy-brick-plus-outline" left />
    Neuen Gegenstand Anlegen
  </button>

  <x-dialog title="Neuen Gegenstand Anlegen" icon="toy-brick-plus-outline" ref="dialog" :loading="loading">
    <div>
      <label for="invwiki-form-title">Gegenstand</label>
      <input id="invwiki-form-title" type="text" v-model="title" />

      <label for="invwiki-form-description">Kurzbeschreibung</label>
      <input id="invwiki-form-description" type="text" v-model="description" />
      <blockquote>
        Die Kurzbeschreibung wird mit auf den Inventaraufkleber gedruckt und ist daher nur eine Zeile. 
        Weitere Informationen zum Gegenstand und Anhänge können im nächsten Schritt bei der Wiki-Seite hinterlegt werden. 
      </blockquote>

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

      <div style="text-align: right; margin-right: -.5em;">
        <button @click="saveItem()" :disabled="disabled">Gegenstand Anlegen</button>
      </div>
    </div>
  </x-dialog>
</template>

<script>
import SearchAutocomplete from '@/components/SearchAutocomplete.vue';
import din6779 from '@/utils/din6779.js';

const PREFIX = 'inventar';
const SEP = ':';
const REGEX = new RegExp(`^/${PREFIX.toUpperCase()}/.*[SVL]-[A-Z]{2}([0-9]{6})-?[A-Z]?$`);

export default {
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
    classification: null,
  }),

  mounted() {
  },

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

    async saveItem() {
      this.loading = true;
      const res = await fetch(`/${PREFIX}${SEP}${this.id}?do=edit`);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      console.log(doc.querySelector('form[method="post"]'));
      const data = new FormData(doc.querySelector('form[method="post"]'));
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
      data.set('do[save]', '1');

      if (data.get('summary') === 'created') {
        await fetch(`/${PREFIX}${SEP}${this.id}?do=edit`, {
          method: 'post',
          body: data
        });
      }

      this.loading = false;
      location.href = `/${PREFIX}${SEP}${this.id}#print-label`;
    }
  },

  computed: {
    id() {
      return `V-${this.classification?.value || '??'}${this.number || '??????'}${this.suffix ? `-${this.suffix}` : ''}`;
    },

    disabled() {
      return this.id.includes('?') || this.loading;
    }
  }
}
</script>