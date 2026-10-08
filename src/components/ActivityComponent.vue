<template>
  <div class="invwiki invwiki-activity">
    <blockquote v-if="error">{{ error }}</blockquote>
    <p v-else-if="!activity">Lade die Aktivität …</p>

    <template v-else>
      <div class="invwiki-activity-periods" role="group" aria-label="Zeitraum">
        <button v-for="p in PERIODS" :key="p.days" type="button" :class="{ 'is-active': period === p.days }" @click="period = p.days">
          {{ p.label }}
        </button>
      </div>

      <table class="invwiki-leaderboard" v-if="board.length > 0">
        <thead>
          <tr>
            <th>Platz</th>
            <th>Name</th>
            <th title="Gegenstände angelegt">Angelegt</th>
            <th title="Aufenthaltsort aktualisiert oder als gerade gesehen markiert">Verortet</th>
            <th title="Sonstige Änderungen">Bearbeitet</th>
            <th>Punkte</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in board" :key="row.user" :class="{ 'is-me': row.user === activity.me, 'is-selected': row.user === selected }" @click="select(row.user)" :title="`Aktivität von ${row.name} anzeigen`">
            <td class="invwiki-leaderboard-rank">{{ MEDALS[row.rank - 1] || `${row.rank}.` }}</td>
            <td>
              {{ row.name }}
              <span class="invwiki-leaderboard-me" v-if="row.user === activity.me">du</span>
              <span class="invwiki-leaderboard-bar" :style="{ width: `${row.points / board[0].points * 100}%` }"></span>
            </td>
            <td data-label="Angelegt">{{ row.created }}</td>
            <td data-label="Verortet">{{ row.located }}</td>
            <td data-label="Bearbeitet">{{ row.edited }}</td>
            <td data-label="Punkte"><b>{{ row.points }}</b></td>
          </tr>
        </tbody>
      </table>
      <p v-else>In diesem Zeitraum hat noch niemand am Inventar gearbeitet. Wer fängt an?</p>

      <p class="invwiki-activity-note">
        Punkte: {{ POINTS.created }} je angelegtem Gegenstand, {{ POINTS.located }} je Verortung oder „Gerade gesehen“, {{ POINTS.edited }} je sonstiger Änderung.
        <template v-if="anonymous > 0">Dazu {{ anonymous }} {{ anonymous === 1 ? 'Beitrag' : 'Beiträge' }} ohne Anmeldung.</template>
      </p>

      <h2 class="invwiki-activity-heading">
        {{ selected === null ? 'Aktivität aller' : `Aktivität von ${nameOf(selected)}` }}
        <button type="button" v-if="selected !== null" @click="selected = null">Alle anzeigen</button>
      </h2>
      <p class="invwiki-activity-summary">
        {{ graph.total }} {{ graph.total === 1 ? 'Beitrag' : 'Beiträge' }} in den letzten 12 Monaten
        · Serie: {{ streaks.current }} {{ streaks.current === 1 ? 'Tag' : 'Tage' }} aktuell,
        {{ streaks.longest }} {{ streaks.longest === 1 ? 'Tag' : 'Tage' }} am längsten
      </p>

      <div class="invwiki-contributions-scroll" ref="scroll">
        <div class="invwiki-contributions" :style="{ gridTemplateColumns: `auto repeat(${graph.weeks.length}, var(--cell))` }">
          <span class="invwiki-contributions-month" v-for="m in graph.months" :key="m.column" :style="{ gridColumn: `${m.column + 2} / span 4` }">{{ m.label }}</span>
          <span class="invwiki-contributions-weekday" v-for="(d, i) in WEEKDAYS" :key="d" :style="{ gridRow: i + 2 }">{{ i % 2 === 0 && i < 6 ? d : '' }}</span>
          <template v-for="(week, w) in graph.weeks" :key="w">
            <span
              v-for="(cell, d) in week"
              :key="cell.day"
              class="invwiki-contributions-cell"
              :class="`level-${cell.level}`"
              :style="{ gridColumn: w + 2, gridRow: d + 2, visibility: cell.future ? 'hidden' : 'visible' }"
              :title="`${cell.count || 'Keine'} ${cell.count === 1 ? 'Beitrag' : 'Beiträge'} am ${cell.label}`"
            ></span>
          </template>
        </div>
      </div>
      <p class="invwiki-contributions-legend">
        weniger
        <span v-for="l in 5" :key="l" class="invwiki-contributions-cell" :class="`level-${l - 1}`"></span>
        mehr
      </p>
    </template>
  </div>
</template>

<script>
import { fetchActivity } from '@/utils/api.js';

