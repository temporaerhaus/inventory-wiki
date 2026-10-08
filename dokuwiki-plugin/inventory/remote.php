<?php

use dokuwiki\Extension\RemotePlugin;
use dokuwiki\plugin\inventory\Index;
use dokuwiki\plugin\inventory\Search;
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
     * Search the inventory items the caller may read, best matches first
     *
     * Every word of the query has to be found in the item: in its inventory
     * number, its name or another text field, or, for a typo, as a word that
     * is one letter off; see Search.php for how the matches are ranked.
     *
     * @param string $query what is typed into the search
     * @param int $limit number of items to return, at most 50
     * @return array {total: number of matching items, items: [{id, title, description, location, container, small, match: {field, value} or null}]}, match is where the query was found, if not in the number or the name
     */
    public function searchItems($query = '', $limit = 8)
    {
        $index = new Index();
        $index->sync();

        $items = array_map(static fn($row) => ['id' => strtoupper(noNS($row['_id']))] + $row, $index->allItems(
            [...array_keys(Search::FIELDS), 'container', 'small']
        ));
        $matches = array_values(array_filter(
            Search::rank((string) $query, $items),
            static fn($item) => !isHiddenPage($item['_id']) && auth_quickaclcheck($item['_id']) >= AUTH_READ
        ));

        return [
            'total' => count($matches),
            'items' => array_map(static fn($item) => [
                'id' => $item['id'],
                'title' => (string) $item['title'],
                'description' => (string) $item['description'],
                'location' => (string) $item['location'],
                'container' => $item['container'] === '1',
                'small' => $item['small'] === '1',
                'match' => $item['match'] ? ['field' => $item['match'][0], 'value' => $item['match'][1]] : null,
            ], array_slice($matches, 0, max(1, min(50, (int) $limit)))),
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

    /**
     * Who worked on the inventory items the caller may read, and on which days
     *
     * Counted from the change logs of the item pages: a creation, a change of
     * the location or the "seen" timestamp (by the summaries the frontend
     * writes), or any other change. Changes without a user, e.g. by readers
     * allowed in by their address, are counted under an empty user, without
     * the address.
     *
     * @return array {me: user of the caller, users: {login: full name}, days: [{user, day: YYYY-MM-DD in the wiki's time zone, created, located, edited}]}
     */
    public function listActivity()
    {
        global $auth, $INPUT;

        $index = new Index();
        $index->sync();

        $days = [];
        foreach ($index->allItems(['id']) as $row) {
            $id = $row['_id'];
            if (isHiddenPage($id) || auth_quickaclcheck($id) < AUTH_READ) {
                continue;
            }

            $log = metaFN($id, '.changes');
            foreach (is_file($log) ? file($log, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [] as $line) {
                // timestamp, ip, type, id, user, summary, extra, size change
                $entry = explode("\t", $line);
                if (!ctype_digit($entry[0])) {
                    continue;
                }
                $kind = self::activityKind($entry[2] ?? '', $entry[5] ?? '');
                if (!$kind) {
                    continue;
                }

                $user = $entry[4] ?? '';
                $day = date('Y-m-d', (int) $entry[0]);
                $days["$user\t$day"] ??= ['user' => $user, 'day' => $day, 'created' => 0, 'located' => 0, 'edited' => 0];
                $days["$user\t$day"][$kind]++;
            }
        }

        $users = [];
        foreach (array_unique(array_filter(array_column($days, 'user'), 'strlen')) as $user) {
            $users[$user] = $auth ? ($auth->getUserData($user)['name'] ?? $user) : $user;
        }

        return [
            'me' => $INPUT->server->str('REMOTE_USER'),
            'users' => (object) $users,
            'days' => array_values($days),
        ];
    }

    /**
     * What a change log entry counts as: created, located (a new location or
     * "seen"), edited, or null for what is no work on the item (deleting it,
     * undoing a location update)
     */
    private static function activityKind($type, $summary)
    {
        if ($type === DOKU_CHANGE_TYPE_CREATE) {
            return 'created';
        }
        if ($type === DOKU_CHANGE_TYPE_DELETE || $summary === 'location update undone') {
            return null;
        }
        if ($summary === 'seen' || str_starts_with($summary, 'location update')) {
            return 'located';
        }
        return 'edited';
    }
}
