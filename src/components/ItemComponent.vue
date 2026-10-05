<template>
  <div class="invwiki invwiki-main">
    <div>
      <b v-if="description">💬 Kurzbeschreibung:</b>
      <blockquote v-if="description">{{ description }}</blockquote>

      <b v-if="container">📦 Beinhaltete Gegenstände:</b>
      <button v-if="container && Object.values(containedItems || {}).some(e => e.container)" :class="`invwiki-expand-all ${loading ? 'loading' : ''}`" title="Alle ausklappen" @click="expand(null, null, true)" :disabled="loading"></button>
      <button v-else-if="container && loading && Object.values(containedItems || {}).length == 0" :class="`invwiki-expand-all loading`" disabled></button>
      <small v-if="selectedPaths.length > 0">&emsp;(Auswahl: {{ selectedPaths.length }} von {{ visibleIds.length }})</small>
      <label v-if="container && visibleIds.length > 0" class="invwiki-select-all">
        <input type="checkbox" :checked="allSelected" :indeterminate.prop="!allSelected && selectedPaths.length > 0" @change="toggleAll($event.target.checked)" />
        Alle angezeigten auswählen
      </label>
      <ContainedItemsList v-if="container" :containedItems="containedItems" v-model="selected" @expand="expand($event.id, $event.item, false)" :loading="loading" />
      <div v-if="container && selectedPaths.length > 0" class="invwiki-selection-actions">
        <selection-menu-component :selected="selectedPaths" @print="printSelected()" />
      </div>
      <!-- scans items into this container, one after another -->
      <div v-if="container" class="invwiki-add-contained">
        <scan-component direct :container="inventoryId" :container-title="title" />
      </div>
    </div>
    <div class="invwiki item-card location-card">
      <ul>
        <!-- what is not known is said so, rather than left out -->
        <li v-if="!nominal?.location" class="invwiki-location invwiki-location-unknown">
          <mdi-icon icon="map-marker-question-outline" left title="Kein regulärer Aufenthaltsort festgelegt" />
          <small class="invwiki-location-label">Regulärer Aufenthaltsort</small>
          <div>nicht festgelegt</div>
        </li>
        <li v-for="entry in locations" :key="entry.key" :class="{ 'invwiki-location': true, 'invwiki-location-elsewhere': entry.elsewhere }">
          <mdi-icon :icon="entry.icon" left :title="entry.label" />
          <small class="invwiki-location-label">
            {{ entry.label }}
            <span v-if="entry.timestamp" :title="`Zuletzt geändert: ${entry.timestamp}`">· geändert {{ relative(entry.timestamp) }}</span>
          </small>
          <div>
            <a v-if="entry.item" :href="entry.location"><b>{{ entry.location }}: </b></a>
            <b v-else>{{ entry.location }}</b>
            <span v-if="entry.item">{{ entry.item.title }}</span>
          </div>
          <div v-if="entry.chain.length" class="invwiki-location-chain">
            <template v-for="(place, i) in entry.chain" :key="place.id">
              {{ i === 0 ? 'in' : '›' }}
              <a v-if="place.title" :href="place.id" :title="place.title">{{ place.id }}{{ samePlace(place.title, place.id) ? '' : `: ${place.title}` }}</a>
              <span v-else>{{ place.id }}</span>
            </template>
          </div>
          <blockquote v-if="entry.description">{{ entry.description }}</blockquote>
        </li>
        <li :title="`Zuletzt Gesehen am: ${lastSeenAt}`" v-if="lastSeenAt">
          <mdi-icon icon="eye-outline" left :title="`Zuletzt Gesehen am: ${lastSeenAt}`" />
          <b>zuletzt gesehen {{ relative(lastSeenAt) }}</b>
        </li>
        <li class="invwiki-location-unknown" v-else>
          <mdi-icon icon="eye-off-outline" left title="Noch nicht gesehen" />
          <b>noch nicht gesehen</b>
        </li>
      </ul>
      <location-component single-item />
    </div>

    <div class="invwiki item-card">
      <span v-if="small" title="Kleiner Aufkleber" style="float: right; margin-right: 1em;">🤏</span>
      <span v-if="container" title="Kann andere Gegenstände beherbergen" style="float: right; margin-right: 1em;">📦</span>
      <ul>
        <!-- a sub-item (V-GM000123-N) and the item it belongs to (V-GM000123) -->
        <li v-if="mainItem" title="Gehört zu">
          <mdi-icon icon="subdirectory-arrow-left" left title="Gehört zu" />
          Gehört zu <a :href="`/${PREFIX}/${mainItem.id}`"><b>{{ mainItem.id }}</b></a><template v-if="mainItem.title">: {{ mainItem.title }}</template>
        </li>
        <li v-if="subItems.length > 0" title="Zugehörige Gegenstände" class="invwiki-sub-items">
          <mdi-icon icon="subdirectory-arrow-right" left title="Zugehörige Gegenstände" />
          Zugehörige Gegenstände:
          <ul>
            <li v-for="item in subItems" :key="item.id">
              <a :href="`/${PREFIX}/${item.id}`"><b>{{ item.id }}</b></a><template v-if="item.title">: {{ item.title }}</template>
            </li>
          </ul>
        </li>
        <li title="Kategorie" v-if="category">
          <mdi-icon icon="tag-outline" left title="Kategorie" />
          {{ category }}
        </li>
        <li title="Ursprung" v-if="origin">
          <mdi-icon icon="basket-unfill" left title="Ursprung" />
          {{ origin }}
        </li>
        <li title="Eigentümer*in" v-if="owner">
          <mdi-icon icon="account-question-outline" left title="Eigentümer*in" />
          {{ owner }}
        </li>
        <li title="Anschaffungsdatum" v-if="date">
          <mdi-icon icon="calendar" left title="Anschaffungsdatum" />
          {{ date }}
        </li>
        <li title="Seriennummer" v-if="serial">
          <mdi-icon icon="pound-box-outline" left title="Seriennummer" />
          {{ serial }}
        </li>
        <li title="Rechnung" v-if="invoice">
          <mdi-icon icon="file-document-outline" left title="Rechnung" />
          {{ invoice }}
        </li>
      </ul>
      <create-component edit />
      <create-component clone />
      <create-component sub />
      <contents-list-component v-if="container" :inventory-id="inventoryId" :title="title" />
      <label-component :inventory-id="inventoryId" :title="title" :description="description" :owner="owner" :small="small" :serial="serial" />
    </div>
  </div>
  <hr>
