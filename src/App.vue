<template>
  <div class="invwiki invwiki-login-warning" role="alert" v-if="active && anonymous">
    <mdi-icon icon="alert" left />
    <p>
      <b>Warnung:</b> Du bist nicht angemeldet.
      Du siehst das Inventar, weil dein Netzwerk freigeschaltet ist, aber Änderungen werden nicht deinem Namen zugeordnet und manche Funktionen stehen nicht zur Verfügung.
      <a :href="loginUrl"><b>Melde dich an</b></a>, um Gegenstände unter deinem Namen zu bearbeiten.
    </p>
  </div>

  <div class="invwiki invwiki-toolbar sticky-header" v-if="active">
    <scan-component
      :container="yaml?.container ? id : ''"
      :container-title="title"
      :selectable="indexPage"
      :selected-ids="selectedIds"
      @select="(id, value) => toggleItems([id], value)"
    />
    <create-component />
    <selection-menu-component :selected="selected" @print="printRemote()" />
    <print-queue-component />
    <button @click="toggleAll()" v-if="indexCount > 0" :title="toggleAllLabel" :aria-label="toggleAllLabel">
      <mdi-icon :icon="allSelected ? 'checkbox-blank-outline' : 'checkbox-multiple-marked-outline'" left />
      <span class="invwiki-toolbar-label">{{ toggleAllLabel }}</span>
    </button>
    <!-- last, it fills what is left of the line -->
    <search-component />
    <x-dialog ref="dialog" :loading="loading" />

    <teleport v-if="tableTarget" :to="tableTarget">
      <table-component :selection="selection" @toggle="toggleItems" />
    </teleport>
    <teleport v-if="activityTarget" :to="activityTarget">
      <activity-component />
    </teleport>
  </div>
</template>

<script>
import YAML from 'yaml';
import { createApp, h } from 'vue';
import { PREFIX, remotePrint } from '@/utils/api.js';

import MdiIcon from '@/components/MdiIcon.vue';
import XDialog from '@/components/XDialog.vue';
import ItemComponent from '@/components/ItemComponent.vue';
import ScanComponent from '@/components/ScanComponent.vue';
import PrintQueueComponent from '@/components/PrintQueueComponent.vue';
import SearchComponent from '@/components/SearchComponent.vue';
import CreateComponent from '@/components/CreateComponent.vue';
import SelectionMenuComponent from '@/components/SelectionMenuComponent.vue';
import TableComponent from '@/components/TableComponent.vue';
import ActivityComponent from '@/components/ActivityComponent.vue';

// ↑ ↑ ↓ ↓ ← → ← → B A, which leads from the overview to the leaderboard
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

// The yaml of a code block on the page, null if it is none. The wiki puts a
// "Copy" button into code blocks in newer releases, whose text is not part of it.
const codeYaml = (element) => {
  const copy = element.cloneNode(true);
  copy.querySelectorAll('button').forEach(e => e.remove());
  try {
    return YAML.parse(copy.textContent);
  } catch {
    return null;
  }
};

