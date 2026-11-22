import { bosses, period, plannedRaids } from "./model.js";

const cycles = ["weekly", "monthly"];
const dayStart = (key) => Date.parse(key + "T00:00:00+09:00");
const identity = ({ character, bossId }) => character + "/" + bossId;
const archive = (state) => state.history?.version === 1 ? state.history : null;
const makeArchive = () => ({ version: 1, weekly: {}, monthly: {} });
const dateSort = (left, right) => left.localeCompare(right);

function encode(raid) {
  return [
    raid.character.name, raid.boss.id, raid.boss.name, raid.level,
    raid.squad?.id ?? "", raid.squad?.name ?? (raid.size === 1 ? "솔로" : "파티 미지정"),
    raid.squad?.color ?? "", raid.size, raid.value, Number(raid.done),
  ];
}

function decode([character, bossId, boss, level, partyId, party, color, size, value, done]) {
  return { character, bossId, boss, level, partyId, party, color, size, value, done: Boolean(done) };
}

function importLegacy(state, history, now) {
  const known = new Map(bosses.map((boss) => [boss.id, boss]));
  for (const character of state.parties) {
    for (const [bossId, key] of Object.entries(character.clears)) {
      const boss = known.get(bossId);
      if (!boss || typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const start = dayStart(key);
      if (!Number.isFinite(start) || period(boss.cycle, start).key !== key ||
          key >= period(boss.cycle, now).key) continue;
      const data = history[boss.cycle][key] ??= { partial: true, rows: [] };
      data.rows.push([character.name, bossId, boss.name, "", "", "", "", null, null, 1]);
    }
  }
}

// Store this alongside the board in the same localStorage write.
export function captureHistory(state, now = Date.now()) {
  if (state.history && !archive(state)) return false;
  if (!state.history && !state.parties.length) return false;
  let changed = false;
  if (!state.history) {
    state.history = makeArchive();
    importLegacy(state, state.history, now);
    changed = true;
  }
  const raids = plannedRaids(state, now);
  for (const cycle of cycles) {
    const key = period(cycle, now).key;
    const rows = raids.filter((raid) => raid.boss.cycle === cycle)
      .map(encode)
      .sort((a, b) => dateSort(a[0], b[0]) || dateSort(a[1], b[1]));
    const saved = state.history[cycle][key];
    if (saved?.at > now) continue;
    if (saved && !saved.partial && JSON.stringify(saved.rows) === JSON.stringify(rows))
      continue;
    state.history[cycle][key] = { at: now, rows };
    changed = true;
  }
  return changed;
}

export function historyPeriods(state, cycle, range, now = Date.now()) {
  const stored = archive(state)?.[cycle] ?? {};
  const keys = Object.keys(stored).sort();
  const current = period(cycle, now);
  const oldest = keys[0] ?? current.key;
  const result = [];
  for (let item = current; result.length < (range || Infinity); item = period(cycle, item.start - 1)) {
    if (!range && item.key < oldest) break;
    const saved = stored[item.key];
    const before = stored[period(cycle, item.start - 1).key];
    const rows = saved?.rows.map(decode) ?? [];
    const status = saved
      ? saved.partial ? "partial" : item.key === current.key ? "current" : "saved"
      : "missing";
    result.push({
      ...item, status, rows, at: saved?.at,
      changes: saved && !saved.partial && before && !before.partial
        ? compareRows(before.rows.map(decode), rows) : [],
      comparable: Boolean(saved && !saved.partial && before && !before.partial),
    });
  }
  return result.reverse();
}

function compareRows(before, after) {
  const oldRows = new Map(before.map((row) => [identity(row), row]));
  const changes = [];
  for (const to of after) {
    const key = identity(to);
    const from = oldRows.get(key);
    oldRows.delete(key);
    if (!from) {
      changes.push({ kind: "추가", to });
      continue;
    }
    const fields = [];
    if (from.level !== to.level) fields.push("난이도");
    if (from.partyId !== to.partyId || from.party !== to.party) fields.push("파티");
    if (from.size !== to.size) fields.push("인원");
    if (from.value !== to.value && from.level === to.level && from.size === to.size)
      fields.push("결정석");
    if (fields.length) changes.push({ kind: fields.join("·") + " 변경", from, to });
  }
  for (const from of oldRows.values()) changes.push({ kind: "제외", from });
  return changes;
}

export function groupFor(row, grouping) {
  if (grouping === "character") return { id: row.character, name: row.character };
  if (grouping === "boss") return { id: row.bossId, name: row.boss };
  return {
    id: row.partyId ? "party/" + row.partyId : "status/" + row.party,
    name: row.party || "파티 확인 불가",
    color: row.color,
  };
}

export function historyMatches(row, terms) {
  const searchable = [row.character, row.boss, row.party, row.level]
    .join(" ").toLocaleLowerCase("ko-KR");
  return terms.every((term) => searchable.includes(term));
}

export function historyTotals(rows) {
  return rows.reduce((total, row) => {
    total.count += 1;
    total.done += Number(row.done);
    total.planned += row.value ?? 0;
    if (row.done) total.earned += row.value ?? 0;
    return total;
  }, { count: 0, done: 0, planned: 0, earned: 0 });
}

export function historyAnalysis(periods, { grouping, terms, groupId, missed }) {
  const groups = new Map();
  const byPeriod = periods.map((item) => {
    const matches = (row) => historyMatches(row, terms);
    const rows = item.rows.filter(matches);
    const changes = item.changes.filter(({ from, to }) =>
      (!missed || !(to ?? from).done) &&
      ((from && matches(from)) || (to && matches(to))));
    const cells = new Map();
    const touch = (row) => {
      const group = groupFor(row, grouping);
      groups.set(group.id, group);
      if (!cells.has(group.id)) cells.set(group.id, { rows: [], changes: [] });
      return cells.get(group.id);
    };
    rows.forEach((row) => touch(row).rows.push(row));
    for (const change of changes) {
      const sides = [change.from, change.to].filter((row) => row && matches(row));
      for (const row of sides) {
        const cell = touch(row);
        if (!cell.changes.includes(change)) cell.changes.push(change);
      }
    }
    const selected = groupId ? cells.get(groupId) : { rows, changes };
    const all = selected?.rows ?? [];
    return {
      ...item, cells, all, totals: historyTotals(all),
      displayed: missed ? all.filter((row) => !row.done) : all,
      changes: selected?.changes ?? [],
    };
  });
  const visibleGroups = [...groups.values()].filter(({ id }) =>
    (groupId && id === groupId) || (!groupId && (!missed || byPeriod.some(({ cells }) =>
      cells.get(id)?.rows.some((row) => !row.done)))));
  visibleGroups.sort((a, b) => dateSort(a.name, b.name));
  return { byPeriod, groups: visibleGroups, availableGroups: [...groups.values()] };
}

export const historyStatus = {
  current: "진행 중", saved: "보관됨", partial: "부분 기록", missing: "저장 기록 없음",
};