</template>

<script>
import { PREFIX, fetchInventoryItem, fetchSubItems, mainItemOf, remotePrint, searchItems } from '@/utils/api.js';
import LabelComponent from '@/components/LabelComponent.vue';
import CreateComponent from '@/components/CreateComponent.vue';
import LocationComponent from '@/components/LocationComponent.vue';
import SelectionMenuComponent from '@/components/SelectionMenuComponent.vue';
import ScanComponent from '@/components/ScanComponent.vue';
import ContentsListComponent from '@/components/ContentsListComponent.vue';
import ContainedItemsList from '@/components/ContainedItemsList.vue';

// how many places up the chain of "where is the location itself" is followed
const MAX_CHAIN = 4;

const samePlace = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

// taken from https://stackoverflow.com/a/78704662
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const hoursPerDay = 24;
const daysPerWeek = 7;
const intervals = {
    'week':         millisecondsPerSecond * secondsPerMinute * minutesPerHour * hoursPerDay * daysPerWeek,
    'day':          millisecondsPerSecond * secondsPerMinute * minutesPerHour * hoursPerDay,
    'hour':         millisecondsPerSecond * secondsPerMinute * minutesPerHour,
    'minute':       millisecondsPerSecond * secondsPerMinute,
    'second':       millisecondsPerSecond,
}
const relativeDateFormat = new Intl.RelativeTimeFormat('de', { style: 'long' });

