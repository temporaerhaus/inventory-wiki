<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" :style="styles">
    <title>{{ title ?? icon }}</title>
    <path :d="icons[key]" />
  </svg>
</template>

<script>
import {
  mdiClose,
  mdiBarcode,
  mdiPrinter,
  mdiCalendar,
  mdiEyeOutline,
  mdiTagOutline,
  mdiQrcodePlus,
  mdiQrcodeScan,
  mdiSyncCircle,
  mdiFlashlight,
  mdiUndoVariant,
  mdiShapeOutline,
  mdiClockOutline,
  mdiBasketUnfill,
  mdiHomeMapMarker,
  mdiFlashlightOff,
  mdiToyBrickOutline,
  mdiMapClockOutline,
  mdiPoundBoxOutline,
  mdiNumericPositive1,
  mdiContentDuplicate,
  mdiSquareEditOutline,
  mdiCloudPrintOutline,
  mdiContentSaveOutline,
  mdiFileDocumentOutline,
  mdiFileDownloadOutline,
  mdiToyBrickPlusOutline,
  mdiImageSizeSelectSmall,
  mdiClipboardTextOutline,
  mdiMapMarkerAlertOutline,
  mdiSubdirectoryArrowRight,
  mdiAccountQuestionOutline,
  mdiContentSaveAlertOutline,
  mdiSortAlphabeticalDescending,
  mdiPackageVariant,
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
      mdiBarcode,
      mdiPrinter,
      mdiCalendar,
      mdiEyeOutline,
      mdiTagOutline,
      mdiQrcodePlus,
      mdiQrcodeScan,
      mdiSyncCircle,
      mdiFlashlight,
      mdiUndoVariant,
      mdiShapeOutline,
      mdiClockOutline,
      mdiBasketUnfill,
      mdiHomeMapMarker,
      mdiFlashlightOff,
      mdiToyBrickOutline,
      mdiMapClockOutline,
      mdiPoundBoxOutline,
      mdiNumericPositive1,
      mdiContentDuplicate,
      mdiSquareEditOutline,
      mdiCloudPrintOutline,
      mdiContentSaveOutline,
      mdiFileDocumentOutline,
      mdiFileDownloadOutline,
      mdiToyBrickPlusOutline,
      mdiImageSizeSelectSmall,
      mdiClipboardTextOutline,
      mdiMapMarkerAlertOutline,
      mdiSubdirectoryArrowRight,
      mdiAccountQuestionOutline,
      mdiContentSaveAlertOutline,
      mdiSortAlphabeticalDescending,
      mdiPackageVariant,
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
