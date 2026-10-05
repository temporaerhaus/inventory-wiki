<template>
  <div class="invwiki-autocomplete">
    <label :for="id">
      <mdi-icon :icon="icon" left :title="label" v-if="icon" />
      {{ label }}
    </label>
    <div class="invwiki-autocomplete-field" :class="{ 'has-action': $slots.action }">
      <input :id="id" type="text" @input="onChange" v-model="search" @keydown.down="onArrowDown" @keydown.up="onArrowUp" @keydown.escape="isOpen = false" @keydown.enter="onEnter" :autofocus="autofocus" :disabled="disabled" @focus="onFocus" ref="input" autocomplete="off" />
      <!-- e.g. a button that fills the field in another way -->
      <span class="invwiki-autocomplete-action" v-if="$slots.action">
        <slot name="action"></slot>
      </span>
    </div>
    <ul v-show="isOpen" class="invwiki-autocomplete-results">
      <li class="loading" v-if="loading">
        Loading results...
      </li>
      <template v-for="(result, i) in filteredResults" :key="i">
        <li class="invwiki-autocomplete-result invwiki-autocomplete-group" v-if="result.first">
          <b>{{ result.group.group }}:</b>
          <div>{{ result.group.text }}</div>
        </li>
        <li @click="setResult(result)" :class="`invwiki-autocomplete-result invwiki-autocomplete-indent ${i === arrowCounter ? 'is-active' : ''}`">
          <slot name="item" :item="result" :searching="Boolean(search)">
            <template v-if="typeof(result) === 'object'">
              <b>{{ result.value }}:</b>
              <div>
                {{ result.text }}
                <pre v-if="result.example">{{result.example}}</pre>
              </div>
            </template>
            <div style="grid-column: 1 / 3" v-else>{{ result }}</div>
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
    disabled: Boolean,
    // only allow existing items as value: typed text is emitted as the item it
    // matches exactly, otherwise as null
    restrict: Boolean,
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
    },

    // keep the visible text in sync when the value is set from the outside,
    // e.g. by accepting a suggested Kennbuchstabe
    modelValue(value) {
      if (!value) {
        return;
      }

      const text = this.serializer ? this.serializer(value) : value;
      // a restricted field shows the chosen entry as it is spelled in the list; otherwise a value
      // that only differs in case comes from what is being typed, and the input is left alone
      const differs = this.restrict ? text !== this.search : String(text).toUpperCase() !== this.search.trim().toUpperCase();
      if (typeof text === 'string' && differs) {
        this.search = text;
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
        this.search = this.serializer ? this.serializer(this.modelValue) : this.modelValue;
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
      if (this.restrict) {
        const search = this.search.trim().toLowerCase();
        const match = this.results.find((e) => String(this.serializer ? this.serializer(e) : e).toLowerCase() === search);
        this.$emit('update:modelValue', match ?? null);
      } else {
        // a typed code counts in any case, and a known one comes with its description
        const search = this.search.trim().toUpperCase();
        const match = this.results.find((e) => String(this.serializer ? this.serializer(e) : e).toUpperCase() === search);
        if (match) {
          this.$emit('update:modelValue', match);
        } else if (/^[A-Z]{2}$/.test(search)) {
          // codes in use in the house that are not in the list
          this.$emit('update:modelValue', { value: search, text: search, example: '' });
        } else {
          // anything else is a search, it must not leave a previously chosen code behind
          this.$emit('update:modelValue', null);
        }
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
        if (result !== undefined) {
          this.$emit('update:modelValue', result);
          this.search = this.serializer ? this.serializer(result) : result;
        }
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
