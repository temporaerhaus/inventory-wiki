<template>
  <div class="invwiki-autocomplete">
    <label :for="id">{{ label }}</label>
    <input :id="id" type="text" @input="onChange" v-model="search" @keydown.down="onArrowDown" @keydown.up="onArrowUp" @keydown.escape="isOpen = false" @keydown.enter="onEnter" :autofocus="autofocus" />
    <ul v-show="isOpen" class="invwiki-autocomplete-results">
      <li class="loading" v-if="loading">
        Loading results...
      </li>
      <li v-else v-for="(result, i) in filteredResults" :key="i" @click="setResult(result)" :class="{ 'invwiki-autocomplete-result': true, 'is-active': i === arrowCounter, 'invwiki-autocomplete-indent': !result.group, 'invwiki-autocomplete-group': !!result.group }">
        <slot name="group" v-bind="result" v-if="result.group">
          {{ result }}
        </slot>
        <slot name="item" v-bind="result" v-else>
          {{ result }}
        </slot>
      </li>
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
      results: {},
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
  },

  destroyed() {
    document.removeEventListener('click', this.handleClickOutside);
  },

  methods: {
    async registerFuses(value) {
        if (typeof value === 'Function') {
          const tmp = value();
          if (typeof tmp === 'object' && typeof tmp.then === 'function') {
            this.loading = true;
            this.results = await tmp;
            this.loading = false;
          } else {
            this.loading = false;
            this.results = tmp;
          }
        } else if (typeof value === 'object' && typeof value.then === 'function') {
          this.loading = true;
          this.results = await value;
          this.loading = false;
        } else {
          this.results = value;
          this.loading = false;
        }

      if (this.grouped) {
        this.fuse = Object.fromEntries(this.results.map(e => [e.group, {
          fuse: new Fuse(e.children, { keys: this.keys, minMatchCharLength: 0 }),
          group: e
        }]));
      } else {
        this.fuse = new Fuse(this.results, { keys: this.keys, minMatchCharLength: 0 });
      }

      if (this.modelValue) {
        this.search = this.modelValue;
      }
    },

    setResult(result) {
      if (result.group) {
        return;
      }

      this.isOpen = false;
      this.$emit('update:modelValue', result);
      this.search = this.serializer ? this.serializer(result) : result;
    },

    onChange() {
      this.isOpen = true;
    },

    handleClickOutside(event) {
      if (!this.$el.contains(event.target)) {
        this.isOpen = false;
        this.arrowCounter = -1;
      }
    },

    onArrowDown(e) {
      e.stopPropagation();
      e.preventDefault();

      this.isOpen = true;

      if (this.isOpen && this.arrowCounter < this.results.length) {
        do {
          this.arrowCounter = this.arrowCounter + 1;
          if (this.arrowCounter >= this.results.length) {
            this.arrowCounter = 0;
          }
        } while (this.filteredResults[this.arrowCounter]?.group);
      }

      this.scrollIntoView();
    },

    onArrowUp(e) {
      e.stopPropagation();
      e.preventDefault();

      this.isOpen = true;

      if (this.isOpen && this.arrowCounter > 0) {
        do {
          this.arrowCounter = this.arrowCounter - 1;
          if (this.arrowCounter < 0) {
            this.arrowCounter = this.results.length - 1;
          }
        } while (this.filteredResults[this.arrowCounter]?.group);
      }

      this.scrollIntoView();
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
          this.$el.querySelector('.is-active')?.scrollIntoView?.();
        }
      }, 50);
    }
  },

  computed: {
    filteredResults() {
      if (!this.fuse) {
        return [];
      }

      if (this.grouped) {
        return Object.values(this.fuse).flatMap(({fuse, group}) => {
          const results = fuse.search(this.search);
          if (results.length > 0) {
            return [ group, ...results.map(e => e.item) ];
          }
          return [];
        });
      }

      if (!this.search) {
        return this.results;
      }

      return this.fuse.search(this.search).map(e => e.item);
    }
  }
};
</script>