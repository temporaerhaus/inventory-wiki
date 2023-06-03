<template>
  <div class="invwiki-autocomplete">
    <label :for="id">
      <mdi-icon :icon="icon" left :title="label" v-if="icon" />
      {{ label }}
    </label>
    <input :id="id" type="text" @input="onChange" v-model="search" @keydown.down="onArrowDown" @keydown.up="onArrowUp" @keydown.escape="isOpen = false" @keydown.enter="onEnter" :autofocus="autofocus" @focus="onFocus" ref="input" />
    <ul v-show="isOpen" class="invwiki-autocomplete-results">
      <li class="loading" v-if="loading">
        Loading results...
      </li>
      <template v-for="(result, i) in filteredResults" :key="i">
        <li class="invwiki-autocomplete-result invwiki-autocomplete-group" v-if="result.first">
          <slot name="group" v-bind="result">
            {{ result.group }}
          </slot>
        </li>
        <li @click="setResult(result)" :class="`invwiki-autocomplete-result invwiki-autocomplete-indent ${i === arrowCounter ? 'is-active' : ''}`">
          <slot name="item" v-bind="result">
            {{ result }}
          </slot>
        </li>
      </template>
    </ul>
  </div>
</template>

<script>
import Fuse from 'fuse.js';

// based on https://www.digitalocean.com/community/tutorials/vuejs-vue-autocomplete-component
export default {
  name: 'SearchAutocomplete',

  props: {
    modelValue: {
      type: [Object, String]
    },
    serializer: Function,
    autofocus: Boolean,
    grouped: Boolean,
    label: String,
    icon: String,
    keys: {
      type: Array,
      required: true
    },
    items: {
      type: [Array, Function],
      default: () => ([]),
      required: false
    },
  },

  data() {
    return {
      id: `invwiki-autocomplete-${Math.round((Math.random()*10000))}`,
      isOpen: false,
      results: [],
      fuse: null,
      search: '',
      loading: false,
      arrowCounter: -1,
    };
  },

  watch: {
    items(value, oldValue) {
      if (value !== oldValue) {
        this.registerFuses(value);
      }
    }
  },

  mounted() {
    document.addEventListener('click', this.handleClickOutside);
    this.registerFuses(this.items);

    if (this.modelValue?.value) {
      this.search = this.modelValue.value;
    } else if (typeof this.modelValue === 'string' && this.modelValue) {
      this.search = this.modelValue;
    }
  },

  destroyed() {
    document.removeEventListener('click', this.handleClickOutside);
  },

  methods: {
    async registerFuses(value) {
      this.loading = true;
      let results = await (typeof(value) === 'Function' ? value() : value);
      this.loading = false;

      this.results = !this.grouped ? results : results.flatMap((group) => {
        return group.children.map((e, i) => ({ ...e, first: i === 0, group: { ...group, children: undefined } }));
      });

      this.fuse = new Fuse(this.results, {
        keys: this.keys,
        minMatchCharLength: 0
      });

      if (this.modelValue) {
        this.search = this.modelValue;
      }
    },

    setResult(result) {
      this.isOpen = false;
      this.$emit('update:modelValue', result);
      this.search = this.serializer ? this.serializer(result) : result;
    },

    onChange() {
      this.isOpen = true;
      this.arrowCounter = 0;
      if (/^[A-Z]{2}$/.test(this.search)) {
        this.$emit('update:modelValue', {
          value: this.search,
          text: this.search,
          example: ''
        });
      }
    },

    handleClickOutside(event) {
      if (!this.$el.contains(event.target)) {
        this.isOpen = false;
        this.arrowCounter = -1;
      }
    },

    onArrowDown(e, direction=1) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }

      this.isOpen = true;
      this.arrowCounter += direction;

      if (this.arrowCounter >= this.filteredResults.length) {
        this.arrowCounter = 0;
      } else if (this.arrowCounter < 0) {
        this.arrowCounter = this.filteredResults.length - 1;
      }

      this.scrollIntoView();
    },

    onArrowUp(e) {
      this.onArrowDown(e, -1);
    },

    onFocus() {
      this.$refs.input.scrollIntoView({ block: 'start', inline: 'nearest' });
      requestAnimationFrame(() => this.onArrowDown());
    },

    onEnter(e) {
      e.stopPropagation();
      e.preventDefault();

      if (this.isOpen) {
        const result = this.filteredResults[this.arrowCounter];
        this.$emit('update:modelValue', result);
        this.search = this.serializer ? this.serializer(result) : result;
        this.isOpen = false;
        this.arrowCounter = -1;
      }
    },

    scrollIntoView() {
      setTimeout(() => {
        if (this.isOpen) {
          this.$el.querySelector('.is-active')?.scrollIntoView?.({ block: 'center' });
        }
      }, 5);
    },

    close() {
      this.isOpen = false;
    }
  },

  computed: {
    filteredResults() {
      if (!this.fuse) {
        return [];
      }

      if (!this.search) {
        return this.results;
      }

      return this.fuse.search(this.search).map(e => e.item);
    }
  }
};
</script>
