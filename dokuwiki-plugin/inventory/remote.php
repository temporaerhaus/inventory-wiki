<?php

use dokuwiki\Extension\RemotePlugin;
use dokuwiki\plugin\inventory\Index;
use dokuwiki\Remote\RemoteException;

/**
 * Serves the inventory items as a table: filtered, sorted and one page at a
 * time, out of the SQLite index in Index.php, so that the client only receives
 * the rows and columns it shows.
 */
class remote_plugin_inventory extends RemotePlugin
{
    private const DEFAULT_COLUMNS = ['id', 'title', 'serial', 'invoice', 'date', 'owner', 'location'];

    /**
     * Query the inventory items the caller may read
     *
     * Text comparisons ignore case and match anywhere in the value.
     *
     * @param string $search whitespace separated terms, each one has to be found in at least one of the returned columns
     * @param array $filters column => text that has to be found in that column
     * @param string $sort column to sort by
     * @param bool $desc sort descending
     * @param int $offset number of matching items to skip
     * @param int $limit number of items to return, 0 for all
     * @param string[] $columns columns to return, the inventory id is always included
     * @return array {total: number of matching items, items: [{id, ...columns}]}
     */
    public function listItems(
        $search = '',
        $filters = [],
        $sort = 'id',
        $desc = false,
        $offset = 0,
        $limit = 50,
        $columns = []
    ) {
        $columns = $columns ?: self::DEFAULT_COLUMNS;
        foreach ([...$columns, ...array_keys((array) $filters), $sort] as $column) {
            if (!isset(Index::COLUMNS[$column])) {
                throw new RemoteException("Unknown column: $column", 400);
            }
        }
        $columns = array_values(array_unique(['id', ...$columns]));
        $filters = array_filter(array_map('strval', (array) $filters), 'strlen');
        $terms = preg_split('/\s+/', trim($search), -1, PREG_SPLIT_NO_EMPTY);

        $index = new Index();
        $index->sync();

        // the ACL can differ per page, so it is checked for every match;
        // only then is it known how many there are and which belong on the page
        $ids = array_values(array_filter(
            $index->matchingIds($terms, $columns, $filters, $sort, (bool) $desc),
            static fn($id) => !isHiddenPage($id) && auth_quickaclcheck($id) >= AUTH_READ
        ));

        $page = array_slice($ids, max(0, (int) $offset), $limit > 0 ? (int) $limit : null);

        return [
            'total' => count($ids),
            'items' => array_map(static function ($row) {
                $row['id'] = strtoupper(noNS($row['id']));
                return $row;
            }, $index->rows($page, $columns)),
        ];
    }

    /**
     * The places and containers an item can be put in, as a tree
     *
     * The places ("Orte") are the entries of the locations page, a list nested
     * in an entry there lists the places within it. Below them are the items
     * that can contain items ("Behälter"), each in the place or container it is
     * in now (its temporary location, otherwise its nominal one). A container
     * in an unknown place, or in a loop of containers, is at the top level.
     *
     * @return array [{value, kind: place|container, title, description, depth, path: [values of the places above]}], in the order of the tree
     */
    public function listLocations()
    {
        $places = [];
        $page = Index::NS . ':locations';
        if (page_exists($page) && auth_quickaclcheck($page) >= AUTH_READ) {
            $places = self::places((string) p_wiki_xhtml($page, '', false));
        }

        $index = new Index();
        $index->sync();
        $ids = array_values(array_filter(
            $index->matchingIds([], [], ['container' => '1'], 'id', false),
            static fn($id) => !isHiddenPage($id) && auth_quickaclcheck($id) >= AUTH_READ
        ));

        $containers = array_map(static fn($row) => [
            'value' => strtoupper(noNS($row['id'])),
            'kind' => 'container',
            'title' => (string) $row['title'],
            'description' => (string) $row['description'],
            'parent' => (string) $row['location'],
        ], $index->rows($ids, ['id', 'title', 'description', 'location']));

        return self::tree([...$places, ...$containers]);
    }

    /**
     * The entries of the lists in a rendered page, each with the entry it is nested in
     */
    private static function places($html)
    {
        if (trim($html) === '') {
            return [];
        }

        $doc = new DOMDocument();
        @$doc->loadHTML('<?xml encoding="utf-8">' . $html);

        $ownText = static function ($li) {
            if (!$li) {
                return '';
            }
            $copy = $li->cloneNode(true);
            foreach (iterator_to_array((new DOMXPath($copy->ownerDocument))->query('.//ul|.//ol', $copy)) as $list) {
                $list->parentNode->removeChild($list);
            }
            return trim($copy->textContent);
        };

        $places = [];
        $xpath = new DOMXPath($doc);
        foreach ($xpath->query('//li') as $li) {
            $name = $ownText($li);
            if ($name === '') {
                continue;
            }
            $places[] = [
                'value' => $name,
                'kind' => 'place',
                'title' => '',
                'description' => '',
                'parent' => $ownText($xpath->query('ancestor::li[1]', $li)->item(0)),
            ];
        }
        return $places;
    }

    /**
     * Orders the nodes as a tree, each one below the node its parent names
     *
     * Kept in step with locationTree() in src/utils/api.js, which does the
     * same in the browser where this plugin is not installed.
     */
    private static function tree($nodes)
    {
        $key = static fn($value) => mb_strtoupper(trim((string) $value));

        $byKey = [];
        foreach ($nodes as $i => $node) {
            $byKey[$key($node['value'])] ??= $i;
        }

        $roots = [];
        $children = [];
        foreach ($nodes as $i => $node) {
            $parent = $byKey[$key($node['parent'])] ?? null;
            if ($parent !== null && $parent !== $i) {
                $children[$parent][] = $i;
            } else {
                $roots[] = $i;
            }
        }

        $seen = [];
        $options = [];
        $walk = static function ($i, $path) use (&$walk, &$seen, &$options, $nodes, $children) {
            if (isset($seen[$i])) {
                return;
            }
            $seen[$i] = true;

            $node = $nodes[$i];
            unset($node['parent']);
            $options[] = $node + ['depth' => count($path), 'path' => $path];
            foreach ($children[$i] ?? [] as $child) {
                $walk($child, [...$path, $node['value']]);
            }
        };

        foreach ($roots as $i) {
            $walk($i, []);
        }
        // whatever is only reachable through a loop
        foreach (array_keys($nodes) as $i) {
            $walk($i, []);
        }

        return $options;
    }
}
