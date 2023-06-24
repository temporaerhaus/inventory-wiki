<template>
  <div class="invwiki invwiki-toolbar" v-if="active">
    <scan-component />
    <scan-component reprint />
    <create-component />
    <button @click="printRemote()" v-if="selected > 0">
      <mdi-icon icon="cloud-print-outline" left />
      {{ selected > 1 ? selected : '' }} ausgewählte{{  selected > 1 ? '' : 'n' }} Aufkleber Remote Drucken
    </button>
    <x-dialog ref="dialog" :loading="loading" />
  </div>
</template>

<script>
import YAML from 'yaml';
import { createApp } from 'vue';
import { remotePrint } from '@/utils/api.js';

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

  data: () => ({
    previousInteraction: null,
    selection: {},
    loading: false
  }),

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

    if (location.pathname === '/inventar' || location.pathname === '/inventar/') {
      document.querySelector('.plugin_nspages > ul')?.classList?.add?.('invwiki');
      for (const e of document.querySelectorAll('a.wikilink1')) {
        if (e.dataset.wikiId.startsWith('inventar:')) {
          const id = `check:${e.dataset.wikiId}`;
          if (!document.getElementById(id)) {
            const c = document.createElement('input');
            c.className='invwiki-index';
            c.style.marginTop = '-2px';
            c.style.height = '18px';
            c.style.width = '18px';
            c.type = 'checkbox';
            c.id = id;

            c.addEventListener('click', (e) => {
              if (this.previousInteraction && e.shiftKey) {
                let found = false;
                let goal = false;

                for (const o of document.querySelectorAll('input.invwiki-index[type="checkbox"]')) {
                  if (found) {
                    this.selection[o.id] = goal;
                    o.checked = goal;

                    if (o.id === c.id) {
                      // reached end, stop
                      break;
                    }
                  } else if (o.id === this.previousInteraction) {
                    found = true;
                    goal = o.checked;
                  }
                }
              } else {
                this.selection[c.id] = c.checked;
              }

              this.previousInteraction = e.shiftKey ? null : c.id;
            });

            const res = /\[([^\]]*)\][^\[]*\[inventar:([^\]]*)\] (.*)/.exec(e.innerText);

            const l = document.createElement('label');
            l.setAttribute('for', id);
            l.innerText = `[${res[1]}]`;

            const s = document.createElement('span');
            s.innerText = `[${res[2]}]`;

            e.innerText = res[3];

            e.insertAdjacentElement('beforebegin', c);
            e.insertAdjacentElement('beforebegin', l);
            e.insertAdjacentElement('afterbegin', s);
          }
        }
      }
    }
  },

  methods: {
    async printRemote() {
      try {
        await this.$refs.dialog.show();
        this.loading = true;
        await remotePrint(Object.keys(this.selection).filter(e => this.selection[e]).map(e => e.split(':').pop()));

        this.selection = {};
        for (const o of document.querySelectorAll('input.invwiki-index[type="checkbox"]')) {
          o.checked = false;
        }
        this.loading = false;
      } catch (e) {
        this.loading = false;
        alert(`Fehler: ${e.message}`);
      } finally {
        this.$refs.dialog.close();
      }
    }
  },

  computed: {
    active() {
      return location.pathname.startsWith('/inventar') || import.meta.env.MODE === 'development';
    },

    id() {
      return String(this.active && location.pathname.replaceAll(':', '/').split('/').pop()).toUpperCase();
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
    },

    selected() {
      return Object.values(this.selection).filter(e => e).length;
    }
  }
}
</script>
