<template>
  <button @click="open" v-if="singleItem">
    <mdi-icon icon="home-map-marker" left />
    Ort Aktualisieren
  </button>

  <button @click="open" v-if="selected?.length > 0">
    <mdi-icon icon="home-map-marker" left />
    {{ selected.length > 1 ? selected.length : '' }} ausgewählte{{  selected.length > 1 ? '' : 'n' }} einen neuen Ort zuweisen
  </button>

  <x-dialog :title="`Ort Aktualisieren (${singleItem ? $parent.inventoryId : `${selected.length} ${selected.length > 1 ? 'Gegenstände' : 'Gegenstand'}`})`" icon="home-map-marker" ref="dialog" :loading="loading">
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
import { fetchLocations, searchItems, writeItem } from '@/utils/api.js';
import SearchAutocomplete from '@/components/SearchAutocomplete.vue';

export default {
  components: {
    SearchAutocomplete
  },

  props: {
    selected: Array,
    singleItem: Boolean
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

      if (this.singleItem) {
        this.location = this.$parent?.temporary?.location || this.$parent?.nominal?.location || '';
        this.description = this.$parent?.temporary?.description || this.$parent?.nominal?.description || '';
      } else {
        this.location = '';
        this.description = '';
      }

      this.locations = (await Promise.all([
        fetchLocations(),
        searchItems('"container: true"'),
      ])).flat();

      this.loading = false;
    },

    async saveLocation(mode) {
      if (this.loading) {
        return;
      }

      this.loading = true;
      try {
        await Promise.all(
          (this.singleItem ? [location.pathname] : this.selected).map((e) => {
            return writeItem(e, {}, {
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
          })
        );

        if (this.singleItem) {
          location.reload();
        } else {
          // refresh cache by loading all items
          await Promise.all(this.selected.map(e => fetch(e)));
          alert(`${this.selected.length} ${this.selected.length > 1 ? 'Gegenstände' : 'Gegenstand'} aktualisiert`);
          this.$refs.dialog.close();
        }
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.loading = false;
      }
    }
  }
}
</script>
