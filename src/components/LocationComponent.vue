<template>
  <button @click="open" v-if="singleItem">
    <mdi-icon icon="home-map-marker" left />
    Aufenthaltsort Aktualisieren
  </button>

  <!-- for selected items, it is opened from SelectionMenuComponent -->
  <x-dialog :title="`Aufenthaltsort Aktualisieren (${singleItem ? $parent.inventoryId : `${selected.length} ${selected.length > 1 ? 'Gegenstände' : 'Gegenstand'}`})`" icon="home-map-marker" ref="dialog" :loading="loading" :progress="progress">
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

      <label :for="`invwiki-location-description-${nonce}`">Genauere Infos zum Ort</label>
      <textarea :id="`invwiki-location-description-${nonce}`" v-model="description" autocomplete="off" />
      
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
import { LOCATION_RESET, fetchLocationTree, locationLoop, progressText, setLocation, settleWithProgress, writeItem } from '@/utils/api.js';
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
    // how far saving several items is, below the loading indicator
    progress: '',
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
        // resetting to the regular location puts nothing anywhere new
        if (mode !== LOCATION_RESET) {
          const moved = this.singleItem ? [this.$parent.inventoryId] : this.selected.map(e => e.split('/').pop());
          const loop = await locationLoop(moved, this.location.value, mode);
          if (loop) {
            alert(loop);
            return;
          }
        }

        const paths = this.singleItem ? [location.pathname] : this.selected;
        const results = await settleWithProgress(
          paths.map(e => () => writeItem(e, {}, {
            summary: `location update (mode=${mode})`,
            replacer: (yaml) => setLocation(yaml, mode, {
              location: this.location?.value,
              description: this.description,
              updateLastSeen: this.updateLastSeen
            })
          })),
          // one item needs no counting
          (...counts) => this.progress = this.singleItem ? '' : progressText(...counts)
        );
        const failed = results
          .map((result, i) => [paths[i], result])
          .filter(([, result]) => result.status === 'rejected');

        if (this.singleItem) {
          if (failed.length) {
            throw failed[0][1].reason;
          }
          location.reload();
        } else {
          // refresh cache by loading all items
          this.progress = this.progress.replace(/ …$/, ', lade neu …');
          await Promise.all(this.selected.map(e => fetch(e)));
          if (failed.length) {
            alert(`Fehler bei ${failed.length} von ${paths.length}:\n${failed.map(([path, result]) => `${path.split('/').pop().toUpperCase()}: ${result.reason?.message}`).join('\n')}`);
          } else {
            alert(`${this.selected.length} ${this.selected.length > 1 ? 'Gegenstände' : 'Gegenstand'} aktualisiert`);
            this.$refs.dialog.close();
          }
        }
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      } finally {
        this.loading = false;
        this.progress = '';
      }
    }
  }
}
</script>
