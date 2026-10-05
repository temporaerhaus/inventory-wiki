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
}
