<template>
  <button @click="open">
    <mdi-icon icon="home-map-marker" left />
    Ort Aktualisieren
  </button>

  <x-dialog :title="`Ort Aktualisieren (${$root.id})`" icon="home-map-marker" ref="dialog" :loading="loading">
    <div>
      <search-autocomplete v-model="location" :items="locations" :keys="[]" label="Ort" autofocus />

      <label for="invwiki-location-description">Weitere Infos</label>
      <textarea id="invwiki-location-description" v-model="description" />

      <div class="flex-row">
        <button @click="saveLocation(0)" :disabled="loading">
          <mdi-icon left icon="map-clock-outline" />
          Als aktuellen Ort speichern
        </button>
        <button @click="saveLocation(1)" :disabled="loading">
          <mdi-icon left icon="content-save-alert-outline" />
          Als Soll-Ort speichern
        </button>
        <button @click="saveLocation(2)" :disabled="loading">
          <mdi-icon left icon="undo-variant" />
          Auf Soll-Ort zurücksetzen
        </button>
      </div>
    </div>
  </x-dialog>
</template>

<script>
import YAML from 'yaml';

import SearchAutocomplete from '@/components/SearchAutocomplete.vue';

const REGEX = /```yaml.*```/s;

export default {
  components: {
    SearchAutocomplete
  },

  data: () => ({
    loading: false,
    locations: [],
    location: '',
    description: ''
  }),

  methods: {
    async open() {
      this.$refs.dialog.show();
      this.loading = true;
      this.location = this.$root.yaml?.temporary?.location || this.$root.yaml?.nominal?.location || '';
      this.description = this.$root.yaml?.temporary?.description || this.$root.yaml?.nominal?.description || '';

      const res = await fetch(`/inventar/locations`);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      this.locations = [...doc.querySelectorAll('#dokuwiki__content li')].map(e => e.innerText.trim());
      this.loading = false;
    },

    async saveLocation(mode) {
      if (this.loading || !this.$root.yaml) {
        return;
      }

      this.loading = true;

      const yaml = JSON.parse(JSON.stringify(this.$root.yaml));
      switch (mode) {
        case 0:
          yaml.temporary = {
            location: this.location,
            description: this.description,
            timestamp: new Date().toJSON()
          };
          yaml.nominal = yaml.nominal || {};
          break;

        case 1:
          yaml.nominal = {
            location: this.location,
            description: this.description,
            timestamp: new Date().toJSON()
          };
          yaml.temporary = yaml.temporary || {};
          break;

        case 2:
          yaml.temporary = {};
          yaml.nominal = yaml.nominal || {};
          break;
      }

      this.loading = true;
      const res = await fetch(`${location.pathname}?do=edit`);
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const data = new FormData(doc.querySelector('form[method="post"]'));
      if (!REGEX.test(data.get('wikitext'))) {
        alert('Kein gültiger YAML-Block gefunden');
        this.loading = false;
        return;
      }

      data.set('wikitext', data.get('wikitext').replace(REGEX, '```yaml\n' + YAML.stringify(yaml) + '\n```'));
      data.set('do[save]', '1');
      data.set('summary', `location update (mode=${mode})`);
      await fetch(`${location.pathname}?do=edit`, {
        method: 'post',
        body: data
      });

      this.loading = false;
      location.reload();
    }
  }
}
</script>