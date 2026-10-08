<?php

namespace dokuwiki\plugin\inventory;

use PDO;
use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;

require_once __DIR__ . '/vendor/autoload.php';

/**
 * SQLite index over the metadata of all item pages.
 *
 * It is derived from the pages alone: the database file can be deleted at any
 * time and is rebuilt on the next query. Before every query the pages of the
 * namespace are compared against it by modification time and size, so it also
 * picks up changes that bypass the wiki's save events, such as a restored backup.
 */
class Index
{
    public const NS = 'inventar';

    // bump to rebuild the database after a change of the schema or the parsing
    private const VERSION = 4;

    // same as YAML_REGEX in src/utils/api.js
    private const YAML_REGEX = '/```yaml\n(.*?)\n```/s';
    private const TITLE_REGEX = '/^# (.*)$/m';

    /**
     * The columns that can be returned, filtered and sorted, API name => SQL column.
     *
     * Each has a sort key next to it, "<column>_sort", which is what is indexed:
     * filters match anywhere in a value (LIKE '%...%'), which no index can help with.
     */
    public const COLUMNS = [
        'id' => 'id',
        'title' => 'title',
        'description' => 'description',
        'serial' => 'serial',
        'invoice' => 'invoice',
        'date' => 'date',
        'category' => 'category',
        'origin' => 'origin',
        'owner' => 'owner',
        // where the item is right now, as on the item page
        'location' => 'location',
        'nominal' => 'nominal',
        'temporary' => 'temporary',
        'lastSeenAt' => 'last_seen_at',
        'small' => 'small',
        'container' => 'container',
        // when the item page was created and last changed, and by whom, see history()
        'created' => 'created',
        'modified' => 'modified',
        'creator' => 'creator',
        'editor' => 'editor',
    ];

    // yes/no columns, stored as '1' or '', nothing to search for in them
    private const FLAGS = ['small', 'container'];

    private PDO $db;

    public function __construct()
    {
        global $conf;

        $file = $conf['metadir'] . '/' . self::NS . '_index.sqlite3';
        $this->db = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $this->db->exec('PRAGMA journal_mode = WAL');
        $this->db->exec('PRAGMA busy_timeout = 10000');

        if ((int) $this->db->query('PRAGMA user_version')->fetchColumn() !== self::VERSION) {
            $this->createSchema();
        }
    }

    private function createSchema()
    {
        $columns = implode(', ', array_map(
            static fn($column) => "$column TEXT NOT NULL DEFAULT '' COLLATE NOCASE, {$column}_sort TEXT NOT NULL DEFAULT ''",
            array_diff(array_values(self::COLUMNS), ['id'])
        ));

        $this->db->exec('DROP TABLE IF EXISTS items');
        // every page of the namespace has a row, also those that are no item (is_item = 0),
        // so that they are not parsed again on every query
        $this->db->exec("CREATE TABLE items (
            id TEXT PRIMARY KEY COLLATE NOCASE,
            id_sort TEXT NOT NULL DEFAULT '',
            revision INTEGER NOT NULL,
            size INTEGER NOT NULL,
            is_item INTEGER NOT NULL,
            $columns
        )");
        foreach (self::COLUMNS as $column) {
            $this->db->exec("CREATE INDEX items_$column ON items (is_item, {$column}_sort)");
        }
        $this->db->exec('PRAGMA user_version = ' . self::VERSION);
    }

