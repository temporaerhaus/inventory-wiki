<template>
    <div class="overlay" v-show="dialog">
        <div class="dialog">
            <header>
                <mdi-icon :icon="icon" v-if="icon" left />
                {{ title }}

                <button @click="close()">
                    <mdi-icon icon="close" color="white" />
                </button>
            </header>

            <div class="invwiki-dialog-body">
                <slot></slot>
            </div>
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
            this.dialog = true;
            requestAnimationFrame(() => this.$emit('open'));
        }
    }
}
</script>