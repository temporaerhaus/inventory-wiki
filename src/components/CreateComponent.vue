<template>
  <button @click="editItem" v-if="sub">
    <mdi-icon icon="subdirectory-arrow-right" left />
    Zugehörigen Gegenstand Hinzufügen
  </button>
  <button @click="editItem" v-else-if="clone">
    <mdi-icon icon="content-duplicate" left />
    Gegenstand Duplizieren
  </button>
  <button @click="editItem" v-else-if="edit">
    <mdi-icon icon="square-edit-outline" left />
    Gegenstand Bearbeiten
  </button>
  <button @click="createItem" v-else>
    <mdi-icon icon="toy-brick-plus-outline" left />
    Neuen Gegenstand Anlegen
  </button>

  <x-dialog :title="edit ? 'Gegenstand Bearbeiten' : 'Neuen Gegenstand Anlegen'" :icon="edit ? 'square-edit-outline' : 'toy-brick-plus-outline'" ref="dialog" :loading="loading">
    <div>
      <label :for="`invwiki-form-title-${nonce}`">
        <mdi-icon icon="toy-brick-outline" left title="Gegenstand" />
        Gegenstand
      </label>
      <input :id="`invwiki-form-title-${nonce}`" type="text" v-model="title" @focus="$refs.c?.close?.()" />

      <template v-if="edit">
        <label :for="`invwiki-form-id-${nonce}`">Inventarnummer</label>
        <input :id="`invwiki-form-id-${nonce}`" type="text" :value="inventoryId" disabled />
      </template>

      <label :for="`invwiki-form-description-${nonce}`">
        <mdi-icon icon="clipboard-text-outline" left title="Kurzbeschreibung" />
        Kurzbeschreibung
      </label>
      <label-description-input
        :id="`invwiki-form-description-${nonce}`"
        v-model="description"
        :inventory-id="edit ? inventoryId : id"
        :serial="serial"
        :owner="owner"
        :small="Boolean(small)"
        @focus="$refs.c?.close?.()"
      />
      <blockquote>
        Die Kurzbeschreibung wird mit auf den Inventaraufkleber gedruckt, soweit sie darauf passt; was nicht mehr passt, ist grau.
        Weitere Informationen zum Gegenstand und Anhänge können unten bei <em>Weitere Inhalte</em> hinterlegt werden.
      </blockquote>

      <label :for="`invwiki-form-category-${nonce}`">
        <mdi-icon icon="tag-outline" left title="Kategorie" />
        Kategorie
      </label>
      <input :id="`invwiki-form-category-${nonce}`" type="text" v-model="category" @focus="$refs.c?.close?.()" />

      <label :for="`invwiki-form-origin-${nonce}`">
        <mdi-icon icon="basket-unfill" left title="Ursprung" />
        Ursprung
      </label>
      <input :id="`invwiki-form-origin-${nonce}`" type="text" v-model="origin" @focus="$refs.c?.close?.()" />

      <label :for="`invwiki-form-owner-${nonce}`">
        <mdi-icon icon="account-question-outline" left title="Eigentümer*in" />
        Eigentümer*in
      </label>
      <input :id="`invwiki-form-owner-${nonce}`" type="text" v-model="owner" @focus="$refs.c?.close?.()" />

      <label :for="`invwiki-form-lended-${nonce}`" v-if="!edit">
        <input :id="`invwiki-form-lended-${nonce}`" type="checkbox" v-model="lended" />
        <mdi-icon icon="account-question-outline" left />
        Leihgabe
      </label>

      <label :for="`invwiki-form-small-${nonce}`">
        <input :id="`invwiki-form-small-${nonce}`" type="checkbox" v-model="small" />
        <mdi-icon icon="image-size-select-small" left />
        Kleines Label
      </label>

      <label :for="`invwiki-form-container-${nonce}`">
        <input :id="`invwiki-form-container-${nonce}`" type="checkbox" v-model="container" />
        <mdi-icon icon="package-variant" left />
        Kann andere Gegenstände beherbergen
      </label>

      <label :for="`invwiki-form-date-${nonce}`">
        <mdi-icon icon="calendar" left title="Anschaffungsdatum" />
        Anschaffungsdatum
      </label>
      <input :id="`invwiki-form-date-${nonce}`" type="date" v-model="date" @focus="$refs.c?.close?.()" />

      <label :for="`invwiki-form-serial-${nonce}`">
        <mdi-icon icon="pound-box-outline" left title="Seriennummer" />
        Seriennummer
      </label>
      <input :id="`invwiki-form-serial-${nonce}`" type="text" v-model="serial" @focus="$refs.c?.close?.()" />

      <label :for="`invwiki-form-invoice-${nonce}`">
        <mdi-icon icon="file-document-outline" left title="Rechnung" />
        Rechnung
      </label>
      <input :id="`invwiki-form-invoice-${nonce}`" type="text" v-model="invoice" @focus="$refs.c?.close?.()" />

      <template v-if="!edit">
        <label v-if="suggestionsVisible">
          <mdi-icon icon="lightbulb-on-outline" left title="Vorschläge" />
          Vorschläge
        </label>
        <div class="invwiki-suggestions" v-if="suggestionsVisible">
          <p class="invwiki-suggestions-hint" v-if="suggestLoading">
            Vergleiche mit bisherigen Gegenständen …
          </p>
          <p class="invwiki-suggestions-hint" v-else-if="suggestError">
            Vorschläge nicht verfügbar ({{ suggestError }}).
          </p>
          <p class="invwiki-suggestions-hint" v-else-if="!suggestions.length">
            Keine vergleichbaren Gegenstände gefunden — bitte unten selbst auswählen.
          </p>
          <button
            v-for="suggestion in suggestions"
            :key="suggestion.code"
            type="button"
            :class="`invwiki-suggestion ${classification?.value === suggestion.code ? 'is-active' : ''}`"
            @click="applySuggestion(suggestion)"
          >
            <b>{{ suggestion.code }}</b>
            <span class="invwiki-suggestion-share">{{ Math.round(suggestion.confidence * 100) }}%</span>
            <span class="invwiki-suggestion-text">{{ describe(suggestion.code) }}</span>
            <span class="invwiki-suggestion-items">
              wie {{ suggestion.items.slice(0, 3).map(e => e.title).join(' · ') }}
            </span>
          </button>
        </div>

        <search-autocomplete v-model="classification" :items="categories" label="Kennbuchstabe" icon="shape-outline" grouped :keys="weights" :serializer="(e) => e.value" ref="c" :disabled="sub" />
        <blockquote v-if="classification?.text">
          {{ classification.text }}
        </blockquote>

        <label :for="`invwiki-form-number-${nonce}`">
          <mdi-icon icon="numeric-positive1" left title="Fortlaufende Nummer" />
          Fortlaufende Nummer
        </label>
        <input :id="`invwiki-form-number-${nonce}`" type="text" :value="number" disabled />

        <template v-if="sub">
          <label :for="`invwiki-form-suffix-${nonce}`">
            <mdi-icon icon="sort-alphabetical-descending" left title="Suffix" />
            Suffix
          </label>
          <select :id="`invwiki-form-suffix-${nonce}`" v-model="suffix" @change="suffixChosen = true" @focus="$refs.c?.close?.()">
            <option v-for="s in suffixOptions" :key="s" :value="s" :disabled="takenSuffixes.includes(s)">
              {{ s }}{{ takenSuffixes.includes(s) ? ' (vergeben)' : '' }}
            </option>
          </select>
          <blockquote>
            Wenn Netzteile ein eigenes Label erhalten, aber nicht extra inventarisiert werden, so endet der QR-Code und die Nummer auf -N. Bei sonstigen Zubehör, auf -Z (und dann das Alphabet rückwärts).
            Das Suffix wird anhand des Namens vorgeschlagen, bereits vergebene sind nicht auswählbar.
          </blockquote>
        </template>

        <label :for="`invwiki-form-id-${nonce}`">
          <mdi-icon icon="barcode" left title="Inventarnummer" />
          Zu vergebende Inventarnummer
        </label>
        <input :id="`invwiki-form-id-${nonce}`" type="text" :value="id" disabled @focus="$refs.c?.close?.()" />
      </template>

      <label :for="`invwiki-form-content-${nonce}`">
        <mdi-icon icon="language-markdown-outline" left title="Weitere Inhalte" />
        Weitere Inhalte
      </label>
      <markdown-editor :id="`invwiki-form-content-${nonce}`" v-model="content" :preview-path="pagePath" :media-namespace="mediaNamespace" />
      <blockquote>
        Beliebiger Markdown-Inhalt, der auf der Wiki-Seite unterhalb der Gegenstandsdaten angezeigt wird, z.B. Notizen, Links oder Anhänge.
        Bilder und Dateien können per Drag &amp; Drop in das Feld gezogen werden.
      </blockquote>
    </div>

    <template #footer>
      <button @click="deleteItem()" :disabled="loading" v-if="edit" class="invwiki-delete">
        <mdi-icon icon="delete-outline" left title="Löschen" />
        Löschen
      </button>
      <button @click="saveItem()" :disabled="disabled" v-if="!edit">
        <mdi-icon icon="toy-brick-plus-outline" left title="Gegenstand Anlegen" />
        Gegenstand Anlegen
      </button>
      <button @click="saveItem()" :disabled="disabled" v-else>
        <mdi-icon icon="content-save-outline" left title="Speichern" />
        Speichern
      </button>
    </template>
  </x-dialog>
