<template>
  <div class="invwiki invwiki-main">
    <div>
      <b v-if="description">💬 Kurzbeschreibung:</b>
      <blockquote v-if="description">{{ description }}</blockquote>

      <b v-if="container">📦 Beinhaltete Gegenstände:</b>
      <small v-if="Object.values(selected)?.filter?.(e => e)?.length > 0">&emsp;(Auswahl: {{ Object.values(selected).filter(e => e).length }} von {{ Object.keys(containedItems).length }})</small>
      <ul v-if="container">
        <li v-for="(item, id) in containedItems" :key="id">
          <input type="checkbox" v-model="selected[id]">
          <a :href="id">
            <b>{{ id }}:</b>
            {{ item.title }}
          </a>
        </li>
      </ul>
    </div>
    <div class="invwiki item-card location-card">
      <ul>
        <li title="Soll-Ort" v-if="nominal?.location">
          <mdi-icon icon="map-marker-alert-outline" left title="Soll-Ort" />
          <a v-if="nominalLocation" :href="nominal.location"><b>{{ nominal.location }}: </b></a>
          <b v-else>{{ nominal.location }}</b>
          <span v-if="nominalLocation">{{ nominalLocation.title }}</span>
          <mdi-icon icon="clock-outline" :title="`Zuletzt geändert: ${nominal.timestamp}`" style="float: right; margin-right: 1em;" color="#999999" />
          <blockquote>{{ nominal.description }}</blockquote>
        </li>
        <li title="Aktueller Ort" v-if="temporary?.location">
          <mdi-icon icon="map-clock-outline" left title="Aktueller Ort" />
          <a v-if="temporaryLocation" :href="temporary.location"><b>{{ temporary.location }}: </b></a>
          <b v-else>{{ temporary.location }}</b>
          <span v-if="temporaryLocation">{{ temporaryLocation.title }}</span>
          <mdi-icon icon="clock-outline" :title="`Zuletzt geändert: ${temporary.timestamp}`" style="float: right; margin-right: 1em;" color="#999999" />
          <blockquote>{{ temporary.description }}</blockquote>
        </li>
        <li :title="`Zuletzt Gesehen am: ${lastSeenAt}`" v-if="lastSeenAt">
          <mdi-icon icon="eye-outline" left :title="`Zuletzt Gesehen am: ${lastSeenAt}`" />
          <b>{{ lastSeenAtRelative }}</b>
        </li>
      </ul>
      <location-component />
    </div>

    <div class="invwiki item-card">
      <span v-if="small" title="Kleiner Aufkleber" style="float: right; margin-right: 1em;">🤏</span>
      <span v-if="container" title="Kann andere Gegenstände beherbergen" style="float: right; margin-right: 1em;">📦</span>
      <ul>
        <li title="Kategorie" v-if="category">
          <mdi-icon icon="tag-outline" left title="Kategorie" />
          {{ category }}
        </li>
        <li title="Ursprung" v-if="origin">
          <mdi-icon icon="basket-unfill" left title="Ursprung" />
          {{ origin }}
        </li>
        <li title="Besitzer*in" v-if="owner">
          <mdi-icon icon="account-question-outline" left title="Besitzer*in" />
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
      <label-component :inventory-id="inventoryId" :title="title" :description="description" :owner="owner" :small="small" :serial="serial" />
    </div>
  </div>
  <hr>
</template>

<script>
import { fetchInventoryItem, searchItems } from '@/utils/api.js';
import LabelComponent from '@/components/LabelComponent.vue';
import CreateComponent from '@/components/CreateComponent.vue';
import LocationComponent from '@/components/LocationComponent.vue';

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
    LocationComponent
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
    selected: {},
    containedItems: [],
    nominalLocation: null,
    temporaryLocation: null,
  }),

  async mounted() {
    this.containedItems = [];
    if (this.container) {
      this.containedItems = Object.fromEntries(
        await Promise.all((await searchItems(`location: ${this.inventoryId}`)).map(async (id) => [id, await fetchInventoryItem(id)]))
      );
    }
    if (this.nominal?.location) {
      this.nominalLocation = await fetchInventoryItem(this.nominal?.location);
    }
    if (this.temporary?.location) {
      this.temporaryLocation = await fetchInventoryItem(this.temporary?.location);
    }
  },

  methods: {
  },

  computed: {
    lastSeenAtRelative() {
      const diff = new Date(this.lastSeenAt) - new Date();

      for (const interval in intervals) {
          if (intervals[interval] <= Math.abs(diff)) {
              return relativeDateFormat.format(Math.trunc(diff / intervals[interval]), interval);
          }
      }

      return relativeDateFormat.format(diff / 1000, 'second');
    }
  }
}
</script>
