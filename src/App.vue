<template>
  <div class="invwiki" v-if="active">
    <scan-component />
    <create-component />
    <x-dialog />
  </div>
</template>

<script>
import YAML from 'yaml';
import { createApp } from 'vue';

import MdiIcon from '@/components/MdiIcon.vue';
import XDialog from '@/components/XDialog.vue';
import ItemComponent from '@/components/ItemComponent.vue';
import ScanComponent from '@/components/ScanComponent.vue';
import CreateComponent from '@/components/CreateComponent.vue';

export default {
  components: {
    CreateComponent,
    ScanComponent
  },

  mounted() {
    if (!this.active) {
      return;
    }

    for (const e of document.querySelectorAll('#dokuwiki__content .code.yaml')) {
      try {
        const data = YAML.parse(e.innerText);
        if (e.classList.contains('processed') || !data?.inventory) {
          continue;
        }

        e.classList.add('processed');
        const stub = document.createElement('div');
        e.insertAdjacentElement('afterend', stub);
        data.inventoryId = this.id.toUpperCase();
        data.title = this.title;

        const date = new Date(data.date);
        if (!(date instanceof Date && !isNaN(date))) {
          data.date = '';
        } else {
          date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
          data.date = date.toISOString().slice(0, 10);
        }

        const item = createApp(ItemComponent, data);
        item.component('MdiIcon', MdiIcon);
        item.component('XDialog', XDialog);
        item.mount(stub);
      } catch (e) {
        console.log(e);
        // ignore
      }
    }
  },

  computed: {
    active() {
      return location.pathname.startsWith('/inventar') || import.meta.env.MODE === 'development';
    },

    id() {
      return import.meta.env.MODE === 'development' ? 'v-af012345' : this.active && location.pathname.replaceAll(':', '/').split('/').pop().toUpperCase();
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