// what each kind of work is worth on the leaderboard
const POINTS = { created: 3, located: 1, edited: 1 };
const PERIODS = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 365, label: '12 Monate' },
  { days: 0, label: 'Gesamt' },
];
const MEDALS = ['🥇', '🥈', '🥉'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// a day as the wiki writes it, YYYY-MM-DD, in local time
const dayKey = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(e => String(e).padStart(2, '0')).join('-');
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
const countOf = (e) => e.created + e.located + e.edited;

// A leaderboard of who worked on the inventory items, and a graph of the days
// they did, like the contributions on GitHub, from the change logs of the
// item pages
export default {
  data: () => ({
    POINTS,
    PERIODS,
    MEDALS,
    WEEKDAYS,
    activity: null,
    error: '',
    // days of the leaderboard, 0 for all time
    period: 30,
    // whose activity the graph shows, null for everyone's
    selected: null,
  }),

  computed: {
    today() {
      return new Date();
    },

    board() {
      const from = this.period ? dayKey(addDays(this.today, 1 - this.period)) : '';
      const users = {};
      for (const e of this.activity.days) {
        if (!e.user || e.day < from) {
          continue;
        }
        users[e.user] ??= { user: e.user, name: this.nameOf(e.user), created: 0, located: 0, edited: 0 };
        for (const kind of Object.keys(POINTS)) {
          users[e.user][kind] += e[kind];
        }
      }

      const rows = Object.values(users)
        .map(e => ({ ...e, points: Object.keys(POINTS).reduce((sum, kind) => sum + e[kind] * POINTS[kind], 0) }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
      // the same points, the same place
      rows.forEach((e, i) => e.rank = i > 0 && e.points === rows[i - 1].points ? rows[i - 1].rank : i + 1);
      return rows;
    },

    // contributions without a login in the period, which have no place on the board
    anonymous() {
      const from = this.period ? dayKey(addDays(this.today, 1 - this.period)) : '';
      return this.activity.days.filter(e => !e.user && e.day >= from).reduce((sum, e) => sum + countOf(e), 0);
    },

    // contributions per day of the selected user or of everyone
    perDay() {
      const days = {};
      for (const e of this.activity.days) {
        if (this.selected === null || e.user === this.selected) {
          days[e.day] = (days[e.day] || 0) + countOf(e);
        }
      }
      return days;
    },

    // 53 weeks of 7 days, Monday first, the last one with today
    graph() {
      const weekday = (this.today.getDay() + 6) % 7;
      const start = addDays(this.today, -weekday - 52 * 7);
      const todayKey = dayKey(this.today);

      const weeks = [];
      const months = [];
      let total = 0;
      for (let w = 0; w < 53; w++) {
        const week = [];
        for (let d = 0; d < 7; d++) {
          const date = addDays(start, w * 7 + d);
          const day = dayKey(date);
          const future = day > todayKey;
          const count = future ? 0 : this.perDay[day] || 0;
          total += count;
          week.push({ day, count, future, label: date.toLocaleDateString('de-DE') });
          // the month over the week of its first day
          if (date.getDate() === 1) {
            months.push({ column: w, label: MONTHS[date.getMonth()] });
          }
        }
        weeks.push(week);
      }

      // levels by quarters of the busiest day in the graph
      const max = Math.max(1, ...weeks.flat().map(e => e.count));
      for (const cell of weeks.flat()) {
        cell.level = cell.count === 0 ? 0 : Math.min(4, Math.ceil(cell.count / max * 4));
      }
      return { weeks, months, total };
    },

    // consecutive days with contributions: up to today (or yesterday, so that
    // it is not broken before the day is over), and the longest ever
    streaks() {
      let current = 0;
      let date = this.perDay[dayKey(this.today)] ? this.today : addDays(this.today, -1);
      while (this.perDay[dayKey(date)]) {
        current++;
        date = addDays(date, -1);
      }

      let longest = 0;
      for (const day of Object.keys(this.perDay)) {
        const [y, m, d] = day.split('-').map(Number);
        // only from the first day of a streak on
        if (this.perDay[dayKey(new Date(y, m - 1, d - 1))]) {
          continue;
        }
        let length = 0;
        while (this.perDay[dayKey(new Date(y, m - 1, d + length))]) {
          length++;
        }
        longest = Math.max(longest, length);
      }
      return { current, longest };
    },
  },

  async mounted() {
    try {
      this.activity = await fetchActivity();
      // the latest weeks are on the right, also where the graph has to scroll
      this.$nextTick(() => {
        if (this.$refs.scroll) {
          this.$refs.scroll.scrollLeft = this.$refs.scroll.scrollWidth;
        }
      });
    } catch (e) {
      this.error = /method|not found|unknown/i.test(e.message)
        ? 'Die Rangliste braucht das Inventar-Plugin im Wiki (dokuwiki-plugin/inventory), in der aktuellen Version.'
        : `Fehler: ${e.message}`;
    }
  },

  methods: {
    nameOf(user) {
      return this.activity.users[user] || user || 'Ohne Anmeldung';
    },

    select(user) {
      this.selected = this.selected === user ? null : user;
    },
  },
}
</script>
