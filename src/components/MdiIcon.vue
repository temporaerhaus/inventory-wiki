<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" :style="styles">
    <title>{{ title ?? icon }}</title>
    <path :d="icons[key]" />
  </svg>
</template>

<script>
import {
  mdiClose,
  mdiPrinter,
  mdiCalendar,
  mdiTagOutline,
  mdiQrcodePlus,
  mdiQrcodeScan,
  mdiUndoVariant,
  mdiClockOutline,
  mdiBasketUnfill,
  mdiHomeMapMarker,
  mdiToyBrickOutline,
  mdiMapClockOutline,
  mdiPoundBoxOutline,
  mdiSquareEditOutline,
  mdiFileDocumentOutline,
  mdiFileDownloadOutline,
  mdiToyBrickPlusOutline,
  mdiClipboardTextOutline,
  mdiMapMarkerAlertOutline,
  mdiAccountQuestionOutline,
  mdiContentSaveAlertOutline,
} from '@mdi/js';

export default {
  props: {
    icon: String,
    title: String,
    left: Boolean,
    right: Boolean,
    color: String
  },

  data: () => ({
    icons: {
      mdiClose,
      mdiPrinter,
      mdiCalendar,
      mdiTagOutline,
      mdiQrcodePlus,
      mdiQrcodeScan,
      mdiUndoVariant,
      mdiClockOutline,
      mdiBasketUnfill,
      mdiHomeMapMarker,
      mdiToyBrickOutline,
      mdiMapClockOutline,
      mdiPoundBoxOutline,
      mdiSquareEditOutline,
      mdiFileDocumentOutline,
      mdiFileDownloadOutline,
      mdiToyBrickPlusOutline,
      mdiClipboardTextOutline,
      mdiMapMarkerAlertOutline,
      mdiAccountQuestionOutline,
      mdiContentSaveAlertOutline,
    }
  }),

  computed: {
    key() {
      return `mdi-${this.icon}`.toLowerCase().replace(/([-_][a-z])/g, g => g.toUpperCase().replace(/[-_]/g, ''));
    },

    styles() {
      const o = {
        'margin-bottom': '-.2em',
        'stroke': this.color
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