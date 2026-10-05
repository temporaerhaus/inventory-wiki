<template>
  <button @click="open" v-if="singleItem">
    <mdi-icon icon="home-map-marker" left />
    Aufenthaltsort Aktualisieren
  </button>

  <button @click="open" v-if="selected?.length > 0">
    <mdi-icon icon="home-map-marker" left />
    {{ selected.length > 1 ? selected.length : '' }} Ausgewählte{{  selected.length > 1 ? '' : 'm' }} einen anderen Aufenthaltsort zuweisen
  </button>

  <x-dialog :title="`Aufenthaltsort Aktualisieren (${singleItem ? $parent.inventoryId : `${selected.length} ${selected.length > 1 ? 'Gegenstände' : 'Gegenstand'}`})`" icon="home-map-marker" ref="dialog" :loading="loading">
    <div>
      <search-autocomplete v-model="location" :items="locations" :keys="keys" :serializer="(e) => e.value" label="Aufenthaltsort" autofocus restrict>
        <template #action>
          <button type="button" title="Aufenthaltsort scannen" @click="$refs.scanner.startScan()" :disabled="loading">
            <mdi-icon icon="qrcode-scan" title="Aufenthaltsort scannen" />
          </button>
        </template>

        <!-- the tree while browsing, the path of each hit while searching -->
        <template #item="{ item, searching }">
          <div class="invwiki-location-option" :style="searching ? '' : `padding-left: ${item.depth * 1.5}em`">
            <mdi-icon :icon="item.kind === 'place' ? 'map-marker-outline' : 'package-variant'" :title="item.kind === 'place' ? 'Ort' : 'Behälter'" left />
            <div>
              <b>{{ item.value }}</b><template v-if="item.title && !samePlace(item.title, item.value)">: {{ item.title }}</template>
              <small v-if="item.description">{{ item.description }}</small>
              <small v-if="searching && item.path.length">in {{ item.path.join(' › ') }}</small>
            </div>
          </div>
        </template>
      </search-autocomplete>

      <blockquote v-if="!loading && !validLocation">
        Bitte einen bestehenden Aufenthaltsort aus der Liste auswählen.
      </blockquote>

      <label :for="`invwiki-location-description-${nonce}`">Weitere Infos</label>
      <textarea :id="`invwiki-location-description-${nonce}`" v-model="description" />
      
      <label :for="`invwiki-location-update-last-seen-${nonce}`">
        <input type="checkbox" :id="`invwiki-location-update-last-seen-${nonce}`" v-model="updateLastSeen" />
        <mdi-icon left icon="eye-outline" />
        Zeitstempel "<em>Zuletzt gesehen am</em>" auf die aktuelle Zeit setzen
      </label>
    </div>

    <template #footer>
      <button @click="saveLocation(0)" :disabled="loading || !validLocation">
        <mdi-icon left icon="map-clock-outline" />
        Als aktuellen Aufenthaltsort speichern
      </button>
      <button @click="saveLocation(1)" :disabled="loading || !validLocation">
        <mdi-icon left icon="content-save-alert-outline" />
        Als regulären Aufenthaltsort speichern
      </button>
      <button @click="saveLocation(2)" :disabled="loading">
        <mdi-icon left icon="undo-variant" />
        Auf regulären Aufenthaltsort zurücksetzen
      </button>
    </template>
  </x-dialog>

  <scan-component pick title="Aufenthaltsort Scannen" ref="scanner" @scan="onScan" />
</template>

<script>
import { fetchLocationTree, setLocation, writeItem } from '@/utils/api.js';
import SearchAutocomplete from '@/components/SearchAutocomplete.vue';
import ScanComponent from '@/components/ScanComponent.vue';

const samePlace = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

export default {
  components: {
    SearchAutocomplete,
    ScanComponent
  },

  props: {
    selected: Array,
    singleItem: Boolean
  },

  data: () => ({
    loading: false,
    locations: [],
    location: null,
    keys: ['value', 'title', 'description', 'path'],
    description: '',
    updateLastSeen: true,
    // See CreateComponent.vue for explanation of nonce usage
    nonce: Math.floor(Math.random()*10000).toString(),
  }),

  computed: {
    validLocation() {
      return Boolean(this.location);
    }
  },

  methods: {
    samePlace,

    // a scanned label picks its container from the list
    onScan(id) {
      const option = this.locations.find(e => samePlace(e.value, id));
      if (option) {
        this.location = option;
      } else {
        alert(`${id} ist kein Behälter, der hier ausgewählt werden kann.`);
      }
    },

    async open() {
      this.$refs.dialog.show();
      this.loading = true;

      const current = this.singleItem ? this.$parent?.temporary?.location || this.$parent?.nominal?.location || '' : '';
      this.description = this.singleItem ? this.$parent?.temporary?.description || this.$parent?.nominal?.description || '' : '';
      this.location = null;

      try {
        // an item cannot go into itself, nor into anything that is inside it
        const moved = this.singleItem ? [this.$parent.inventoryId] : this.selected.map(e => e.split('/').pop());
        const inside = (option) => [option.value, ...option.path].some(e => moved.some(m => samePlace(e, m)));
        this.locations = (await fetchLocationTree()).filter(e => !inside(e));
        this.location = this.locations.find(e => samePlace(e.value, current)) ?? null;
      } catch (e) {
        alert(`Fehler beim Laden der Aufenthaltsorte: ${e.message}`);
      } finally {
        this.loading = false;
      }
    },

    async saveLocation(mode) {
      if (this.loading || (mode !== 2 && !this.validLocation)) {
        return;
      }

      this.loading = true;
      try {
        await Promise.all(
          (this.singleItem ? [location.pathname] : this.selected).map((e) => {
            return writeItem(e, {}, {
              summary: `location update (mode=${mode})`,
              replacer: (yaml) => setLocation(yaml, mode, {
                location: this.location?.value,
                description: this.description,
                updateLastSeen: this.updateLastSeen
              })
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
