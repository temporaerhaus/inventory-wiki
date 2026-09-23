// Die Auswahlliste für Kennbuchstaben.
//
// Grundlage ist die Normliste. Was im Haus tatsächlich unter welchem Code
// abgelegt wird, steht dort nicht drin: einige stark genutzte Codes haben nur
// einen Platzhaltertext, und ein paar benutzte Codes fehlen ganz. Dieses Wissen
// kommt — wie die Beschreibungen der Gegenstände — vom Wiki, weil es den
// Bestand des Hauses beschreibt und dieses Repository öffentlich ist.
//
// Solange nichts geladen ist, steht schlicht die Normliste da.

import din6779 from '@/utils/din6779.js';
import { codeNote, codeAdditions } from '@/utils/enrichment.js';

function decorate(entry) {
  const note = codeNote(entry.value);
  if (!note) {
    return entry;
  }

  return {
    ...entry,
    example: [note, entry.example].filter(Boolean).join('\n')
  };
}

export default function categories() {
  const additions = codeAdditions();

  return din6779.map((group) => {
    const own = additions
      .filter(e => e.group === group.group)
      .map(({ group: _group, ...entry }) => entry);

    return {
      ...group,
      children: [...(group.children || []).map(decorate), ...own]
        .sort((a, b) => a.value.localeCompare(b.value))
    };
  });
}
