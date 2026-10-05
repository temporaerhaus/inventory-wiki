<template>
  <!-- the text behind the textarea, whose own text is transparent, shows what
       of it is printed on the label and what not (greyed out) -->
  <div class="invwiki-label-input">
    <div class="invwiki-label-input-backdrop" ref="backdrop" aria-hidden="true">{{ printedPart }}<span class="invwiki-label-input-cut">{{ cutPart }}</span>{{ '\u200b' }}</div>
    <textarea :id="id" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" @scroll="syncScroll" @focus="$emit('focus', $event)" ref="input"></textarea>
  </div>
  <small class="invwiki-label-input-hint" v-if="cutPart.trim()">
    Der grau dargestellte Teil passt nicht mehr auf den {{ small ? 'kleinen ' : '' }}Aufkleber:
    {{ layout.maxLines }} Zeilen à {{ lineLength }} Zeichen{{ prefixLines > 0 ? `, davon ${prefixLines} für ${prefixLabel}` : '' }}.
  </small>
</template>

<script>
import { fitDescription, labelDescription, layoutOf, monoWidth } from '@/utils/label.js';

// The short description of an item, in the label's font, with what does not
// fit on the label greyed out; that depends on the label size and on the
// serial number and owner, which are printed before it
export default {
  props: {
    modelValue: String,
    id: String,
    inventoryId: String,
    serial: String,
    owner: String,
    small: Boolean,
  },

  emits: ['update:modelValue', 'focus'],

  computed: {
    layout() {
      return layoutOf(this.small);
    },

    // characters per line, for the hint
    lineLength() {
      return Math.floor(this.layout.maxWidth / monoWidth('x', this.layout.fontSize));
    },

    printedLength() {
      const description = this.modelValue || '';
      const text = labelDescription({ inventoryId: this.inventoryId, description, serial: this.serial, owner: this.owner });
      // the description is the end of what is printed
      const before = text.length - description.length;
      return Math.max(0, fitDescription(text, this.layout).printed - before);
    },

    printedPart() {
      return (this.modelValue || '').slice(0, this.printedLength);
    },

    cutPart() {
      return (this.modelValue || '').slice(this.printedLength);
    },

    // the lines the serial number and owner take up, before the description
    prefixLines() {
      const text = labelDescription({ inventoryId: this.inventoryId, serial: this.serial, owner: this.owner });
      return text ? fitDescription(text.replace(/\n$/, ''), { ...this.layout, maxLines: Infinity }).lines.length : 0;
    },

    prefixLabel() {
      const parts = [];
      if (this.serial) {
        parts.push('die Seriennummer');
      }
      if (String(this.inventoryId).startsWith('L-') && this.owner) {
        parts.push('die Eigentümer*in');
      }
      return parts.join(' und ');
    }
  },

  methods: {
    syncScroll() {
      this.$refs.backdrop.scrollTop = this.$refs.input.scrollTop;
    }
  },

  updated() {
    this.syncScroll();
  }
}
</script>
