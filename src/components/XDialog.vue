<template>
  <div class="overlay" v-show="dialog">
    <div class="dialog">
      <header>
        <mdi-icon :icon="icon" v-if="icon" left />
        <slot name="title">{{ title }}</slot>

        <button @click="close()">
          <mdi-icon icon="close" color="white" />
        </button>
      </header>

      <div class="invwiki-dialog-body">
        <slot></slot>
      </div>

      <!-- the dialog's actions, which stay in view while the body scrolls -->
      <footer class="invwiki-dialog-footer" v-if="$slots.footer">
        <slot name="footer"></slot>
      </footer>
    </div>
    <div class="loader" v-if="loading">
      <div class="loader-line-wrap"><div class="loader-line"></div></div>
      <div class="loader-line-wrap"><div class="loader-line"></div></div>
      <div class="loader-line-wrap"><div class="loader-line"></div></div>
      <div class="loader-line-wrap"><div class="loader-line"></div></div>
      <div class="loader-line-wrap"><div class="loader-line"></div></div>
      <div class="loader-line-wrap"><div class="loader-line"></div></div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    loading: Boolean,
    title: String,
    icon: String
  },

  data: () => ({
    dialog: false
  }),

  mounted() {
  },

  methods: {
    close() {
      this.$emit('close');
      this.dialog = false;
    },

    show() {
      return new Promise((resolve) => {
        this.dialog = true;
        requestAnimationFrame(() => {
          this.$emit('open');
          resolve()
        });
      })
    }
  }
}
</script>
