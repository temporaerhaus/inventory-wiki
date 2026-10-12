// The parts of an item page's text below its title.

// lazy, so that code blocks in the content below the yaml block are not swallowed
export const YAML_REGEX = /```yaml\n(.*?)\n```/s;

// The Schlagwort ("category" in the yaml) is also a tag of the tag plugin, so
// that the wiki lists the items by it. The commonmark plugin passes dokuwiki
// syntax on only in a dokuwiki code block, which comes right after the yaml
// block and is kept in step with it on every save, not part of the content.
export const TAG_BLOCK_REGEX = /^\n*```dokuwiki\n\{\{tag>[^\n]*\}\}\n```/;

// One tag, also of several words, which the tag plugin takes in quotes (and
// joins with underscores); quotes and braces would end it early.
export const tagBlock = (category) => {
  const tag = String(category ?? '').replace(/["{}]/g, '').replace(/\s+/g, ' ').trim();
  return tag ? '```dokuwiki\n{{tag>"' + tag + '"}}\n```' : '';
};

// the page with the tag block for the Schlagwort right after the yaml block,
// instead of the one it had, or without one if there is no Schlagwort
export const withTag = (wikitext, category) => {
  const match = YAML_REGEX.exec(wikitext);
  const end = match.index + match[0].length;
  const block = tagBlock(category);
  return wikitext.slice(0, end) + (block ? `\n\n${block}` : '') + wikitext.slice(end).replace(TAG_BLOCK_REGEX, '');
};
