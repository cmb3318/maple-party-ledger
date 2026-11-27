import assert from "node:assert/strict";
import test from "node:test";
import {
  bosses,
  newParty,
  period,
  plannedRaids,
  recordClear,
  undoClear,
} from "../public/model.js";
import {
  fetchSchedulerChanges,
  schedulerCandidates,
  schedulerPlan,
} from "../public/scheduler.js";

const now = Date.parse("2026-11-20T08:00:00Z");
function plan() {
  const character = newParty("단풍이");
  character.profile = { world: "루나" };
  character.targets.push("lotus", "damien", "blackmage");
  character.settings.lotus = { level: "노멀", note: "금요일" };
  return { parties: [character], squads: [] };
}
function completion(data = {}) {
  return {
    date: "2026-11-20T00:00+09:00",
    character_name: "단풍이",
    world_name: "루나",
    boss_contents: [
      {
        content_name: "스우",
        cycle: "bossWeekly",
        difficulty: "normal",
        complete_flag: "true",
      },
      {
        content_name: "데미안",
        cycle: "bossWeekly",
        difficulty: "normal",
        complete_flag: "true",
      },
      {
        content_name: "검은마법사",
        cycle: "bossMonthly",
        difficulty: "hard",
        complete_flag: "true",
      },
    ],
    ...data,
  };
}

test("scheduler proposals match character, cycle and difficulty and never import a stale clear", () => {
  const raids = plannedRaids(plan(), now);
  assert.deepEqual(
    schedulerCandidates(completion(), raids, now).map((item) => item.bossId),
    ["lotus", "blackmage"],
  );
  assert.deepEqual(
    schedulerCandidates(completion({ date: "2026-11-18" }), raids, now).map(
      (item) => item.bossId,
    ),
    ["blackmage"],
  );
  assert.deepEqual(
    schedulerCandidates(completion({ date: "2026-10-31" }), raids, now),
    [],
  );
  assert.deepEqual(
    schedulerCandidates(completion({ world_name: "크로아" }), raids, now),
    [],
  );
  assert.deepEqual(
    schedulerCandidates(completion({ date: "2026-11-21" }), raids, now),
    [],
  );
});

test("scheduler import distinguishes registered bosses from completed difficulties", () => {
  const snapshot = completion({
    boss_contents: [
      {
        content_name: "스우", cycle: "bossWeekly", difficulty: "hard",
        registration_flag: "true", complete_flag: "false",
      },
      {
        content_name: "스우", cycle: "bossWeekly", difficulty: "normal",
        registration_flag: "false", complete_flag: "true",
      },
      {
        content_name: "검은마법사", cycle: "bossMonthly", difficulty: "hard",
        registration_flag: true, complete_flag: true,
      },
    ],
  });
  const [lotus, blackMage] = schedulerPlan(snapshot, now);
  assert.deepEqual(lotus.registeredLevels, ["하드"]);
  assert.equal(lotus.clearLevel, "노멀");
  assert.deepEqual(blackMage.registeredLevels, ["하드"]);
  assert.equal(blackMage.clearLevel, "하드");
  assert.deepEqual(
    schedulerPlan({ ...snapshot, date: "2026-11-18" }, now).map(({ bossId }) => bossId),
    ["blackmage"],
  );
});

test("recording and undo preserve the current plan and reject changes from a different reset period", () => {
  const state = plan();
  const candidate = schedulerCandidates(
    completion(),
    plannedRaids(state, now),
    now,
  )[0];
  const receipt = recordClear(state, candidate, now);
  assert.equal(state.parties[0].clearDetails.lotus.source, "nexon");
  assert.equal(state.parties[0].settings.lotus.note, "금요일");
  assert.equal(recordClear(state, candidate, now), null);
  assert.ok(undoClear(state, receipt, now));
  assert.equal(state.parties[0].clears.lotus, undefined);
  state.parties[0].settings.lotus.level = "하드";
  assert.equal(recordClear(state, candidate, now), null);
  assert.equal(
    recordClear(state, { ...candidate, level: "하드" }, now + 7 * 86400000),
    null,
  );
  assert.ok(recordClear(state, { ...candidate, level: "하드" }, now + 1));
  assert.equal(undoClear(state, receipt, now + 2), false);
});
test("undoing an unchecked legacy record restores its period without fabricating a timestamp", () => {
  const state = plan();
  const boss = bosses.find((item) => item.id === "lotus");
  const week = period(boss.cycle, now).key;
  state.parties[0].clears.lotus = week;
  const receipt = recordClear(
    state,
    { name: "단풍이", bossId: "lotus", periodKey: week, done: false },
    now,
  );
  assert.ok(undoClear(state, receipt, now));
  assert.equal(state.parties[0].clears.lotus, week);
  assert.equal(state.parties[0].clearDetails.lotus, undefined);
});

test("undo cannot restore a weekly clear after Thursday midnight even when a monthly action remains valid", () => {
  const state = plan();
  const boundary = Date.parse("2026-11-19T00:00:00+09:00");
  const receipts = plannedRaids(state, boundary - 1)
    .filter((raid) => raid.boss.id !== "damien")
    .map(({ boss }) =>
      recordClear(
        state,
        {
          name: state.parties[0].name,
          bossId: boss.id,
          periodKey: period(boss.cycle, boundary - 1).key,
          done: true,
        },
        boundary - 1,
      ),
    );
  assert.equal(undoClear(state, receipts[0], boundary), false);
  assert.equal(undoClear(state, receipts[1], boundary), true);
});

test("scheduler only requests account-owned characters from Nexon and never returns identifiers", async () => {
  const state = plan();
  const currentDate = new Date(Date.now() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  const calls = [];
  const result = await fetchSchedulerChanges({
    key: "test-key",
    raids: plannedRaids(state),
    signal: new AbortController().signal,
    onProgress() {},
    fetcher: async (url, options) => {
      assert.equal(url.origin, "https://open.api.nexon.com");
      assert.equal(options.headers["x-nxopen-api-key"], "test-key");
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      calls.push(url.pathname);
      if (url.pathname.endsWith("/character/list")) {
        return Response.json({
          account_list: [
            {
              character_list: [
                {
                  character_name: "단풍이",
                  world_name: "루나",
                  ocid: "owner-id",
                },
              ],
            },
          ],
        });
      }
      assert.equal(url.searchParams.get("ocid"), "owner-id");
      return Response.json(completion({ date: currentDate }));
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(result.checked, 1);
  assert.equal(result.candidates.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /owner-id|test-key/);
});
