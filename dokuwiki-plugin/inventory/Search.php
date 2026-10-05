<?php

namespace dokuwiki\plugin\inventory;

/**
 * Ranks the items for a search as it is typed: every word of the query has to
 * be found in the item, the better the places it is found in, the higher the
 * item ranks. A word is found
 *
 *  - in the inventory number,
 *  - at the start of a word of the name, or anywhere in it,
 *  - anywhere in the other text fields,
 *  - or, for a typo, as a word of the name, description or category that is
 *    one letter off (two for longer words).
 *
 * The items are few enough (thousands) to be ranked in full on every query.
 */
class Search
{
    // what is searched besides the inventory number, API column => label of the field
    public const FIELDS = [
        'title' => 'Name',
        'description' => 'Kurzbeschreibung',
        'serial' => 'Seriennummer',
        'invoice' => 'Rechnung',
        'category' => 'Kategorie',
        'origin' => 'Ursprung',
        'owner' => 'Eigentümer*in',
        'location' => 'Aufenthaltsort',
    ];

    // the words of these are compared for typos
    private const FUZZY_FIELDS = ['title', 'description', 'category'];

    private const SCORE_ID_EXACT = 100;
    private const SCORE_ID = 70;
    private const SCORE_TITLE_WORD = 50;
    private const SCORE_TITLE = 40;
    private const SCORE_FIELD = 20;
    private const SCORE_FUZZY = 10;

    /**
     * @param string $query
     * @param array[] $items rows with "id" and the columns of FIELDS
     * @return array[] the matching rows, best first, each with "score" and
     *         "match": [field label, value] where the best match was outside
     *         the number and the name, null otherwise
     */
    public static function rank($query, $items)
    {
        $terms = array_values(array_unique(preg_split('/\s+/u', self::lower($query), -1, PREG_SPLIT_NO_EMPTY)));
        if (!$terms) {
            return [];
        }

        $results = [];
        foreach ($items as $item) {
            $score = 0;
            $match = null;
            $matchScore = 0;
            foreach ($terms as $term) {
                [$termScore, $field] = self::scoreTerm($term, $item);
                if ($termScore === 0) {
                    continue 2;
                }
                $score += $termScore;
                if ($field !== null && $termScore > $matchScore) {
                    $matchScore = $termScore;
                    $match = [self::FIELDS[$field], (string) $item[$field]];
                }
            }

            $results[] = $item + ['score' => $score, 'match' => $match];
        }

        // stable, so equal scores keep the order of the ids
        usort($results, static fn($a, $b) => $b['score'] <=> $a['score']);
        return $results;
    }

    /**
     * The best place a word of the query is found in an item
     *
     * @return array [score, API column of a field other than the name, or null]
     */
    private static function scoreTerm($term, $item)
    {
        $id = self::lower($item['id']);
        if ($id === $term) {
            return [self::SCORE_ID_EXACT, null];
        }
        if (str_contains($id, $term)) {
            return [self::SCORE_ID, null];
        }

        $title = self::lower($item['title']);
        if (preg_match('/(^|[^\p{L}\p{N}])' . preg_quote($term, '/') . '/u', $title)) {
            return [self::SCORE_TITLE_WORD, null];
        }
        if (str_contains($title, $term)) {
            return [self::SCORE_TITLE, null];
        }

        foreach (array_keys(self::FIELDS) as $field) {
            if ($field !== 'title' && str_contains(self::lower($item[$field]), $term)) {
                return [self::SCORE_FIELD, $field];
            }
        }

        // short words are too easily one letter off anything
        $length = mb_strlen($term);
        if ($length >= 4) {
            $distance = $length >= 8 ? 2 : 1;
            foreach (self::FUZZY_FIELDS as $field) {
                foreach (self::words($item[$field]) as $word) {
                    if (abs(mb_strlen($word) - $length) <= $distance && self::distance($word, $term) <= $distance) {
                        return [self::SCORE_FUZZY, $field === 'title' ? null : $field];
                    }
                }
            }
        }

        return [0, null];
    }

    private static function lower($text)
    {
        return mb_strtolower(trim((string) $text));
    }

    private static function words($text)
    {
        return preg_split('/[^\p{L}\p{N}]+/u', self::lower($text), -1, PREG_SPLIT_NO_EMPTY);
    }

    // levenshtein() counts bytes, an umlaut would count twice
    private static function distance($a, $b)
    {
        $chars = [];
        $encode = static function ($text) use (&$chars) {
            return implode('', array_map(static function ($char) use (&$chars) {
                return $chars[$char] ??= chr(count($chars) % 256);
            }, mb_str_split($text)));
        };
        return levenshtein($encode($a), $encode($b));
    }
}
