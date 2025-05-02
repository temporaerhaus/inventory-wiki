<template>
  <button @click="open">
    <mdi-icon icon="home-map-marker" left />
    Ort Aktualisieren
  </button>

  <x-dialog :title="`Ort Aktualisieren (${$parent.inventoryId})`" icon="home-map-marker" ref="dialog" :loading="loading">
    <div>
      <search-autocomplete v-model="location" :items="locations" :keys="[]" label="Ort" autofocus>
        <template #group="item">
          <b>{{ item.group.group }}:</b>
          <div>{{ item.group.text }}</div>
        </template>

        <template #item="item">
          <b>{{ item.value }}:</b>
          <div>
            {{ item.text }}
            <pre v-if="item.example">{{item.example}}</pre>
          </div>
        </template>
      </search-autocomplete>

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

import { fetchLocations, fetchItems, writeItem } from '@/utils/api.js';

import SearchAutocomplete from '@/components/SearchAutocomplete.vue';

const REGEX = /```yaml\n(.*)\n```/s;

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

      this.location = this.$parent?.temporary?.location || this.$parent?.nominal?.location || '';
      this.description = this.$parent?.temporary?.description || this.$parent?.nominal?.description || '';

      this.locations = (await Promise.all([
        fetchLocations(),
        fetchItems()
      ])).flat();

      this.loading = false;
    },

    async saveLocation(mode) {
      if (this.loading) {
        return;
      }

      this.loading = true;
      try {
        await writeItem(location.pathname, {}, {
          summary: `location update (mode=${mode})`,
          replacer: (yaml) => {
            switch (mode) {
              case 0:
                yaml.temporary = {
                  location: this.location,
                  description: this.description,
                  timestamp: new Date().toJSON()
                };
                yaml.nominal = yaml.nominal ?? {};
                break;

              case 1:
                yaml.nominal = {
                  location: this.location,
                  description: this.description,
                  timestamp: new Date().toJSON()
                };
                yaml.temporary = yaml.temporary ?? {};
                break;

              case 2:
                yaml.temporary = {};
                yaml.nominal = yaml.nominal ?? {};
                break;
            }

            return yaml;
          }
        });

        location.reload();
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.loading = false;
      }
    }
  }
}
</script>