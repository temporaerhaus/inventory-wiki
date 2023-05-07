<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" :style="styles">
    <title>{{ icon }}</title>
    <path :d="icons[key]" />
  </svg>
</template>

<script>
import {
  mdiClose,
  mdiQrcodePlus,
  mdiQrcodeScan,
  mdiFileDownloadOutline,
  mdiToyBrickPlusOutline,
  mdiHomeMapMarker,
  mdiUndoVariant,
  mdiMapClockOutline,
  mdiContentSaveAlertOutline
} from '@mdi/js';

export default {
  props: {
    icon: String,
    left: Boolean,
    right: Boolean
  },

  data: () => ({
    icons: {
      mdiClose,
      mdiQrcodePlus,
      mdiQrcodeScan,
      mdiFileDownloadOutline,
      mdiToyBrickPlusOutline,
      mdiHomeMapMarker,
      mdiUndoVariant,
      mdiMapClockOutline,
      mdiContentSaveAlertOutline
    }
  }),

  computed: {
    key() {
      return `mdi-${this.icon}`.toLowerCase().replace(/([-_][a-z])/g, g => g.toUpperCase().replace(/[-_]/g, ''));
    },

    styles() {
      const o = {
        'margin-bottom': '-.2em'
      };

      if (this.left) {
        o['margin-right'] = '.5em';
      }

      if (this.right) {
        o['margin-left'] = '.5em';
      }

      return o;
    }
  }
}
</script>