export default {
  components: {
    SelectionMenuComponent,
    TableComponent,
    ActivityComponent,
    CreateComponent,
    ScanComponent,
    PrintQueueComponent,
    SearchComponent
  },

  data: () => ({
    previousInteraction: null,
    selection: {},
    // number of items with a checkbox on the index page
    indexCount: 0,
    // where the table goes in the page content, only on the index page
    tableTarget: null,
    // where the leaderboard goes, only on its page
    activityTarget: null,
    // the last keys pressed on the overview, as many as the Konami code has
    konamiKeys: [],
    loading: false
  }),

  mounted() {
    if (!this.active) {
      return;
    }

    for (const e of document.querySelectorAll('#dokuwiki__content .code.yaml')) {
      try {
        const data = codeYaml(e);
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

        // what kind of item it is, in front of its title (which is read above)
        const heading = document.querySelector('#dokuwiki__content h1');
        if (heading && !heading.querySelector('.invwiki-title-type')) {
          const icon = document.createElement('span');
          icon.className = 'invwiki-title-type';
          heading.prepend(icon);
          createApp({
            render: () => h(MdiIcon, data.container
              ? { icon: 'package-variant', title: 'Behälter' }
              : { icon: 'toy-brick-outline', title: 'Gegenstand' })
          }).mount(icon);
        }
      } catch (e) {
        console.log(e);
        // ignore
      }
    }

    // the leaderboard below the heading of its page, above what the page says
    if (this.activityPage) {
      const content = document.querySelector('#dokuwiki__content');
      const target = document.createElement('div');
      target.id = 'invwiki-activity';
      const heading = content?.querySelector('h1');
      if (heading) {
        heading.after(target);
      } else {
        content?.prepend(target);
      }
      this.activityTarget = target;
    }

    // only when the page is shown, not while it is edited, previewed or the like
    if (this.indexPage) {
      document.addEventListener('keydown', this.konami);
      document.querySelector('.plugin_nspages > ul')?.classList?.add?.('invwiki');
      for (const e of document.querySelectorAll('a.wikilink1')) {
        if (e.dataset.wikiId.startsWith('inventar:')) {
          const id = `check:${e.dataset.wikiId}`;
          if (!document.getElementById(id)) {
            // Not every page in the namespace is an item: data pages such as
            // lock, print-queue or enrichment carry no title, so there is
            // nothing to split into date, id and name. Skip them rather than
            // letting exec() return null and take the whole handler — and with
            // it the checkboxes and the scan buttons — down with it.
            const res = /\[([^\]]*)\][^\[]*\[inventar:([^\]]*)\] (.*)/.exec(e.innerText);
            if (!res) {
              continue;
            }

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

      this.indexCount = document.querySelectorAll('input.invwiki-index[type="checkbox"]').length;

      // above the list of items, or else right below the page's heading
      const content = document.querySelector('#dokuwiki__content');
      if (content && !document.getElementById('invwiki-table')) {
        const target = document.createElement('div');
        target.id = 'invwiki-table';

        const list = content.querySelector('.plugin_nspages');
        const heading = content.querySelector('h1');
        if (list) {
          list.before(target);
        } else if (heading) {
          heading.after(target);
        } else {
          content.prepend(target);
        }
        this.tableTarget = target;
      }
      const stickyHeader = document.querySelector('.sticky-header');
      const stickyObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          stickyHeader.classList.remove('sticky-shadow');
        } else {
          stickyHeader.classList.add('sticky-shadow');
        }
      });
      stickyObserver.observe(document.querySelector('.wrapper.group'));
    }
  },

  methods: {
    // not while typing, where arrows and letters are meant for the field
    konami(e) {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) {
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.konamiKeys = [...this.konamiKeys, key].slice(-KONAMI.length);
      if (this.konamiKeys.join() === KONAMI.join()) {
        this.konamiKeys = [];
        location.href = `/${PREFIX}/rangliste`;
      }
    },

    // (un)select the given inventory ids from the table, as if their boxes in
    // the list were clicked, also those that have no box on this page
    toggleItems(ids, value) {
      for (const id of ids) {
        const key = `check:${PREFIX}:${id.toLowerCase()}`;
        this.selection[key] = value;

        const box = document.getElementById(key);
        if (box) {
          box.checked = value;
        }
      }
      this.previousInteraction = null;
    },

    toggleAll() {
      const value = !this.allSelected;
      for (const o of document.querySelectorAll('input.invwiki-index[type="checkbox"]')) {
        o.checked = value;
        this.selection[o.id] = value;
      }
      this.previousInteraction = null;
    },

    async printRemote() {
      try {
        await this.$refs.dialog.show();
        this.loading = true;
        await remotePrint(Object.keys(this.selection).filter(e => this.selection[e]).map(e => e.split(':').pop().toUpperCase()));

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
    toggleAllLabel() {
      return this.allSelected ? 'Auswahl aufheben' : `Alle ${this.indexCount} auswählen`;
    },

    // nobody is logged in, and the page can still be read, through the wiki's
    // IP allowlist. The core marks the page of a logged in user with the class
    // loggedIn (in templates that use tpl_classes, which add mode_* as well);
    // otherwise the user tools tell, by a link to log in or out
    anonymous() {
      // not where the wiki turns the reader away, or is logging them in already
      if (['denied', 'login', 'register', 'resendpwd'].includes(window.JSINFO?.ACT)) {
        return false;
      }
      if (document.querySelector('.dokuwiki.loggedIn, a[href*="do=logout"]')) {
        return false;
      }
      return Boolean(document.querySelector('.dokuwiki[class*="mode_"], a[href*="do=login"]'));
    },

    // the wiki's own link, which returns to this page after logging in
    loginUrl() {
      return document.querySelector('a[href*="do=login"]')?.href ?? `${location.pathname}?do=login`;
    },

    active() {
      return location.pathname.startsWith('/inventar') || import.meta.env.MODE === 'development';
    },

    // the wiki's current action is "show": the page itself, rather than its
    // editor, preview, history or an admin screen. The URL cannot tell, a
    // preview is posted to the plain page address.
    showing() {
      return (window.JSINFO?.ACT ?? new URLSearchParams(location.search).get('do') ?? 'show') === 'show';
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
          .map(codeYaml)
          .find(e => e?.inventory);
    },

    allSelected() {
      return this.indexCount > 0 && this.selected.length === this.indexCount;
    },

    selected() {
      return Object.entries(this.selection).filter(e => e[1]).map(e => e[0].replace(/^check:/, '/').replace(/:/g, '/'));
    },

    // the inventory numbers of the selected items, as the scanner compares them
    selectedIds() {
      return this.selected.map(e => e.split('/').pop().toUpperCase());
    },

    // the overview, whose items can be selected
    indexPage() {
      return (location.pathname === '/inventar' || location.pathname === '/inventar/') && this.showing;
    },

    // the leaderboard of who worked on the inventory
    activityPage() {
      return location.pathname.replace(/\/$/, '') === '/inventar/rangliste' && this.showing;
    }
  }
}
</script>
