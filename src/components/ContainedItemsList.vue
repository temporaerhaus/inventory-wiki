<template>
  <ul class="contained-items">
    <li v-for="(item, id) in containedItems" :key="id">
      <button v-if="item.container" :title="`Beinhaltete Gegenstände ${item.expanded ? 'einklappen' : 'aufklappen'}`" :class="{ 'invwiki-container': item.container || false, 'expanded': item.expanded || false, 'loading': loading }" @click="emit('expand', { id, item })" :disabled="loading"></button>

      <input type="checkbox" v-model="model[id]">
      <a :href="id">
        <b>{{ id }}:</b>
        {{ item.title }}
      </a>

      <ContainedItemsList :contained-items="item.children" v-if="item.container && item.expanded && Object.values(item.children || {})?.length" v-model="model" @expand="emit('expand', $event)" :loading="loading" />
    </li>
  </ul>
</template>

<script setup>
  const props = defineProps({
    loading: Boolean,
    containedItems: {
      type: Object
    }
  });

  const model = defineModel({
    type: Object
  });

  const emit = defineEmits(['expand']);
</script>
