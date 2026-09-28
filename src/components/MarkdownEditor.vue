<template>
  <div class="invwiki-markdown-editor">
    <div class="invwiki-markdown-tabs">
      <button type="button" :class="{ 'is-active': !preview }" @click="preview = false">
        <mdi-icon icon="square-edit-outline" left />
        Bearbeiten
      </button>
      <button type="button" :class="{ 'is-active': preview }" @click="showPreview" :disabled="!previewPath" :title="previewPath ? '' : 'Erst möglich, wenn die Inventarnummer feststeht'">
        <mdi-icon icon="eye-outline" left />
        Vorschau
      </button>
      <button type="button" @click="$refs.file.click()" :disabled="!mediaNamespace || uploading > 0" :title="mediaNamespace ? '' : 'Erst möglich, wenn die Inventarnummer feststeht'">
        <mdi-icon icon="upload" left />
        Datei hochladen
      </button>
      <input type="file" ref="file" multiple style="display: none" @change="onFileInput" />
    </div>

    <div class="invwiki-markdown-preview" v-if="preview">
      <p v-if="previewLoading">Lade Vorschau …</p>
      <p v-else-if="previewError">{{ previewError }}</p>
      <p v-else-if="!previewHtml.trim()"><em>Kein Inhalt</em></p>
      <div v-else v-html="previewHtml"></div>
    </div>

    <textarea
      v-show="!preview"
      :id="id"
      ref="textarea"
      :class="`invwiki-content ${dragging ? 'is-dragging' : ''}`"
      :value="modelValue"
      rows="10"
      @input="$emit('update:modelValue', $event.target.value)"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    ></textarea>

    <blockquote v-if="uploading > 0">
      Lade {{ uploading }} {{ uploading > 1 ? 'Dateien' : 'Datei' }} hoch …
    </blockquote>
    <blockquote v-if="uploadError" class="invwiki-error">
      {{ uploadError }}
    </blockquote>
  </div>
</template>

<script>
import { renderPreview, uploadMedia } from '@/utils/api.js';

export default {
  props: {
    id: String,
    modelValue: String,
    // page the preview is rendered for, null while it is not known yet
    previewPath: String,
    // media namespace uploads are stored in, null while it is not known yet
    mediaNamespace: String
  },

  emits: ['update:modelValue'],

  data: () => ({
    preview: false,
    previewHtml: '',
    previewError: '',
    previewLoading: false,
    dragging: false,
    uploading: 0,
    uploadError: ''
  }),

  methods: {
    async showPreview() {
      this.preview = true;
      this.previewLoading = true;
      this.previewError = '';

      try {
        this.previewHtml = await renderPreview(this.previewPath, this.modelValue || '');
      } catch (e) {
        this.previewError = e.message;
      } finally {
        this.previewLoading = false;
      }
    },

    onDrop(event) {
      this.dragging = false;
      this.upload([...event.dataTransfer.files]);
    },

    onFileInput(event) {
      this.upload([...event.target.files]);
      event.target.value = '';
    },

    async upload(files) {
      if (!files.length) {
        return;
      }

      if (!this.mediaNamespace) {
        this.uploadError = 'Hochladen ist erst möglich, wenn die Inventarnummer feststeht.';
        return;
      }

      this.uploadError = '';
      this.uploading = files.length;

      // one after another, so the snippets end up in the order the files were dropped
      for (const file of files) {
        try {
          const id = await uploadMedia(this.mediaNamespace, file);
          this.insert(file.type.startsWith('image/')
            ? `![${file.name.replace(/\.[^.]*$/, '')}](:${id})`
            : `{{ :${id} |${file.name}}}`);
        } catch (e) {
          this.uploadError = `${file.name}: ${e.message}`;
        } finally {
          this.uploading--;
        }
      }
    },

    // insert a snippet as a paragraph of its own at the cursor, or at the end if the textarea was never focused
    insert(snippet) {
      const value = this.modelValue || '';
      const textarea = this.$refs.textarea;
      const position = document.activeElement === textarea || textarea.selectionStart ? textarea.selectionStart : value.length;
      const before = value.slice(0, position);
      const after = value.slice(position);
      const gap = (text) => '\n'.repeat(Math.max(0, 2 - /\n*$/.exec(text)[0].length));
      const text = `${before ? gap(before) : ''}${snippet}\n${after && !after.startsWith('\n') ? '\n' : ''}`;

      this.$emit('update:modelValue', before + text + after);
      this.$nextTick(() => {
        textarea.selectionStart = textarea.selectionEnd = before.length + text.length;
      });
    }
  }
}
</script>