    /**
     * Bring the index up to date with the pages of the namespace
     */
    public function sync()
    {
        global $conf;

        $pages = [];
        search($pages, $conf['datadir'], 'search_allpages', ['skipacl' => 1, 'depth' => 2], self::NS);

        $known = [];
        foreach ($this->db->query('SELECT id, revision, size FROM items') as $row) {
            $known[$row['id']] = [(int) $row['revision'], (int) $row['size']];
        }

        $changed = array_filter(
            $pages,
            static fn($page) => ($known[$page['id']] ?? null) !== [$page['mtime'], $page['size']]
        );
        $deleted = array_diff(array_keys($known), array_column($pages, 'id'));

        if (!$changed && !$deleted) {
            return;
        }

        $columns = [];
        foreach (self::COLUMNS as $column) {
            array_push($columns, $column, "{$column}_sort");
        }
        $upsert = $this->db->prepare(sprintf(
            'INSERT OR REPLACE INTO items (revision, size, is_item, %s) VALUES (?, ?, ?, %s)',
            implode(', ', $columns),
            implode(', ', array_fill(0, count($columns), '?'))
        ));
        $delete = $this->db->prepare('DELETE FROM items WHERE id = ?');

        $this->db->beginTransaction();
        try {
            foreach ($changed as $page) {
                $item = $this->parse(rawWiki($page['id']));
                if ($item) {
                    $item += self::history($page['id'], $page['mtime']);
                }
                $values = [];
                foreach (array_keys(self::COLUMNS) as $key) {
                    $value = $key === 'id' ? $page['id'] : ($item[$key] ?? '');
                    array_push($values, $value, self::sortKey($value));
                }
                $upsert->execute([$page['mtime'], $page['size'], $item ? 1 : 0, ...$values]);
            }
            foreach ($deleted as $id) {
                $delete->execute([$id]);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * When a page was created and last changed, as UTC timestamps like the dates
     * in the yaml, and by whom: created from its change log, the latest creation,
     * so that a page deleted and created again counts from then (the oldest
     * change for a log without one, the file time without a log); changed from
     * its file, which also covers changes that were never logged. The users are
     * those of these log entries, by their full names, empty for a change
     * without a login or without a log.
     *
     * @param string $id page id
     * @param int $mtime modification time of the page file
     * @return array {created, modified, creator, editor}
     */
    private static function history($id, $mtime)
    {
        $created = null;
        $oldest = null;
        $last = null;
        $log = metaFN($id, '.changes');
        foreach (is_file($log) ? file($log, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [] as $line) {
            // timestamp, ip, type, id, user, summary, extra, size change
            $entry = explode("\t", $line);
            if (!ctype_digit($entry[0])) {
                continue;
            }
            $oldest ??= $entry;
            if (($entry[2] ?? '') === DOKU_CHANGE_TYPE_CREATE) {
                $created = $entry;
            }
            $last = $entry;
        }
        $created ??= $oldest;

        $format = static fn($time) => gmdate('Y-m-d\TH:i:s', $time) . '.000Z';
        return [
            'created' => $format($created ? (int) $created[0] : $mtime),
            'modified' => $format($mtime),
            'creator' => self::userName($created[4] ?? ''),
            'editor' => self::userName($last[4] ?? ''),
        ];
    }

    /**
     * The full name of a user, the login for one that is gone, '' for none
     */
    private static function userName($user)
    {
        global $auth;
        static $names = [];

        if ($user === '') {
            return '';
        }
        return $names[$user] ??= ($auth ? ($auth->getUserData($user)['name'] ?? '') : '') ?: $user;
    }

    /**
     * The column values of an item page, as strings, null if the page is no item
     *
     * @param string $text raw wiki text of the page
     * @return array|null
     */
    public function parse($text)
    {
        $text = str_replace("\r\n", "\n", $text);
        preg_match_all(self::YAML_REGEX, $text, $blocks);

        // the first block that is an item's metadata, as in fetchInventoryItem()
        $data = null;
        foreach ($blocks[1] as $block) {
            try {
                $parsed = Yaml::parse($block, Yaml::PARSE_DATETIME);
            } catch (ParseException) {
                continue;
            }
            if (is_array($parsed) && !empty($parsed['inventory'])) {
                $data = $parsed;
                break;
            }
        }

        if ($data === null) {
            return null;
        }

        preg_match(self::TITLE_REGEX, $text, $title);
        $nominal = self::text($data['nominal']['location'] ?? '');
        $temporary = self::text($data['temporary']['location'] ?? '');

        return [
            'title' => trim($title[1] ?? ''),
            'description' => self::text($data['description'] ?? ''),
            'serial' => self::text($data['serial'] ?? ''),
            'invoice' => self::text($data['invoice'] ?? ''),
            'date' => self::text($data['date'] ?? ''),
            'category' => self::text($data['category'] ?? ''),
            'origin' => self::text($data['origin'] ?? ''),
            'owner' => self::text($data['owner'] ?? ''),
            'location' => $temporary !== '' ? $temporary : $nominal,
            'nominal' => $nominal,
            'temporary' => $temporary,
            'lastSeenAt' => self::text($data['lastSeenAt'] ?? ''),
            'small' => empty($data['small']) ? '' : '1',
            'container' => empty($data['container']) ? '' : '1',
        ];
    }

    /**
     * A yaml value as it is shown in the table
     *
     * Dates come back as written: a plain date as such, a timestamp the way the
     * frontend writes them (Date.prototype.toJSON).
     */
    private static function text($value)
    {
        if ($value instanceof \DateTimeInterface) {
            $utc = \DateTimeImmutable::createFromInterface($value)->setTimezone(new \DateTimeZone('UTC'));
            return $utc->format('H:i:s.u') === '00:00:00.000000'
                ? $utc->format('Y-m-d')
                : $utc->format('Y-m-d\TH:i:s.v\Z');
        }
        if (is_bool($value)) {
            return $value ? 'true' : '';
        }
        if (is_scalar($value)) {
            return trim((string) $value);
        }
        return '';
    }

    /**
     * The ids of all items matching the filters, in the requested order
     *
     * Only ids, the ACL is checked on them before any row is loaded.
     *
     * @param string[] $terms each one has to be found in at least one of $searchColumns
     * @param string[] $searchColumns API column names
     * @param array $filters API column name => text that has to be found in it
     * @param string $sort API column name
     * @param bool $desc
     * @return string[]
     */
    public function matchingIds($terms, $searchColumns, $filters, $sort, $desc)
    {
        $where = ['is_item = 1'];
        $params = [];
        $searchColumns = array_values(array_diff($searchColumns, self::FLAGS));

        foreach ($terms as $term) {
            $where[] = '(' . implode(' OR ', array_map(
                static fn($key) => self::COLUMNS[$key] . " LIKE ? ESCAPE '\\'",
                $searchColumns
            )) . ')';
            array_push($params, ...array_fill(0, count($searchColumns), self::like($term)));
        }

        foreach ($filters as $key => $value) {
            $where[] = self::COLUMNS[$key] . " LIKE ? ESCAPE '\\'";
            $params[] = self::like($value);
        }

        $order = self::COLUMNS[$sort] . '_sort' . ($desc ? ' DESC' : ' ASC');
        $statement = $this->db->prepare(
            'SELECT id FROM items WHERE ' . implode(' AND ', $where) . " ORDER BY $order, id_sort"
        );
        $statement->execute($params);

        return $statement->fetchAll(PDO::FETCH_COLUMN);
    }

    /**
     * The rows of the given ids, in the given order
     *
     * @param string[] $ids
     * @param string[] $columns API column names
     * @return array[]
     */
    public function rows($ids, $columns)
    {
        if (!$ids) {
            return [];
        }

        $select = implode(', ', array_map(static fn($key) => self::COLUMNS[$key] . ' AS "' . $key . '"', $columns));
        $statement = $this->db->prepare(
            "SELECT id AS _id, $select FROM items WHERE id IN (" . implode(', ', array_fill(0, count($ids), '?')) . ')'
        );
        $statement->execute(array_values($ids));

        $rows = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $rows[$row['_id']] = array_diff_key($row, ['_id' => true]);
        }

        return array_values(array_filter(array_map(static fn($id) => $rows[$id] ?? null, $ids)));
    }

    /**
     * All items, in the order of their ids, each with its page id as "_id"
     *
     * @param string[] $columns API column names
     * @return array[]
     */
    public function allItems($columns)
    {
        $select = implode(', ', array_map(static fn($key) => self::COLUMNS[$key] . ' AS "' . $key . '"', $columns));
        return $this->db
            ->query("SELECT id AS _id, $select FROM items WHERE is_item = 1 ORDER BY id_sort")
            ->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Sorts like a human would: case does not matter, and the numbers in a value
     * compare by their value, so that SN-999 comes before SN-3100
     */
    private static function sortKey($value)
    {
        return preg_replace_callback(
            '/\d+/',
            static fn($digits) => str_pad(ltrim($digits[0], '0'), 20, '0', STR_PAD_LEFT),
            mb_strtolower($value)
        );
    }

    private static function like($text)
    {
        return '%' . addcslashes($text, '%_\\') . '%';
    }
}
