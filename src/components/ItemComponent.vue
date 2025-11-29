<template>
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
      <li title="Soll-Ort" v-if="nominal?.location">
        <mdi-icon icon="map-marker-alert-outline" left title="Soll-Ort" />
        <b>{{ nominal.location }}</b>
        <b v-if="nominal?.description">:</b>
        {{ nominal.description }}
        <mdi-icon icon="clock-outline" :title="`Zuletzt geändert: ${nominal.timestamp}`" style="float: right; margin-right: 1em;" color="#999999" />
      </li>
      <li title="Aktueller Ort" v-if="temporary?.location">
        <mdi-icon icon="map-clock-outline" left title="Aktueller Ort" />
        <b>{{ temporary.location }}</b>
        <b v-if="temporary?.description">:</b>
        {{ temporary.description }}
        <mdi-icon icon="clock-outline" :title="`Zuletzt geändert: ${temporary.timestamp}`" style="float: right; margin-right: 1em;" color="#999999" />
      </li>
      <li :title="`Zuletzt Gesehen am: ${lastSeenAt}`" v-if="lastSeenAt">
        <mdi-icon icon="eye-outline" left :title="`Zuletzt Gesehen am: ${lastSeenAt}`" />
        <b>{{ lastSeenAtRelative }}</b>
      </li>
    </ul>
    <blockquote v-if="description">{{ description }}</blockquote>
    <location-component />
    <create-component edit />
    <create-component clone />
    <create-component sub />
    <label-component :inventory-id="inventoryId" :title="title" :description="description" :owner="owner" :small="small" :serial="serial" />
  </div>
</template>

<script>
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
  }),

  mounted() {
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
