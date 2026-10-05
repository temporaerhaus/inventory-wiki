<template>
  <div class="invwiki-selection-menu" ref="root" v-if="selected?.length > 0">
    <button @click="open = !open" :aria-expanded="open">
      <mdi-icon icon="checkbox-multiple-marked-outline" left />
      {{ selected.length }} {{ selected.length === 1 ? 'ausgewählter Gegenstand' : 'ausgewählte Gegenstände' }}
      <mdi-icon :icon="open ? 'menu-up' : 'menu-down'" right />
    </button>

    <div class="invwiki-selection-menu-items" v-show="open">
      <button @click="run(() => $emit('print'))">
        <mdi-icon icon="cloud-print-outline" left />
        Aufkleber drucken
      </button>
      <button @click="run(() => $refs.location.open())">
        <mdi-icon icon="home-map-marker" left />
        Aufenthaltsort zuweisen
      </button>
      <button @click="run(() => $refs.edit.open())">
        <mdi-icon icon="square-edit-outline" left />
        Bearbeiten
      </button>
    </div>
  </div>

  <!-- their dialogs, opened from the menu -->
  <location-component :selected="selected" ref="location" />
  <bulk-edit-component :selected="selected" ref="edit" />
</template>

<script>
import LocationComponent from '@/components/LocationComponent.vue';
import BulkEditComponent from '@/components/BulkEditComponent.vue';

// The actions for the selected items, behind one button
export default {
  components: {
    LocationComponent,
    BulkEditComponent
  },

  props: {
    // paths of the selected item pages
    selected: Array
  },

  // print: add the selected items to the print queue, which the parent does
  emits: ['print'],

  data: () => ({
    open: false,
  }),

  watch: {
    // a new selection starts with the menu closed
    'selected.length'(length) {
      if (!length) {
        this.open = false;
      }
    }
  },

  mounted() {
    document.addEventListener('click', this.closeOutside);
    document.addEventListener('keydown', this.closeOnEscape);
  },

  beforeUnmount() {
    document.removeEventListener('click', this.closeOutside);
    document.removeEventListener('keydown', this.closeOnEscape);
  },

  methods: {
    run(action) {
      this.open = false;
      action();
    },

    closeOutside(e) {
      if (!this.$refs.root?.contains(e.target)) {
        this.open = false;
      }
    },

    closeOnEscape(e) {
      if (e.key === 'Escape') {
        this.open = false;
      }
    }
  }
}
</script>
