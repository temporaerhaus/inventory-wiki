<template>
  <div class="invwiki" v-if="active">
    <scan-component />
    <label-component />
    <create-component />
    <location-component />
    <x-dialog />
  </div>
</template>

<script>
import YAML from 'yaml';

import ScanComponent from '@/components/ScanComponent.vue';
import LabelComponent from '@/components/LabelComponent.vue';
import CreateComponent from '@/components/CreateComponent.vue';
import LocationComponent from '@/components/LocationComponent.vue';

export default {
  components: {
    LocationComponent,
    CreateComponent,
    LabelComponent,
    ScanComponent
  },

  computed: {
    active() {
      return location.pathname.startsWith('/inventar') || import.meta.env.MODE === 'development';
    },

    id() {
      return this.active && location.pathname.replaceAll(':', '/').split('/').pop().toUpperCase();
    },

    title() {
      return this.active && document.querySelector('#dokuwiki__content h1')?.innerText || '';
    },

    description() {
      return this.active && this.yaml?.description || '';
    },

    yaml() {
      return this.active && [...document.querySelectorAll('#dokuwiki__content .code.yaml')]
          .map(e => YAML.parse(e.innerText))
          .find(e => e.inventory);
    }
  }
}
</script>