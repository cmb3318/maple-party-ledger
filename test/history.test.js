import assert from "node:assert/strict";
import test from "node:test";
import { newParty, period, recordClear } from "../public/model.js";
import { captureHistory, historyAnalysis, historyPeriods } from "../public/history-data.js";
import { chartValues } from "../public/history-chart.js";
import { historyWorkbook } from "../public/history-xlsx.js";

const at = (date) => Date.parse(date + "+09:00");
const start = at("2026-11-19T00:00:00");
const end = at("2026-11-26T00:00:00");
const monthEnd = at("2026-12-01T00:00:00");
const clear = (state, bossId, cycle, now) => recordClear(state, {
  name: "기록검증", bossId, periodKey: period(cycle, now).key, done: true,
}, now);
function fixture() {
  const character = newParty("기록검증");
  character.targets = ["lotus", "blackmage"];
  return { version: 1, active: character.name, parties: [character], squads: [] };
}

test("last pre-midnight snapshot remains intact after a closed-browser gap", () => {
  const state = fixture();
  assert.equal(captureHistory(state, start), true);
  assert.equal(captureHistory(state, start + 1), false);
  clear(state, "lotus", "weekly", end - 1);
  clear(state, "blackmage", "monthly", end - 1);
  captureHistory(state, end - 1);
  const reloaded = JSON.parse(JSON.stringify(state));
  const later = at("2026-12-10T00:00:00");
  captureHistory(reloaded, later);
  const weeks = historyPeriods(reloaded, "weekly", 0, later);
  assert.deepEqual(weeks.map((week) => [week.key, week.status]), [
    ["2026-11-19", "saved"], ["2026-11-26", "missing"],
    ["2026-12-03", "missing"], ["2026-12-10", "current"],
  ]);
  assert.equal(weeks[0].at, end - 1);
  assert.equal(weeks[0].rows[0].done, true);
  assert.equal(weeks.at(-1).rows[0].done, false);
  assert.equal(weeks.at(-1).comparable, false);
  assert.deepEqual(historyPeriods(reloaded, "monthly", 0, later).map((month) => month.rows[0].done), [true, false]);
});

test("monthly stays cleared across Thursdays and weekly stays cleared across month-end", () => {
  const state = fixture();
  clear(state, "blackmage", "monthly", end - 1);
  captureHistory(state, end - 1);
  captureHistory(state, end);
  assert.equal(historyPeriods(state, "monthly", 1, end)[0].rows[0].done, true);
  clear(state, "lotus", "weekly", monthEnd - 1);
  captureHistory(state, monthEnd - 1);
  captureHistory(state, monthEnd);
  assert.equal(historyPeriods(state, "weekly", 1, monthEnd)[0].rows[0].done, true);
  assert.equal(historyPeriods(state, "monthly", 1, monthEnd)[0].rows[0].done, false);
});

test("legacy data contributes confirmed clears without inventing its historical plan", () => {
  const state = fixture();
  state.parties[0].clears = { lotus: "2026-11-12", blackmage: "2026-10-01", lucid: "2026-11-13" };
  captureHistory(state, start);
  const [partial, current] = historyPeriods(state, "weekly", 2, start);
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.rows.map((row) => [row.bossId, row.level, row.party, row.value, row.done]), [
    ["lotus", "", "", null, true],
  ]);
  assert.equal(current.comparable, false);
  assert.equal(chartValues({ ...partial, totals: { count: 1, done: 1 } }, "clears", false), null);
  assert.equal(historyPeriods(state, "monthly", 2, start)[0].status, "partial");
});

test("history detects changed, added and removed bosses and gives both parties the move", () => {
  const state = fixture();
  const character = state.parties[0];
  state.squads = [
    { id: "a", name: "기존", color: "#aabbcc", size: 2 },
    { id: "b", name: "이동", color: "#ccaabb", size: 2 },
  ];
  character.targets.push("damien");
  character.settings.lotus = { level: "노멀", squadId: "a", size: 2 };
  captureHistory(state, start);
  character.targets = ["lotus", "lucid"];
  character.settings.lotus = { level: "하드", squadId: "b", size: 1 };
  captureHistory(state, end);
  const periods = historyPeriods(state, "weekly", 2, end);
  assert.deepEqual(periods[1].changes.map((entry) => entry.kind), [
    "난이도·파티·인원 변경", "추가", "제외",
  ]);
  assert.equal(periods[0].rows.find((row) => row.bossId === "lotus").party, "기존");
  const analysis = historyAnalysis(periods, { grouping: "party", terms: [], groupId: "party/a", missed: false });
  assert.equal(analysis.byPeriod[1].all.length, 0);
  assert.equal(analysis.byPeriod[1].changes.length, 1);
  state.parties = [];
  captureHistory(state, end + 1);
  assert.equal(historyPeriods(state, "weekly", 1, end + 1)[0].status, "current");
  assert.deepEqual(historyPeriods(state, "weekly", 1, end + 1)[0].rows, []);
});

test("missed-only details and chart totals keep the planned denominator", () => {
  const state = fixture();
  state.parties[0].targets.push("damien");
  clear(state, "lotus", "weekly", start);
  captureHistory(state, start);
  const { byPeriod: [week] } = historyAnalysis(historyPeriods(state, "weekly", 1, start), {
    grouping: "character", terms: ["기록검증"], groupId: "", missed: true,
  });
  assert.deepEqual(week.displayed.map((row) => row.bossId), ["damien"]);
  assert.deepEqual(chartValues(week, "clears", true), [2, 1]);
  assert.deepEqual(chartValues(week, "rate", true), [100, 50]);
  assert.deepEqual(chartValues(week, "meso", true), [95_300_000, 46_400_000]);
});

test("Excel has the workbook parts and stores untrusted labels as text", async () => {
  const state = fixture();
  captureHistory(state, start);
  const { byPeriod } = historyAnalysis(historyPeriods(state, "weekly", 1, start), {
    grouping: "boss", terms: [], groupId: "", missed: false,
  });
  const workbook = historyWorkbook(byPeriod, { cycle: "weekly", scope: "=2+2 & <검증>", missed: false });
  const bytes = new Uint8Array(await workbook.arrayBuffer());
  const contents = new TextDecoder().decode(bytes);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.match(contents, /기간 요약/);
  assert.match(contents, /보스 상세/);
  assert.match(contents, /보스 변동/);
  assert.match(contents, /t="inlineStr"><is><t xml:space="preserve">=2\+2 &amp; &lt;검증&gt;/);
  assert.match(contents, /<c r="J2" s="2"><v>48900000<\/v>/);
  assert.ok(!contents.includes("<f>"));
});