</template>

<script>
import SearchAutocomplete from '@/components/SearchAutocomplete.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import LabelDescriptionInput from '@/components/LabelDescriptionInput.vue';
import categories from '@/utils/categories.js';
import { buildIndex, suggest } from '@/utils/suggest.js';
import { itemText, loadEnrichment } from '@/utils/enrichment.js';

import { SEP, PREFIX, TRASH, nextNumber, takenSuffixes, writeItem, trashItem, fetchInventory, fetchItemContent } from '@/utils/api.js';

const ID_REGEX = new RegExp(`^([SVL])-([A-Z]{2})([0-9]{6})-?([A-Z])?$`);
// names of power supplies, which get the suffix N, all other accessories get Z
const POWER_SUPPLY_REGEX = /netz(teil|gerät|adapter)|lade(gerät|adapter)|power ?supply|\bpsu\b|charger|trafo|transformator|stromversorgung|\b(ac|dc|usb)[- ]?adapter/i;
const SUGGEST_DEBOUNCE = 150;

export default {
  props: {
    edit: Boolean,
    clone: Boolean,
    sub: Boolean
  },

  components: {
    SearchAutocomplete,
    MarkdownEditor,
    LabelDescriptionInput
  },

  data: () => ({
    categories: categories(),

    loading: true,

    suggestions: [],
    suggestIndex: null,
    suggestLoading: false,
    suggestError: '',
    suggestTimeout: null,

    number: '',
    title: '',
    suffix: '',
    // the suffixes of the existing sub-items of the item, which cannot be chosen
    takenSuffixes: [],
    // whether the suffix was chosen by hand, which stops the suggestions
    suffixChosen: false,
    inventoryId: '',
    description: '',
    serial: '',
    invoice: '',
    date: null,
    category: '',
    origin: '',
    owner: '',
    lended: null,
    small: null,
    container: null,
    content: '',
    // content as loaded, so that the page content is only written if it was changed
    initialContent: '',

    classification: null,
    suffixOptions: ['N', ...Array(26).fill(null).map((_, i) => String.fromCharCode(90-i)).filter(e => e !== 'N')],

    // This nonce is appended to every id-attribute of input elements in this component, because id-attributes of
    // input elements need to be unique, for screen readers and for label elements associated via a for-attribute.
    // Since it is not known how many instances of this component will be created, the nonce is generated randomly.
    nonce: Math.floor(Math.random()*10000).toString(),
  }),

  watch: {
    title() {
      this.suggestSuffix();
      this.scheduleSuggestions();
    },

    description() {
      this.scheduleSuggestions();
    }
  },

  methods: {
    scheduleSuggestions() {
      if (this.edit || this.sub) {
        return;
      }

      clearTimeout(this.suggestTimeout);
      this.suggestTimeout = setTimeout(() => this.refreshSuggestions(), SUGGEST_DEBOUNCE);
    },

    // The index is built from the existing inventory, so it always reflects how
    // the house classifies right now. Loading it must never block the dialog.
    async loadSuggestIndex() {
      if (this.suggestIndex || this.suggestLoading) {
        return;
      }

      this.suggestLoading = true;
      this.suggestError = '';

      try {
        // the generated descriptions are a separate chunk, fetched the first
        // time somebody opens this dialog rather than on every wiki page
        await loadEnrichment();
        this.categories = categories();

        const inventory = await fetchInventory();
        this.suggestIndex = buildIndex(inventory.map(e => ({ ...e, extra: itemText(e.title) })));
      } catch (e) {
        this.suggestError = e.message;
      } finally {
        this.suggestLoading = false;
        this.refreshSuggestions();
      }
    },

    refreshSuggestions() {
      if (!this.suggestIndex) {
        this.suggestions = [];
        return;
      }

      // the short description is the user's own words for the same thing, and
      // is exactly the everyday vocabulary the item name usually lacks
      this.suggestions = suggest(this.suggestIndex, {
        title: this.title,
        extra: this.description
      }, { limit: 3 });
    },

    applySuggestion(suggestion) {
      this.classification = this.classificationsByCode[suggestion.code] || {
        value: suggestion.code,
        text: suggestion.code,
        example: ''
      };
    },

    describe(code) {
      return this.classificationsByCode[code]?.text || 'Nicht in der Liste — bisher im Haus verwendet';
    },

    // N for power supplies, Z for everything else, or, if that is taken, the
    // next free one in the order of the list
    suggestSuffix() {
      if (!this.sub || this.suffixChosen) {
        return;
      }

      const start = POWER_SUPPLY_REGEX.test(this.title) ? 0 : 1;
      const order = [...this.suffixOptions.slice(start), ...this.suffixOptions.slice(0, start)];
      this.suffix = order.find(e => !this.takenSuffixes.includes(e)) ?? '';
    },

    async refreshNumber() {
      if (this.edit || this.sub) {
        return;
      }
      this.number = await nextNumber();
    },

    async createItem() {
      this.content = '';
      this.initialContent = '';
      this.loadSuggestIndex();
      await this.refreshNumber();
      this.loading = false;
      this.$refs.dialog.show();
    },

    async editItem() {
      if (!this.edit && !this.sub) {
        this.loadSuggestIndex();
      }

      this.loading = false;

      this.title = this.$parent.title || '';
      this.inventoryId = this.$parent.inventoryId || '';
      this.description = this.$parent.description || '';
      this.serial = this.$parent.serial || '';
      this.invoice = this.$parent.invoice || '';
      this.date = this.$parent.date || '';
      this.category = this.$parent.category || '';
      this.origin = this.$parent.origin || '';
      this.owner = this.$parent.owner || '';
      this.small = this.$parent.small || null;
      this.container = this.$parent.container || null;
      this.content = '';
      this.initialContent = '';

      const res = ID_REGEX.exec(this.$parent.inventoryId);

      this.number = res?.[3] || '000000';
      if (this.clone) {
        await this.refreshNumber();
      }
      this.classification = {
        value: res?.[2] || '??',
        text: res?.[2] || '??',
        example: ''
      };
      // a sub-item gets a suffix of its own, a duplicate a new number and none
      this.suffix = this.sub || this.clone ? '' : res?.[4] || '';
      if (res?.[1] == 'L') {
        this.lended = true;
      }

      this.suffixChosen = false;
      this.takenSuffixes = [];
      this.suggestSuffix();

      this.$refs.dialog.show();

      this.loading = true;
      try {
        const [content, taken] = await Promise.all([
          fetchItemContent(location.pathname),
          this.sub ? takenSuffixes(`${res?.[1]}-${res?.[2]}${res?.[3]}`) : [],
        ]);
        this.content = this.initialContent = content;
        this.takenSuffixes = taken;
        this.suggestSuffix();
      } catch (e) {
        alert(`Fehler beim Laden der Inhalte: ${e.message}`);
      } finally {
        this.loading = false;
      }
    },

    async saveItem() {
      this.loading = true;

      try {
        await writeItem(this.edit ? location.pathname : `/${PREFIX}${SEP}${this.id}`, {
          title: this.title || '',
          description: this.description || '',
          serial: this.serial || '',
          invoice: this.invoice || '',
          date: this.date || '',
          category: this.category || '',
          origin: this.origin || '',
          owner: this.owner || '',
          small: this.small || false,
          container: this.container || false,
        }, {
          create: !this.edit,
          content: !this.edit || this.content !== this.initialContent ? this.content : undefined,
          summary: this.edit ? 'update metadata' : 'create inventory item'
        });

        this.loading = false;

        if (this.edit) {
          location.reload();
        } else {
          location.href = `/${PREFIX}${SEP}${this.id}#print-label`;
        }
      } catch (e) {
        alert(`Fehler: ${e.message}`);
        this.loading = false;
      }
    },

    async deleteItem() {
      if (!confirm(`${this.inventoryId} (${this.title}) wirklich löschen?\n\nDie Seite wird in den Papierkorb (${TRASH}) verschoben.`)) {
        return;
      }

      this.loading = true;
      try {
        await trashItem(location.pathname);
        location.href = `/${PREFIX}`;
      } catch (e) {
        alert(`Fehler: ${e.message}`);
        this.loading = false;
      }
    }
  },

  computed: {
    classificationsByCode() {
      return Object.fromEntries(this.categories.flatMap(
        group => (group.children || []).map(entry => [entry.value, { ...entry, group: { ...group, children: undefined } }])
      ));
    },

    // page of the item, known once the inventory number is complete
    pagePath() {
      if (this.edit) {
        return location.pathname;
      }

      return this.id.includes('?') ? null : `/${PREFIX}${SEP}${this.id}`;
    },

    // uploads of an item are kept in a namespace of their own
    mediaNamespace() {
      const id = this.edit ? this.inventoryId : this.id;
      return !id || id.includes('?') ? null : `${PREFIX}:${id.toLowerCase()}`;
    },

    suggestionsVisible() {
      return !this.edit && !this.sub && Boolean(this.title.trim());
    },

    id() {
      return `${this.lended ? 'L' : 'V'}-${this.classification?.value || '??'}${this.number || '??????'}${this.suffix ? `-${this.suffix}` : ''}`;
    },

    disabled() {
      return this.id.includes('?') && !this.edit || this.sub && !this.suffix || this.loading;
    },

    weights() {
      return [{
        name: 'value',
        weight: 0.4
      }, {
        name: 'text',
        weight: 0.3
      }, {
        name: 'group.text',
        weight: 0.2
      }, {
        name: 'example',
        weight: 0.1
      }];
    }
  }
}
</script>