export default {
  components: {
    LabelComponent,
    CreateComponent,
    LocationComponent,
    SelectionMenuComponent,
    ScanComponent,
    ContentsListComponent,
    ContainedItemsList
  },

  props: {
    inventory: Boolean,
    title: String,
    inventoryId: String,
    description: String,
    category: String,
    origin: String,
    owner: String,
    small: Boolean,
    container: Boolean,
    date: String,
    serial: String,
    invoice: String,
    nominal: Object,
    temporary: Object,
    lastSeenAt: String,
  },

  data: () => ({
    PREFIX,
    selected: {},
    loading: false,
    containedItems: [],
    nominalLocation: null,
    temporaryLocation: null,
    nominalChain: [],
    temporaryChain: [],
    // {id, title} of the item this sub-item belongs to
    mainItem: null,
    // [{id, title}] of the sub-items of this item
    subItems: [],
  }),

  async mounted() {
    this.loading = true;
    this.containedItems = [];
    this.loadRelatedItems();

    // both locations and the contained items load at the same time
    for (const key of ['nominal', 'temporary']) {
      this.resolveLocation(key);
    }

    if (this.container) {
      Promise.all((await searchItems(`location: ${this.inventoryId}`)).map(async (id) => [id, {
        ...await fetchInventoryItem(id),
        expanded: false,
        depth: 0
      }])).then((res) => {
        this.containedItems = Object.fromEntries(res);
        this.loading = false;
      });
    } else {
      this.loading = false;
    }
  },

  methods: {
    // the item a location refers to, and where that item is in turn
    async resolveLocation(key) {
      const location = this[key]?.location;
      if (!location) {
        return;
      }

      const item = await fetchInventoryItem(String(location)).catch(() => null);
      this[`${key}Location`] = item;
      if (item) {
        this[`${key}Chain`] = await this.locationChain(item, [this.inventoryId, location]);
      }
    },

    // where a location item is right now, and where that place is, and so on
    async locationChain(item, seen) {
      const chain = [];
      let current = item;
      while (current && chain.length < MAX_CHAIN) {
        const next = String(current.temporary?.location || current.nominal?.location || '').trim();
        if (!next || seen.some(e => samePlace(e, next))) {
          break;
        }
        seen.push(next);

        current = await fetchInventoryItem(next).catch(() => null);
        chain.push({ id: next, title: current?.title || '' });
      }

      return chain;
    },

    samePlace,

    // the item this one belongs to, or the ones that belong to it; only for
    // display, the page does without them
    async loadRelatedItems() {
      const main = mainItemOf(this.inventoryId);
      try {
        if (main) {
          this.mainItem = { id: main, title: (await fetchInventoryItem(main))?.title || '' };
        } else {
          this.subItems = await fetchSubItems(this.inventoryId);
        }
      } catch (e) {
        console.log(e);
      }
    },

    // the selected contents, to the print queue
    async printSelected() {
      const ids = this.selectedPaths.map(e => e.split('/').pop().toUpperCase());
      try {
        const added = await remotePrint(ids);
        alert(added.length === ids.length
          ? `${added.length} Aufkleber zur Druckwarteschlange hinzugefügt.`
          : `${added.length} von ${ids.length} Aufklebern zur Druckwarteschlange hinzugefügt, die übrigen waren schon darin.`);
      } catch (e) {
        alert(`Fehler: ${e.message}`);
      }
    },

    relative(date) {
      const diff = new Date(date) - new Date();
      if (isNaN(diff)) {
        return date;
      }

      for (const interval in intervals) {
        if (intervals[interval] <= Math.abs(diff)) {
          return relativeDateFormat.format(Math.trunc(diff / intervals[interval]), interval);
        }
      }

      return relativeDateFormat.format(Math.trunc(diff / 1000), 'second');
    },

    toggleAll(value) {
      for (const id of this.visibleIds) {
        this.selected[id] = value;
      }
    },

    async expand(parentId = null, parent = null, recursive = true) {
      console.log('expand', parentId, parent);
      if (!this.container) {
        return;
      }

      if (!recursive) {
        this.loading = true;
      }

      if (parentId === null || parent === null) {
        this.loading = true;
        try {
          await Promise.all(Object.entries(this.containedItems || {}).map(([id, e]) => this.expand(id, e, recursive)));
        } catch (e) {
          console.log(e);
        } finally {
          this.loading = false;
        }
      }

      // do not go deeper than 10 layers, to deal with potential circular links
      if (parent?.container && !parent?.children && (parent?.depth || 0) < 10) {
        parent.expanded = true;
        parent.children = Object.fromEntries(
          await Promise.all(
            (await searchItems(`location: ${parentId}`))
              .map(async (id) => [id, {
                ...await fetchInventoryItem(id),
                expanded: true,
                depth: (parent.depth || 0) + 1
              }])
          )
        );

        if (this.recursive) {
          await Promise.all(Object.entries(parent.children || {}).map(([id, e]) => this.expand(id, e, recursive)));
        }
      } else if (parent?.container && parent?.children && !parent?.expanded) {
        parent.expanded = true;
      }

      if (!recursive) {
        this.loading = false;
      }
    }
  },

  computed: {
    // ids of contained items as shown in the list, including expanded sub items
    visibleIds() {
      const collect = (items) => Object.entries(items || {}).flatMap(([id, item]) => [
        id,
        ...(item.container && item.expanded ? collect(item.children) : [])
      ]);
      return collect(this.containedItems);
    },

    allSelected() {
      return this.visibleIds.length > 0 && this.visibleIds.every(id => this.selected[id]);
    },

    selectedPaths() {
      return Object.entries(this.selected).filter(([, value]) => value).map(([id]) => `/${PREFIX}/${id}`);
    },

    locations() {
      const elsewhere = Boolean(this.temporary?.location && this.nominal?.location && !samePlace(this.temporary.location, this.nominal.location));
      return [{
        key: 'nominal',
        label: 'Regulärer Aufenthaltsort',
        icon: 'map-marker-alert-outline',
        data: this.nominal,
        item: this.nominalLocation,
        chain: this.nominalChain,
        elsewhere: false
      }, {
        key: 'temporary',
        label: elsewhere ? 'Aktueller Aufenthaltsort, nicht am regulären Aufenthaltsort' : 'Aktueller Aufenthaltsort',
        icon: 'map-clock-outline',
        data: this.temporary,
        item: this.temporaryLocation,
        chain: this.temporaryChain,
        elsewhere
      }]
        .filter(e => e.data?.location)
        .map(e => ({ ...e, location: e.data.location, timestamp: e.data.timestamp, description: e.data.description }));
    }
  }
}
</script>
